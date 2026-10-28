// Protects community API assembly while exposing personal model metadata controls.
import assert from "node:assert/strict";
import test from "node:test";
import { createMockLlmTransport, createTestApiServer } from "../fixtures/api-run-fixtures.js";

test("community assembly registers personal model metadata and keeps hosted management routes absent", async (t) => {
  const app = await createTestApiServer({ llmTransport: createMockLlmTransport() });
  t.after(() => app.close());

  // Authentication failures distinguish registered personal routes from excluded endpoints.
  for (const method of ["GET", "PUT"] as const) {
    const response = await app.inject({ method, url: "/api/provider-configs/personal/capacities" });
    assert.equal(response.statusCode, 401, `${method} personal model metadata`);
  }
  for (const url of ["/api/admin/model-catalog", "/api/admin/providers", "/api/billing/summary", "/api/billing/skus"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 404, url);
  }
  for (const url of ["/api/billing/orders", "/api/admin/prompt-runtime"]) {
    const response = await app.inject({ method: "POST", url, payload: {} });
    assert.equal(response.statusCode, 404, url);
  }
});
