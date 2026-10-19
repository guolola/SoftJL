// Verifies shared development configuration without starting services or containers.
import assert from "node:assert/strict";
import test from "node:test";
import { developmentEnvironment } from "./start-development.mjs";

test("core startup uses built-in document preview and the configured service ports", () => {
  const env = developmentEnvironment({ API_PORT: "4201", RENDER_SERVICE_PORT: "4202" });
  assert.equal(env.UML_API_ORIGIN, "http://localhost:4201");
  assert.equal(env.RENDER_SERVICE_BASE_URL, "http://127.0.0.1:4202");
  assert.equal(env.ONLYOFFICE_DOCUMENT_SERVER_URL, undefined);
  assert.equal(env.DATABASE_URL, undefined);
});

test("persistent and external service configuration survives startup defaults", () => {
  const input = { DATABASE_URL: "postgres://localhost/test", UML_API_ORIGIN: "http://localhost:4501", SOFTJL_DEV_ONLYOFFICE: "true", ONLYOFFICE_JWT_SECRET: "configured-secret" };
  const env = developmentEnvironment(input);
  assert.equal(env.DATABASE_URL, input.DATABASE_URL);
  assert.equal(env.UML_API_ORIGIN, input.UML_API_ORIGIN);
  assert.equal(env.ONLYOFFICE_JWT_SECRET, input.ONLYOFFICE_JWT_SECRET);
  assert.equal(env.ONLYOFFICE_DOCUMENT_SERVER_URL, undefined);
});
