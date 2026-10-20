// Verifies bundled avatar references, profile update boundaries, and the asset size budget.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CHARACTER_AVATARS, DEFAULT_AVATARS, avatarUrlSchema } from "./avatars.js";
import { accountProfileUpdateRequestSchema } from "./auth-account.js";
import { projectMemberDtoSchema } from "./projects.js";

test("bundled avatars fit their size budgets and work in profiles and project members", async () => {
  assert.equal(new Set(DEFAULT_AVATARS).size, 12);
  for (const game of ["genshin", "wuwa"]) assert.equal(CHARACTER_AVATARS.filter(avatar => avatar.game === game).length, 6);
  for (const avatar of DEFAULT_AVATARS) {
    assert.equal(accountProfileUpdateRequestSchema.parse({ avatarUrl: avatar }).avatarUrl, avatar);
    assert.equal(avatarUrlSchema.parse(avatar), avatar);
    assert.ok(projectMemberDtoSchema.shape.avatarUrl.safeParse(avatar).success);
    const content = await readFile(new URL(`../../../apps/web/public${avatar}`, import.meta.url));
    assert.ok(content.byteLength <= 6144, `${avatar} exceeds the avatar size budget`);
    assert.match(content.toString(), /viewBox="0 0 128 128"/u);
    assert.doesNotMatch(content.toString(), /<script|<image|<foreignObject|href=|data:/iu);
  }
});

test("profile updates accept HTTPS uploads and null but reject arbitrary local avatar paths", () => {
  for (const avatarUrl of [null, "https://example.com/avatar.webp"]) {
    assert.ok(accountProfileUpdateRequestSchema.safeParse({ avatarUrl }).success);
  }
  for (const avatarUrl of ["/avatars/chibi-01.svg", "/avatars/chibi-13.svg", "/avatars/../secret.svg", "//example.com/avatar.svg", "http://example.com/avatar.png", "javascript:alert(1)", "data:image/svg+xml,test"]) {
    assert.equal(accountProfileUpdateRequestSchema.safeParse({ avatarUrl }).success, false, String(avatarUrl));
    if (avatarUrl.startsWith("/avatars/chibi-")) assert.equal(avatarUrlSchema.safeParse(avatarUrl).success, false);
  }
});
