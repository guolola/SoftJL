// Verifies current-account profile extensions that depend on authenticated state.
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AVATARS, defaultAvatarSchema } from "@uml-platform/contracts";
import Fastify from "fastify";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { SESSION_COOKIE_NAME } from "../../auth/session-cookie.js";
import { createGenerationUsageService } from "../../generation/generation-usage.js";
import { hashPassword } from "../../security/password-hashing.js";
import { registerAccountRoutes } from "./register-account-routes.js";

test("new users retain their random avatar and can save a different bundled avatar", async () => {
  const authStore = createInMemoryAuthStore();
  const user = authStore.createUser({ username: "avatar_user", displayName: "Avatar", passwordHash: "hash" });
  assert.ok(user);
  assert.ok(defaultAvatarSchema.safeParse(user.avatarUrl).success);
  assert.equal(authStore.getUser(user.id)?.avatarUrl, user.avatarUrl);
  const session = authStore.createSession({ userId: user.id, ipAddress: null, userAgent: null });
  const app = Fastify({ logger: false });
  registerAccountRoutes({ app, authStore, avatarStorageDir: "data/test-avatars" });
  try {
    const avatarUrl = user.avatarUrl === DEFAULT_AVATARS[0] ? DEFAULT_AVATARS[1] : DEFAULT_AVATARS[0];
    const response = await app.inject({ method: "PATCH", url: "/api/account/profile",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${session.id}` }, payload: { avatarUrl } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().user.avatarUrl, avatarUrl);
    assert.equal(authStore.getUser(user.id)?.avatarUrl, avatarUrl);
  } finally { await app.close(); }
});

test("account onboarding state follows the first owned project across sessions", async () => {
  const authStore = createInMemoryAuthStore();
  const owner = authStore.createUser({
    username: "guide_owner", displayName: "Guide Owner",
    passwordHash: hashPassword("guide-password"),
  });
  const invitee = authStore.createUser({
    username: "guide_invitee", displayName: "Guide Invitee",
    passwordHash: hashPassword("guide-password"),
  });
  assert.ok(owner && invitee);
  const firstSession = authStore.createSession({ userId: owner.id, ipAddress: null, userAgent: "first" });
  const secondSession = authStore.createSession({ userId: owner.id, ipAddress: null, userAgent: "second" });
  const inviteeSession = authStore.createSession({ userId: invitee.id, ipAddress: null, userAgent: "invitee" });
  const app = Fastify({ logger: false });
  registerAccountRoutes({ app, authStore, avatarStorageDir: "data/test-avatars" });
  const request = (sessionId: string, method: "GET" | "PUT" = "GET", payload?: unknown) => app.inject({
    method, url: "/api/account/onboarding",
    headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` },
    ...(payload ? { payload } : {}),
  });

  assert.equal((await app.inject({ method: "GET", url: "/api/account/onboarding" })).statusCode, 401);
  assert.deepEqual((await request(firstSession.id)).json(), {
    emptyWorkspace: null, firstProject: null, firstProjectId: null,
  });
  const first = authStore.createProject({
    ownerUserId: owner.id, name: "First", description: null,
  }).project;
  authStore.createMember({
    projectId: first.id, userId: invitee.id, username: invitee.username,
    displayName: invitee.displayName, role: "viewer", status: "active",
    invitedByUserId: owner.id, invitedAt: null, joinedAt: new Date().toISOString(),
  });
  authStore.createProject({
    ownerUserId: owner.id, name: "Second", description: null,
  });
  assert.equal((await request(secondSession.id)).json().firstProjectId, first.id);
  assert.equal((await request(inviteeSession.id)).json().firstProjectId, null);
  await request(inviteeSession.id, "PUT", { tour: "first-project", outcome: "completed" });
  const inviteeFirst = authStore.createProject({
    ownerUserId: invitee.id, name: "Invitee's first", description: null,
  }).project;
  assert.deepEqual((await request(inviteeSession.id)).json(), {
    emptyWorkspace: null, firstProject: "completed", firstProjectId: inviteeFirst.id,
  });

  assert.equal((await request(firstSession.id, "PUT", {
    tour: "empty-workspace", outcome: "skipped",
  })).statusCode, 200);
  assert.equal((await request(secondSession.id, "PUT", {
    tour: "first-project", outcome: "completed",
  })).statusCode, 200);
  assert.deepEqual((await request(firstSession.id)).json(), {
    emptyWorkspace: "skipped", firstProject: "completed", firstProjectId: first.id,
  });
  assert.equal((await request(firstSession.id, "PUT", {
    tour: "first-project", outcome: "invalid",
  })).statusCode, 400);
  await app.close();
});

test("account profile includes unlimited generation usage for regular users", async () => {
  const authStore = createInMemoryAuthStore();
  const user = authStore.createUser({
    username: "student",
    displayName: "Student",
    passwordHash: hashPassword("student-password"),
  });
  assert.ok(user);
  const session = authStore.createSession({
    userId: user.id,
    ipAddress: "203.0.113.20",
    userAgent: "node:test",
  });
  const generationUsage = createGenerationUsageService({
    guestUsername: "guest",
    now: () => new Date("2026-05-25T08:00:00.000Z"),
  });
  await generationUsage.recordGenerationUsage({
    userId: user.id,
    username: user.username,
    ipAddress: "203.0.113.20",
    taskType: "requirements_to_uml",
  });
  const app = Fastify({ logger: false });
  registerAccountRoutes({
    app,
    authStore,
    avatarStorageDir: "data/test-avatars",
    generationUsage,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/account/profile",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${session.id}`,
    },
    remoteAddress: "203.0.113.20",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().generationUsage, {
    usedToday: 1,
    limit: null,
    remaining: null,
    windowSeconds: 86400,
    limited: false,
    scope: "user",
  });

  await app.close();
});

test("account profile includes remaining daily generation usage for guest users", async () => {
  const authStore = createInMemoryAuthStore();
  const user = authStore.createUser({
    username: "guest",
    displayName: "Guest",
    passwordHash: hashPassword("guest"),
  });
  assert.ok(user);
  const session = authStore.createSession({
    userId: user.id,
    ipAddress: "203.0.113.30",
    userAgent: "node:test",
  });
  const generationUsage = createGenerationUsageService({
    guestUsername: "guest",
    guestDailyLimit: 5,
    now: () => new Date("2026-05-25T08:00:00.000Z"),
  });
  await generationUsage.recordGenerationUsage({
    userId: user.id,
    username: user.username,
    ipAddress: "203.0.113.30",
    taskType: "requirements_to_uml",
  });
  const app = Fastify({ logger: false });
  registerAccountRoutes({
    app,
    authStore,
    avatarStorageDir: "data/test-avatars",
    generationUsage,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/account/profile",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${session.id}`,
    },
    remoteAddress: "203.0.113.30",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().generationUsage, {
    usedToday: 1,
    limit: 5,
    remaining: 4,
    windowSeconds: 86400,
    limited: true,
    scope: "visitor",
  });

  await app.close();
});
