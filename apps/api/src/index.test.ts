// Verifies API assembly behavior through the assembled server.

import assert from "node:assert/strict";
import test from "node:test";

import { createMockLlmTransport, createTestApiServer } from "../tests/fixtures/api-run-fixtures.js";

test("api exposes health under root and /api for reverse proxy checks", async () => {
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
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

  const rootHealth = await app.inject({
    method: "GET",
    url: "/health",
  });
  const apiHealth = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(rootHealth.statusCode, 200);
  assert.equal(apiHealth.statusCode, 200);
  assert.equal(rootHealth.json().status, "ok");
  assert.equal(apiHealth.json().status, "ok");

  await app.close();
});

test("api exposes version details under root and /api for deployment checks", async () => {
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
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

  const rootVersion = await app.inject({
    method: "GET",
    url: "/version",
  });
  const apiVersion = await app.inject({
    method: "GET",
    url: "/api/version",
  });

  assert.equal(rootVersion.statusCode, 200);
  assert.equal(apiVersion.statusCode, 200);

  for (const payload of [rootVersion.json(), apiVersion.json()]) {
    assert.equal(payload.status, "ok");
    assert.equal(payload.renderServiceBaseUrl, "http://127.0.0.1:4002");
    assert.equal(payload.features.supportsDesignTableDiagram, true);
    assert.equal(typeof payload.runtimeCwd, "string");
    assert.ok(payload.runtimeCwd.length > 0);
    assert.equal(typeof payload.startedAt, "string");
  }

  await app.close();
});
