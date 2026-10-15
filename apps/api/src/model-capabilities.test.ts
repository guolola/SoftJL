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

test("unknown models default to compatible mode", () => {
  const capability = getModelCapability({ model: "qwen3.7-plus" });

  assert.equal(capability.supportsJsonSchema, false);
  assert.equal(capability.supportsJsonObject, false);
  assert.equal(capability.structuredOutputMode, "compatible");
  assert.equal(capability.modeLabel, "兼容模式");
});
