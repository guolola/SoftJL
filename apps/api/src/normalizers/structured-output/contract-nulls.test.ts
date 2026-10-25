// Ensures strict-provider placeholders cannot erase required nullable values or hide unknown fields.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeContractNulls } from "./contract-nulls.js";

test("optional placeholders are removed while required and optional nullable fields retain null", () => {
  const schema = { type: "object", properties: {
    assumption: { type: "string" }, range: { anyOf: [{ type: "object", properties: {} }, { type: "null" }] },
    period: { anyOf: [{ type: "number" }, { type: "null" }] },
  }, required: ["range"] };
  const raw = { assumption: null, range: null, period: null, unsupported: "retained for validation" };
  assert.deepEqual(normalizeContractNulls(raw, schema), { range: null, period: null, unsupported: "retained for validation" });
  assert.equal(raw.assumption, null);
});
