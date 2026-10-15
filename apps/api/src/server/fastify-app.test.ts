// Verifies that the HTTP boundary returns stable, non-localized failures.
import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorResponseSchema } from "@uml-platform/contracts";
import { createConfiguredFastifyApp } from "./fastify-app.js";

test("normalizes legacy route errors without exposing their message", async () => {
  const app = await createConfiguredFastifyApp();
  app.get("/legacy-error", (_request, reply) => reply.code(409).send({
    message: "数据库外键 project_workspace_states_source_run_id_fkey 失败",
  }));

  const response = await app.inject({ method: "GET", url: "/legacy-error" });
  const body = apiErrorResponseSchema.parse(response.json());
  assert.equal(response.statusCode, 409);
  assert.equal(body.error.code, "RESOURCE_CONFLICT");
  assert.equal("message" in body.error, false);
  assert.doesNotMatch(JSON.stringify(body), /source_run_id_fkey/u);
  await app.close();
});

test("does not expose unexpected exception text", async () => {
  const app = await createConfiguredFastifyApp();
  app.get("/unexpected-error", async () => {
    throw new Error("secret provider credential failed");
  });

  const response = await app.inject({ method: "GET", url: "/unexpected-error" });
  const body = apiErrorResponseSchema.parse(response.json());
  assert.equal(response.statusCode, 500);
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.ok(body.requestId);
  assert.doesNotMatch(JSON.stringify(body), /secret provider/u);
  await app.close();
});

test("preserves structured business errors and adds a request id", async () => {
  const app = await createConfiguredFastifyApp();
  app.get("/structured-error", (_request, reply) => reply.code(409).send({
    error: {
      code: "REQUIREMENT_REVIEWS_PENDING",
      category: "conflict",
      retryable: false,
      params: { count: 2 },
      details: { ruleIds: ["r1", "r2"] },
    },
  }));

  const response = await app.inject({ method: "GET", url: "/structured-error" });
  const body = apiErrorResponseSchema.parse(response.json());
  assert.equal(response.statusCode, 409);
  assert.equal(body.error.code, "REQUIREMENT_REVIEWS_PENDING");
  assert.deepEqual(body.error.params, { count: 2 });
  assert.deepEqual(body.error.details?.ruleIds, ["r1", "r2"]);
  assert.ok(body.requestId);
  await app.close();
});
