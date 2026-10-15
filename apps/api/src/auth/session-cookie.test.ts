// Verifies session cookie security flags used by auth/account routes.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { setSessionCookie } from "./session-cookie.js";

function setCookieForEnv(env: Record<string, string | undefined>) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    UML_SESSION_SAMESITE: process.env.UML_SESSION_SAMESITE,
    UML_SESSION_SECURE: process.env.UML_SESSION_SECURE,
  };
  Object.assign(process.env, env);
  const app = Fastify();
  app.get("/", async (_request, reply) => {
    setSessionCookie(reply, "session-1");
    return { ok: true };
  });
  return app.inject({ method: "GET", url: "/" }).finally(async () => {
    await app.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("session cookie supports explicit cross-site admin deployments", async () => {
  const response = await setCookieForEnv({
    NODE_ENV: "production",
    UML_SESSION_SAMESITE: "None",
    UML_SESSION_SECURE: "true",
  });
  const cookie = String(response.headers["set-cookie"] ?? "");
  assert.match(cookie, /SameSite=None/i);
  assert.match(cookie, /Secure/i);
});

test("session cookie rejects SameSite=None without Secure", async () => {
  const response = await setCookieForEnv({
    NODE_ENV: "production",
    UML_SESSION_SAMESITE: "None",
    UML_SESSION_SECURE: "false",
  });
  assert.equal(response.statusCode, 500);
  assert.match(response.body, /SameSite=None requires UML_SESSION_SECURE=true/i);
});
