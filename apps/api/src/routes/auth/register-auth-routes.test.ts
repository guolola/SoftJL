// Verifies username-only accounts, sessions and authenticator verification.
import assert from "node:assert/strict";
import test from "node:test";
import { defaultAvatarSchema } from "@uml-platform/contracts";
import { generateTotpCodeForTesting } from "../../auth/totp.js";
import { createApiServer } from "../../index.js";

test("username signup activates immediately, is unique regardless of case, and rejects retired email fields", async () => {
  const app = await createTestApp();
  try {
    const input = { username: " Account_001 ", password: "password-123", displayName: "Account" };
    const created = await app.inject({ method: "POST", url: "/api/auth/register", payload: input });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().user.username, "account_001");
    assert.equal(created.json().user.status, "active");
    assert.ok(defaultAvatarSchema.safeParse(created.json().user.avatarUrl).success);
    assert.equal("email" in created.json().user, false);
    assert.equal("verification" in created.json(), false);
    const duplicate = await app.inject({ method: "POST", url: "/api/auth/register", payload: { ...input, username: "ACCOUNT_001" } });
    assert.equal(duplicate.statusCode, 409);
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { identifier: "ACCOUNT_001", password: input.password } });
    assert.equal(login.statusCode, 200);
    assert.equal(login.json().user.avatarUrl, created.json().user.avatarUrl);
    const oldSignup = await app.inject({ method: "POST", url: "/api/auth/register", payload: { ...input, username: "another", email: "old@example.com" } });
    assert.equal(oldSignup.statusCode, 400);
    const oldLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { identifier: "old@example.com", password: input.password } });
    assert.equal(oldLogin.statusCode, 400);
    for (const url of ["/api/auth/verify-email", "/api/auth/resend-verification", "/api/auth/forgot-password", "/api/auth/reset-password"]) {
      assert.equal((await app.inject({ method: "POST", url, payload: {} })).statusCode, 404);
    }
  } finally { await app.close(); }
});

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

test("account security exposes login events and enforces TOTP MFA challenge", async () => {
  const app = await createTestApp();

  const registered = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      username: "security_user",
      password: "password-123",
      displayName: "Security User",
    },
  });
  const cookie = getSessionCookie(registered);


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
