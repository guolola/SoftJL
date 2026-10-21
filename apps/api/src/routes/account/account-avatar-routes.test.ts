// Verifies avatar upload validation and byte-preserving animated image delivery.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { SESSION_COOKIE_NAME } from "../../auth/session-cookie.js";
import { registerAccountRoutes } from "./register-account-routes.js";

test("avatar uploads retain GIF animation bytes and enforce type, size, and authentication", async (t) => {
  const avatarStorageDir = await mkdtemp(join(tmpdir(), "uml-avatar-"));
  const app = Fastify({ logger: false });
  await app.register(multipart);
  const authStore = createInMemoryAuthStore();
  const user = authStore.createUser({ username: "gif_user", displayName: "GIF", passwordHash: "hash" });
  assert.ok(user);
  const session = authStore.createSession({ userId: user.id, ipAddress: null, userAgent: null });
  registerAccountRoutes({ app, authStore, avatarStorageDir });
  const boundary = "avatar-test-boundary";
  const upload = (content: Buffer, contentType = "image/gif", authenticated = true) => app.inject({
    method: "POST", url: "/api/account/avatar",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      ...(authenticated ? { cookie: `${SESSION_COOKIE_NAME}=${session.id}` } : {}),
    },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="avatar.gif"\r\nContent-Type: ${contentType}\r\n\r\n`),
      content, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  try {
    const animated = await readFile(new URL("../../../../web/public/avatars/momonga-tail-wag.gif", import.meta.url));
    const gif87a = Buffer.from("R0lGODdhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGocAAAAASUVORK5CYII=", "base64");
    for (const [label, content, mime, extension] of [
      ["animated GIF89a", animated, "image/gif", ".gif"],
      ["GIF87a", gif87a, "image/gif", ".gif"],
      ["PNG", png, "image/png", ".png"],
    ] as const) {
      await t.test(`uploads and serves ${label} unchanged`, async () => {
        const response = await upload(content, mime);
        assert.equal(response.statusCode, 200, response.body);
        const avatarUrl = response.json().user.avatarUrl;
        assert.ok(avatarUrl.endsWith(extension));
        assert.equal(authStore.getUser(user.id)?.avatarUrl, avatarUrl);
        const url = new URL(avatarUrl);
        const stored = await readFile(join(avatarStorageDir, url.pathname.split("/").at(-1)!));
        assert.deepEqual(stored, content);
        const served = await app.inject({ method: "GET", url: url.pathname });
        assert.equal(served.statusCode, 200);
        assert.equal(served.headers["content-type"], mime);
        assert.deepEqual(served.rawPayload, content);
      });
    }
    const savedAvatar = authStore.getUser(user.id)?.avatarUrl;
    await t.test("rejects incorrect signatures, unsupported types, and GIFs over 2 MB", async () => {
      for (const [content, mime] of [
        [png, "image/gif"], [animated, "image/png"],
        [Buffer.from("GIF88a-invalid"), "image/gif"], [Buffer.from("<svg/>"), "image/svg+xml"],
        [Buffer.concat([animated, Buffer.alloc(2 * 1024 * 1024)]), "image/gif"],
      ] as const) {
        const response = await upload(content, mime);
        assert.equal(response.statusCode, 400, response.body);
        assert.equal(authStore.getUser(user.id)?.avatarUrl, savedAvatar);
      }
    });
    await t.test("requires authentication for GIF upload", async () => {
      assert.equal((await upload(animated, "image/gif", false)).statusCode, 401);
      assert.equal(authStore.getUser(user.id)?.avatarUrl, savedAvatar);
    });
  } finally {
    await app.close();
    await rm(avatarStorageDir, { recursive: true, force: true });
  }
});
