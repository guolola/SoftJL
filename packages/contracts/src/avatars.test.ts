// Verifies bundled avatar references, profile update boundaries, and the asset size budget.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_AVATARS, avatarUrlSchema } from "./avatars.js";
import { accountProfileUpdateRequestSchema } from "./auth-account.js";
import { projectMemberDtoSchema } from "./projects.js";

test("bundled avatars fit their size budgets and work in profiles and project members", async () => {
  assert.equal(new Set(DEFAULT_AVATARS).size, 12);
  for (const avatar of DEFAULT_AVATARS) {
    assert.equal(accountProfileUpdateRequestSchema.parse({ avatarUrl: avatar }).avatarUrl, avatar);
    assert.equal(avatarUrlSchema.parse(avatar), avatar);
    assert.ok(projectMemberDtoSchema.shape.avatarUrl.safeParse(avatar).success);
    const content = await readFile(new URL(`../../../apps/web/public${avatar}`, import.meta.url));
    assert.ok(content.byteLength <= 128 * 1024, `${avatar} exceeds the avatar size budget`);
    assert.equal(content.subarray(0, 6).toString("ascii"), "GIF89a");
    assert.ok(content.readUInt16LE(6) > 0 && content.readUInt16LE(6) <= 128);
    assert.ok(content.readUInt16LE(8) > 0 && content.readUInt16LE(8) <= 128);
    assert.ok(content.includes(Buffer.from("NETSCAPE2.0")), `${avatar} must retain animation looping`);
    assert.equal(content.at(-1), 0x3b);
  }
});

test("profile updates accept HTTPS uploads and null but reject arbitrary local avatar paths", () => {
  for (const avatarUrl of [null, "https://example.com/avatar.webp", "https://example.com/avatar.gif"]) {
    assert.ok(accountProfileUpdateRequestSchema.safeParse({ avatarUrl }).success);
  }
  for (const avatarUrl of ["/avatars/genshin-furina.svg", "/avatars/wuwa-iuno.svg", "/avatars/chibi-01.svg", "/avatars/chibi-13.svg", "/avatars/../secret.svg", "//example.com/avatar.svg", "http://example.com/avatar.png", "javascript:alert(1)", "data:image/svg+xml,test"]) {
    assert.equal(accountProfileUpdateRequestSchema.safeParse({ avatarUrl }).success, false, String(avatarUrl));
    if (avatarUrl.startsWith("/avatars/chibi-")) assert.equal(avatarUrlSchema.safeParse(avatarUrl).success, false);
  }
});
