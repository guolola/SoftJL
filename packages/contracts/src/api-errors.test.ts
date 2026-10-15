// Verifies language-neutral API failures carry stable localization inputs.
import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorResponseSchema } from "./api-errors.js";

test("API errors expose stable codes without localized message text", () => {
  const response = apiErrorResponseSchema.parse({
    error: {
      code: "PROJECT_NOT_FOUND",
      category: "not_found",
      retryable: false,
      params: { projectId: "project-1" },
    },
    requestId: "request-1",
  });
  assert.equal(response.error.code, "PROJECT_NOT_FOUND");
  assert.equal("message" in response.error, false);
});
