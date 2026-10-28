// Verifies API access behavior through the assembled server.

import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryAuthStore } from "../../src/auth/in-memory-auth-store.js";

import type { DocumentLibrary } from "../../src/documents/library/document-library.js";
import { createProviderConfigStore } from "../../src/provider-configs/provider-config-store.js";
import { createRunRecordStore } from "../../src/runs/records/run-record-store.js";

import { assertApiErrorCode, createMockLlmTransport, createTestApiServer } from "../fixtures/api-run-fixtures.js";

test("api rejects plaintext provider connection tests by default", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async (input) => {
    // Public catalog refreshes are independent of the provider access guard.
    if (new URL(input instanceof Request ? input.url : String(input)).hostname === "models.dev") {
      return new Response("catalog unavailable", { status: 503 });
    }
    fetchCalls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
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

    const response = await app.inject({
      method: "POST",
      url: "/api/provider/test",
      payload: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-test",
        model: "claude-opus-4-6-thinking",
      },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(fetchCalls, 0);
    assertApiErrorCode(response, "RESOURCE_NOT_FOUND");

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("api rejects plaintext provider connection tests in production", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async (input) => {
    // Production startup may refresh public metadata without calling the provider.
    if (new URL(input instanceof Request ? input.url : String(input)).hostname === "models.dev") {
      return new Response("catalog unavailable", { status: 503 });
    }
    fetchCalls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const app = await createTestApiServer({
      llmTransport: createMockLlmTransport(),
      authStore: createInMemoryAuthStore(),
      providerConfigStore: createProviderConfigStore({
        secret: "test-secret",
      }),
      runRecordStore: createRunRecordStore(),
      documentLibrary: {} as DocumentLibrary,
      renderClient: async () => ({
        svg: "<svg />",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: 0,
          durationMs: 1,
        },
      }),
      nodeEnv: "production",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/provider/test",
      payload: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-test",
        model: "claude-opus-4-6-thinking",
      },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(fetchCalls, 0);
    assertApiErrorCode(response, "RESOURCE_NOT_FOUND");

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
