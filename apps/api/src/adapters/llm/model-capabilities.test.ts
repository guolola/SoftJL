import assert from "node:assert/strict";
import test from "node:test";
import { getModelCapability, type ModelCapabilitySource } from "./model-capabilities.js";
import { strictTestModelCapability } from "../../../tests/fixtures/providers/model-capability.js";

test("model names cannot supply unprobed JSON capabilities", () => {
  for (const model of ["deepseek-v4-flash", "test-model", "gpt-5.4"]) {
    assert.throws(() => getModelCapability(model as unknown as ModelCapabilitySource), /explicit persisted model capabilities/);
  }
});

test("explicit capabilities determine output modes independently of the model name", () => {
  assert.equal(getModelCapability(strictTestModelCapability("deepseek-v4-flash")).structuredOutputMode, "strict_json");
  assert.equal(getModelCapability({ ...strictTestModelCapability("gpt-5.4"),
    structuredOutputMode: "json_object", supportsJsonSchema: false, modeLabel: "JSON 模式",
    strictJson: false, probeStatus: "json_object",
  }).structuredOutputMode, "json_object");
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
