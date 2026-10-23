import { getStructuredResponseFormat } from "../model-capabilities.js";
// Verifies feasibility prompts and OpenAI strict schemas share a contract-valid shape.
import assert from "node:assert/strict";
import { strictTestModelCapability } from "../../../../tests/fixtures/providers/model-capability.js";
import test from "node:test";
import { completeFeasibilityImplementationPlanSchema } from "@uml-platform/contracts";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "@uml-platform/prompts";
import { GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT, GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT, GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT } from "./feasibility-response-formats.js";

function assertStrictObjects(schema: unknown, path = "schema") {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  const record = schema as {
    type?: unknown;
    properties?: Record<string, unknown>;
    required?: unknown;
    items?: unknown;
    anyOf?: unknown[];
    additionalProperties?: unknown;
  };
  if (record.type === "object") {
    assert.equal(record.additionalProperties, false, path);
    assert.deepEqual(
      new Set(record.required as string[]),
      new Set(Object.keys(record.properties ?? {})),
      path,
    );
  }
  for (const [key, child] of Object.entries(record.properties ?? {})) {
    assertStrictObjects(child, `${path}.${key}`);
  }
  assertStrictObjects(record.items, `${path}.items`);
  for (const [index, child] of (record.anyOf ?? []).entries()) {
    assertStrictObjects(child, `${path}.anyOf.${index}`);
  }
}

test("the implementation prompt example passes the complete persisted schema", () => {
  const parsed = completeFeasibilityImplementationPlanSchema.parse(
    FEASIBILITY_IMPLEMENTATION_EXAMPLE,
  );
  assert.equal(parsed.candidates.length, 2);
  assert.equal(parsed.candidates[0]?.implementation?.verdicts.length, 5);
});

test("feasibility response formats satisfy OpenAI strict object requirements", () => {
  assertStrictObjects(GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT.json_schema.schema);
  const schema = GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT.json_schema.schema as {
    properties: { model: { properties: { diagramKind: { enum: string[] } } } };
  };
  assert.deepEqual(schema.properties.model.properties.diagramKind.enum, ["activity"]);
  assertStrictObjects(
    GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT.json_schema.schema,
  );
  assertStrictObjects(
    GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT.json_schema.schema,
  );
});

test("capability routing returns strict, json object and compatible response formats", () => {
  const strict = getStructuredResponseFormat({
    model: "strict",
    modelCapability: strictTestModelCapability("strict"),
  }, GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT);
  const jsonObject = getStructuredResponseFormat({
    model: "json",
    modelCapability: {
      ...strictTestModelCapability("json"),
      supportsJsonSchema: false,
      structuredOutputMode: "json_object",
      modeLabel: "JSON 模式",
      strictJson: false,
      probeStatus: "json_object",
    },
  }, GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT);
  const compatible = getStructuredResponseFormat({
    model: "unknown-model",
    modelCapability: { ...strictTestModelCapability("unknown-model"), supportsJsonSchema: false,
      supportsJsonObject: false, structuredOutputMode: "compatible", modeLabel: "兼容模式", strictJson: false,
      probeStatus: "compatible" },
  }, GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT);

  assert.equal(strict?.type, "json_schema");
  assert.equal(jsonObject?.type, "json_object");
  assert.equal(compatible, null);
});
