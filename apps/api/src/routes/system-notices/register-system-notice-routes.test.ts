// Verifies authenticated notice visibility and personal read/dismiss receipts.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { registerSystemNoticeRoutes } from "./register-system-notice-routes.js";
import { createInMemorySystemNoticeStore } from "../../system-notices/records/system-notice-store.js";

async function sessionCookie(
  authStore: AuthStore,
  userId: string,
  name: "uml_session" | "uml_admin_session" = "uml_session",
) {
  const session = await authStore.createSession({
    userId,
    ipAddress: "127.0.0.1",
    userAgent: "system-notice-test",
  });
  return `${name}=${encodeURIComponent(session.id)}`;
}

async function createNoticeRouteTestApp() {
  const app = Fastify({ logger: false });
  const authStore = createInMemoryAuthStore();
  const user = authStore.createUser({
    username: "user",
    displayName: "User",
    passwordHash: "hash",
  });
  const other = authStore.createUser({
    username: "other",
    displayName: "Other",
    passwordHash: "hash",
  });
  const admin = authStore.createUser({
    username: "admin",
    displayName: "Admin",
    passwordHash: "hash",
    systemRoles: ["super_admin"],
  });
  assert.ok(user);
  assert.ok(other);
  assert.ok(admin);
  authStore.updateUser(admin.id, {
    mfaEnabled: true,
    mfaSecret: "JBSWY3DPEHPK3PXP",
  });
  const systemNotices = createInMemorySystemNoticeStore([
    {
      title: "Draft notice",
      type: "feature_update",
      status: "draft",
      icon: null,
      publishedAt: null,
      contentBlocks: [],
    },
    {
      title: "Older published notice",
      type: "model_update",
      status: "published",
      icon: null,
      publishedAt: "2026-05-31T00:00:00.000Z",
      contentBlocks: [],
    },
    {
      title: "Latest important notice",
      type: "important",
      status: "published",
      icon: "!",
      publishedAt: "2026-06-01T00:00:00.000Z",
      contentBlocks: [{ kind: "paragraph", text: "Important body" }],
    },
  ]);
  registerSystemNoticeRoutes({ app, authStore, systemNotices });
  return {
    app,
    authStore,
    user,
    other,
    admin,
    userCookie: await sessionCookie(authStore, user.id),
    otherCookie: await sessionCookie(authStore, other.id),
    systemNotices,
    adminCookie: await sessionCookie(authStore, admin.id, "uml_admin_session"),
  };
}

test("system notices require login and only expose published notices sorted newest first", async () => {
  const { app, userCookie } = await createNoticeRouteTestApp();

  const unauthenticated = await app.inject({
    method: "GET",
    url: "/api/system-notices",
  });
  const response = await app.inject({
    method: "GET",
    url: "/api/system-notices",
    headers: { cookie: userCookie },
  });

  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json().notices.map((notice: { title: string }) => notice.title),
    ["Latest important notice", "Older published notice"],
  );
  assert.equal(response.json().unreadCount, 2);
  assert.doesNotMatch(response.body, /Draft notice/);

  await app.close();
});

test("system notice read receipts are scoped to the current user", async () => {
  const { app, userCookie, otherCookie } = await createNoticeRouteTestApp();

  const read = await app.inject({
    method: "POST",
    url: "/api/system-notices/read",
    headers: { cookie: userCookie },
    payload: {},
  });
  const userList = await app.inject({
    method: "GET",
    url: "/api/system-notices",
    headers: { cookie: userCookie },
  });
  const otherList = await app.inject({
    method: "GET",
    url: "/api/system-notices",
    headers: { cookie: otherCookie },
  });

  assert.equal(read.statusCode, 200);
  assert.equal(userList.json().unreadCount, 0);
  assert.equal(otherList.json().unreadCount, 2);

  await app.close();
});

test("dismissed notices stay hidden only for the current user, including read responses", async () => {
  const { app, userCookie, otherCookie, systemNotices } = await createNoticeRouteTestApp();
  try {
    const initial = await app.inject({ method: "GET", url: "/api/system-notices", headers: { cookie: userCookie } });
    const id = initial.json().notices[0].id;
    const url = `/api/system-notices/${id}/dismiss`;
    assert.equal((await app.inject({ method: "POST", url })).statusCode, 401);
    for (let attempt = 0; attempt < 2; attempt++) {
      const dismissed = await app.inject({ method: "POST", url, headers: { cookie: userCookie } });
      assert.equal(dismissed.statusCode, 200);
      assert.equal(dismissed.json().notices.length, 1);
      assert.equal(dismissed.json().unreadCount, 1);
    }
    const refreshed = await app.inject({ method: "GET", url: "/api/system-notices", headers: { cookie: userCookie } });
    assert.equal(refreshed.json().notices.some((notice: { id: string }) => notice.id === id), false);
    const read = await app.inject({ method: "POST", url: "/api/system-notices/read", headers: { cookie: userCookie }, payload: {} });
    assert.equal(read.json().notices.length, 1);
    assert.equal(read.json().unreadCount, 0);
    const other = await app.inject({ method: "GET", url: "/api/system-notices", headers: { cookie: otherCookie } });
    assert.equal(other.json().notices.length, 2);
    assert.equal(other.json().unreadCount, 2);
    const allNotices = await systemNotices.listAll();
    assert.equal(allNotices.length, 3);
    const draftId = allNotices.find(notice => notice.status === "draft")!.id;
    for (const unknown of [draftId, "missing"]) {
      assert.equal((await app.inject({ method: "POST", url: `/api/system-notices/${unknown}/dismiss`, headers: { cookie: userCookie } })).statusCode, 404);
    }
  } finally { await app.close(); }
});
