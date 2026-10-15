// Verifies feasibility prompts and OpenAI strict schemas share a contract-valid shape.
import assert from "node:assert/strict";
import test from "node:test";
import { completeFeasibilityImplementationPlanSchema } from "@uml-platform/contracts";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "@uml-platform/prompts";
import {
  FEASIBILITY_SECTION_REPAIR_RESPONSE_FORMATS,
  GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT,
  GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT,
  GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT,
  getGenerateFeasibilityImplementationResponseFormat,
} from "./feasibility-response-formats.js";

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
  for (const responseFormat of Object.values(
    FEASIBILITY_SECTION_REPAIR_RESPONSE_FORMATS,
  )) {
    assertStrictObjects(responseFormat.json_schema.schema);
  }
});

test("capability routing returns strict, json object and compatible response formats", () => {
  const strict = getGenerateFeasibilityImplementationResponseFormat({
    model: "strict",
    modelCapability: {
      modelId: "strict",
      supportsJsonSchema: true,
      supportsJsonObject: true,
      structuredOutputMode: "strict_json",
      modeLabel: "严格 JSON",
      probedAt: "2026-07-29T00:00:00.000Z",
    },
  });
  const jsonObject = getGenerateFeasibilityImplementationResponseFormat({
    model: "json",
    modelCapability: {
      modelId: "json",
      supportsJsonSchema: false,
      supportsJsonObject: true,
      structuredOutputMode: "json_object",
      modeLabel: "JSON 模式",
      probedAt: "2026-07-29T00:00:00.000Z",
    },
  });
  const compatible = getGenerateFeasibilityImplementationResponseFormat({
    model: "unknown-model",
  });

  assert.equal(strict?.type, "json_schema");
  assert.equal(jsonObject?.type, "json_object");
  assert.equal(compatible, null);
});
