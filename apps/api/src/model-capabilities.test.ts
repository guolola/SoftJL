import assert from "node:assert/strict";
import test from "node:test";
import { getModelCapability } from "./model-capabilities.js";

test("deepseek v4 flash uses JSON mode instead of strict json_schema", () => {
  const capability = getModelCapability("deepseek-v4-flash");

  assert.equal(capability.supportsJsonSchema, false);
  assert.equal(capability.supportsJsonObject, true);
  assert.equal(capability.structuredOutputMode, "json_object");
  assert.equal(capability.modeLabel, "JSON 模式");
  assert.match(capability.warning ?? "", /json_schema/u);
});

test("provider settings without explicit persisted capabilities are rejected", () => {
  for (const model of ["qwen3.7-plus", "deepseek-v4-flash", "test-model"]) {
    assert.throws(() => getModelCapability({ model }), /explicit persisted model capabilities/);
  }
});

test("explicit compatible provider capabilities remain valid", () => {
  const capability = getModelCapability({ model: "qwen3.7-plus", modelCapability: {
    id: "qwen3.7-plus", category: "text_chat", structuredOutputMode: "compatible", supportsJsonSchema: false,
    supportsJsonObject: false, modeLabel: "兼容模式", strictJson: "unknown", probeStatus: "compatible", probedAt: "2026-10-18T00:00:00Z",
  } });

  assert.equal(capability.supportsJsonSchema, false);
  assert.equal(capability.supportsJsonObject, false);
  assert.equal(capability.structuredOutputMode, "compatible");
  assert.equal(capability.modeLabel, "兼容模式");
});
