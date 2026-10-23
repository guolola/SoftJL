// Verifies API server behavior through the assembled server.

import assert from "node:assert/strict";
import test from "node:test";

import { MANAGED_PROVIDER_SETTINGS, TEST_REQUIREMENT_BASELINE, USECASE_MODEL_JSON, assertApiErrorCode, createMockLlmTransport, createTestApiServer } from "../fixtures/api-run-fixtures.js";

test("api rejects invalid start requests with 400", async () => {
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "",
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /providerSettings\.providerConfigId/i);

  const designResponse = await app.inject({
    method: "POST",
    url: "/api/design-runs",
    payload: {
      requirementBaseline: TEST_REQUIREMENT_BASELINE,
      requirementModels: JSON.parse(USECASE_MODEL_JSON).models,
      requirementModelTraceability: [],
      selectedDiagrams: ["sequence"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(designResponse.statusCode, 400);
  assert.match(designResponse.body, /requirementModelTraceability/i);

  await app.close();
});

test("api reports empty JSON request bodies as 400 instead of 500", async () => {
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
  });

  const response = await app.inject({
    method: "DELETE",
    url: "/api/projects/project-a/documents/document-a",
    headers: {
      "content-type": "application/json",
    },
  });

  assert.equal(response.statusCode, 400);
  assertApiErrorCode(response, "VALIDATION_FAILED");

  await app.close();
});

test("api production startup requires DATABASE_URL unless stores are injected", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    await assert.rejects(
      () =>
        createTestApiServer({
          nodeEnv: "production",
        }),
      /DATABASE_URL is required in production/,
    );
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});

test("api applies the configured CORS origin allowlist", async () => {
  const originalCorsOrigins = process.env.API_CORS_ORIGINS;
  process.env.API_CORS_ORIGINS = "https://app.example.com,http://localhost:3000";

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

  try {
    const allowed = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "https://app.example.com" },
    });
    const blocked = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "https://evil.example.com" },
    });

    assert.equal(allowed.statusCode, 200);
    assert.equal(
      allowed.headers["access-control-allow-origin"],
      "https://app.example.com",
    );
    assert.match(
      String(allowed.headers["access-control-expose-headers"] ?? ""),
      /Content-Disposition/i,
    );
    assert.equal(allowed.headers["access-control-allow-credentials"], "true");
    assert.equal(blocked.statusCode, 200);
    assert.equal(blocked.headers["access-control-allow-origin"], undefined);
  } finally {
    await app.close();
    if (originalCorsOrigins === undefined) {
      delete process.env.API_CORS_ORIGINS;
    } else {
      process.env.API_CORS_ORIGINS = originalCorsOrigins;
    }
  }
});
