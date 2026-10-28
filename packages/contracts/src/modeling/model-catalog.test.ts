// Verifies current catalog provenance and rejects retired metadata sources at shared boundaries.
import test from "node:test";
import assert from "node:assert/strict";
import { modelCapacitySchema, modelCapacityInputSchema } from "./model-catalog.js";

test("accepts Models.dev capacity and rejects retired catalog provenance", () => {
  const capacity = { source: "models.dev", context: 64000, output: 8000, matchedId: "origin/flash", updatedAt: null };
  assert.equal(modelCapacitySchema.parse(capacity).source, "models.dev");
  assert.equal(modelCapacitySchema.parse({ ...capacity, source: "user" }).source, "user");
  assert.equal(modelCapacitySchema.safeParse({ ...capacity, source: "modelpedia" }).success, false);
  assert.equal(modelCapacitySchema.safeParse({ ...capacity, source: "unknown", context: null, output: null, matchedId: null }).success, true);
});

test("accepts independent explicit overrides and resets but rejects empty or malformed updates", () => {
  for (const input of [{ context: 64000 }, { output: 8000 }, { capabilities: { reasoning: false } }, { capabilities: { vision: true } },
    { context: null, output: null, capabilities: { reasoning: null, vision: null } }]) assert.equal(modelCapacityInputSchema.safeParse(input).success, true);
  for (const input of [{}, { capabilities: {} }, { capabilities: { toolCall: true } }, { capabilities: { vision: "true" } },
    { context: 100, output: 200 }, { context: 64000, output: 65000 }, { context: 64000.5 }]) assert.equal(modelCapacityInputSchema.safeParse(input).success, false);
});
