// Covers stable diagnostic categories for malformed LLM structured outputs.
import assert from "node:assert/strict";
import test from "node:test";
import { classifyStructuredOutputFailure } from "./structured-output.js";

test("classifyStructuredOutputFailure separates JSON, traceability, model, and transport failures", () => {
  assert.equal(
    classifyStructuredOutputFailure(new SyntaxError("Expected property name or '}' in JSON at position 1")),
    "json_parse",
  );

  assert.equal(
    classifyStructuredOutputFailure(
      new Error(
        'requirement traceability structured output failed: [{"code":"invalid_type","path":[0,"target","modelId"],"message":"Expected string, received null"}]',
      ),
    ),
    "traceability_schema",
  );

  assert.equal(
    classifyStructuredOutputFailure(
      new Error(
        'requirement traceability structured output failed: [{"code":"too_small","path":[0,"target","modelId"],"message":"String must contain at least 1 character(s)"}]',
      ),
    ),
    "traceability_schema",
  );

  assert.equal(
    classifyStructuredOutputFailure(
      new Error("design traceability structured output failed: 缺少 2 个设计元素映射：sequence:participant"),
    ),
    "traceability_ref",
  );

  assert.equal(
    classifyStructuredOutputFailure(new Error("generate_design_models must return at least one model")),
    "empty_selected_model",
  );

  assert.equal(
    classifyStructuredOutputFailure(new Error("LLM request failed with HTTP 502")),
    "external_transport",
  );

  assert.equal(
    classifyStructuredOutputFailure(new Error("models.0.classes.0.classKind invalid enum value")),
    "model_schema",
  );
});
