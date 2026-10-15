// Verifies auth recovery and verification endpoints before UI pages depend on them.
import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { generateTotpCodeForTesting } from "../../auth/totp.js";
import { createApiServer } from "../../index.js";
import { hashPassword } from "../../security/password-hashing.js";

function assertApiErrorCode(response: { json(): unknown }, code: string) {
  const body = response.json() as { error?: { code?: string; retryable?: boolean } };
  assert.equal(body.error?.code, code);
  assert.equal(typeof body.error?.retryable, "boolean");
}

function getSessionCookie(response: { headers: Record<string, unknown> }) {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : String(raw ?? "");
  assert.match(value, /uml_session=/);
  return value.split(";")[0];
}

function getNamedCookie(response: { headers: Record<string, unknown> }, name: string) {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : String(raw ?? "");
  assert.match(value, new RegExp(`${name}=`));
  return value.split(";")[0];
}

async function createTestApp() {
  return createApiServer({
    llmTransport: {
      streamChatCompletion: async function* () {
        yield "{}";
      },
    },
    renderClient: async () => ({
      svg: "<svg />",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 0,
        durationMs: 1,
      },
    }),
  });
}

test("auth registration issues an email verification token and verify-email marks the user verified", async () => {
  const app = await createTestApp();

  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "verify@example.com",
      username: "verify_user",
      password: "password-123",
      displayName: "Verify User",
    },
  });
  assert.equal(registered.statusCode, 201);
  const cookie = getSessionCookie(registered);
  assert.equal(registered.json().user.emailVerified, false);
  assert.equal(registered.json().user.status, "pending_email_verification");
  assert.equal(typeof registered.json().verification.devToken, "string");

  const verified = await app.inject({
    method: "POST",
    url: "/api/auth/verify-email",
    payload: {
      token: registered.json().verification.devToken,
    },
  });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.json().user.emailVerified, true);
  assert.equal(verified.json().user.status, "active");



  const reused = await app.inject({
    method: "POST",
    url: "/api/auth/verify-email",
    payload: {
      token: registered.json().verification.devToken,
    },
  });
  assert.equal(reused.statusCode, 400);

  const duplicateUsername = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "verify-other@example.com",
      username: "verify_user",
      password: "password-123",
      displayName: "Verify Other",
    },
  });
  assert.equal(duplicateUsername.statusCode, 409);
  assertApiErrorCode(duplicateUsername, "AUTH_ACCOUNT_EXISTS");

  await app.close();
});

test("auth reset password token revokes old sessions and accepts the new password", async () => {
  const app = await createTestApp();

  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "reset@example.com",
      username: "reset_user",
      password: "password-123",
      displayName: "Reset User",
    },
  });
  const oldCookie = getSessionCookie(registered);
  await app.inject({
    method: "POST",
    url: "/api/auth/verify-email",
    payload: {
      token: registered.json().verification.devToken,
    },
  });

  const requested = await app.inject({
    method: "POST",
    url: "/api/auth/forgot-password",
    payload: {
      email: "reset@example.com",
    },
  });
  assert.equal(requested.statusCode, 200);
  assert.equal(typeof requested.json().reset.devToken, "string");

  const reset = await app.inject({
    method: "POST",
    url: "/api/auth/reset-password",
    payload: {
      token: requested.json().reset.devToken,
      newPassword: "password-456",
    },
  });
  assert.equal(reset.statusCode, 200);
  assert.equal(reset.json().revokedSessionCount, 1);

  const oldSession = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: oldCookie },
  });
  assert.equal(oldSession.statusCode, 401);

  const oldLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "reset@example.com",
      password: "password-123",
    },
  });
  assert.equal(oldLogin.statusCode, 401);

  const newLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "reset@example.com",
      password: "password-456",
    },
  });
  assert.equal(newLogin.statusCode, 200);

  await app.close();
});

test("auth login requires email verification", async () => {
  const app = await createTestApp();

  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "unverified@example.com",
      username: "unverified_user",
      password: "password-123",
      displayName: "Unverified User",
    },
  });

  const blocked = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "unverified@example.com",
      password: "password-123",
    },
  });
  assert.equal(blocked.statusCode, 403);
  assertApiErrorCode(blocked, "AUTH_EMAIL_VERIFICATION_REQUIRED");
  assert.equal(registered.json().user.status, "pending_email_verification");

  const verified = await app.inject({
    method: "POST",
    url: "/api/auth/verify-email",
    payload: {
      token: registered.json().verification.devToken,
    },
  });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.json().user.status, "active");

  const allowed = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email: "unverified@example.com",
      password: "password-123",
    },
  });
  assert.equal(allowed.statusCode, 200);

  const allowedByUsername = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      identifier: "unverified_user",
      password: "password-123",
    },
  });
  assert.equal(allowedByUsername.statusCode, 200);

  await app.close();
});

test("account security exposes login events and enforces TOTP MFA challenge", async () => {
  const app = await createTestApp();

  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: "security@example.com",
      username: "security_user",
      password: "password-123",
      displayName: "Security User",
    },
  });
  const cookie = getSessionCookie(registered);
  await app.inject({
    method: "POST",
    url: "/api/auth/verify-email",
    payload: {
      token: registered.json().verification.devToken,
    },
  });

  const loginEvents = await app.inject({
    method: "GET",
    url: "/api/account/login-events",
    headers: { cookie },
  });
  assert.equal(loginEvents.statusCode, 200);
  assert.equal(loginEvents.json().events[0].outcome, "success");

  const setup = await app.inject({
    method: "POST",
    url: "/api/account/mfa/setup",
    headers: { cookie },
  });
  assert.equal(setup.statusCode, 200);
  assert.match(setup.json().otpauthUri, /^otpauth:\/\/totp\//);

  const code = generateTotpCodeForTesting(setup.json().secret);
  const confirm = await app.inject({
    method: "POST",
    url: "/api/account/mfa/confirm",
    headers: { cookie },
    payload: { code },
  });
  assert.equal(confirm.statusCode, 200);
  assert.equal(confirm.json().mfa.enabled, true);
  assert.equal(confirm.json().mfa.enforcement, "totp");

  const challenged = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      identifier: "security_user",
      password: "password-123",
    },
  });
  assert.equal(challenged.statusCode, 202);
  assert.equal(challenged.json().mfa.method, "totp");

  const verified = await app.inject({
    method: "POST",
    url: "/api/auth/mfa/verify",
    payload: {
      challengeId: challenged.json().mfa.challengeId,
      code: generateTotpCodeForTesting(setup.json().secret),
    },
  });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.json().user.mfaEnabled, true);

  await app.close();
});
