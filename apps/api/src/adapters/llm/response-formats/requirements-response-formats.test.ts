// Verifies requirement model response schemas stay compatible with OpenAI strict JSON Schema.
import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERATE_MODELS_RESPONSE_FORMAT,
  GENERATE_REQUIREMENT_TRACEABILITY_RESPONSE_FORMAT,
  getGenerateModelsResponseFormat,
} from "./requirements-response-formats.js";

function assertStrictObjectRequirements(schema: unknown, path = "schema") {
  if (!schema || typeof schema !== "object") return;
  const node = schema as {
    anyOf?: unknown[];
    items?: unknown;
    oneOf?: unknown;
    properties?: Record<string, unknown>;
    required?: unknown;
  };

  assert.equal(node.oneOf, undefined, `${path} must not use oneOf`);

  if (node.properties) {
    assert.deepEqual(
      node.required,
      Object.keys(node.properties),
      `${path}.required must list every property`,
    );
  }

  for (const [key, value] of Object.entries(node.properties ?? {})) {
    assertStrictObjectRequirements(value, `${path}.properties.${key}`);
  }
  if (node.items) {
    assertStrictObjectRequirements(node.items, `${path}.items`);
  }
  for (const [index, value] of (node.anyOf ?? []).entries()) {
    assertStrictObjectRequirements(value, `${path}.anyOf.${index}`);
  }
}

test("requirement model response formats are valid for OpenAI strict JSON Schema", () => {
  assertStrictObjectRequirements(GENERATE_MODELS_RESPONSE_FORMAT.json_schema.schema);
  assertStrictObjectRequirements(
    GENERATE_REQUIREMENT_TRACEABILITY_RESPONSE_FORMAT.json_schema.schema,
  );
});

test("requirement class response schema exposes localized names and constraints", () => {
  const variants = (
    GENERATE_MODELS_RESPONSE_FORMAT.json_schema.schema.properties as {
      models: { items: { anyOf: Array<{ properties: Record<string, unknown> }> } };
    }
  ).models.items.anyOf;
  const classVariant = variants.find((variant) => {
    const diagramKind = variant.properties.diagramKind as { enum?: string[] };
    return diagramKind.enum?.includes("class");
  });

  assert.ok(classVariant);
  const classProperties = (
    classVariant.properties.classes as {
      items: { properties: Record<string, unknown> };
    }
  ).items.properties;
  const attributeProperties = (
    classProperties.attributes as {
      items: { properties: Record<string, unknown> };
    }
  ).items.properties;
  const interfaceProperties = (
    classVariant.properties.interfaces as {
      items: { properties: Record<string, unknown> };
    }
  ).items.properties;

  for (const field of ["chineseName", "englishName", "type", "constraints"]) {
    assert.ok(classProperties[field], `classes[].${field} must be declared`);
    assert.ok(interfaceProperties[field], `interfaces[].${field} must be declared`);
  }
  for (const field of ["chineseName", "englishName", "constraints"]) {
    assert.ok(attributeProperties[field], `classes[].attributes[].${field} must be declared`);
  }
});

test("requirement model response schema includes function MindMap structure", () => {
  const variants = (
    GENERATE_MODELS_RESPONSE_FORMAT.json_schema.schema.properties as {
      models: { items: { anyOf: Array<{ properties: Record<string, unknown> }> } };
    }
  ).models.items.anyOf;
  const functionVariant = variants.find((variant) => {
    const diagramKind = variant.properties.diagramKind as { enum?: string[] };
    return diagramKind.enum?.includes("function");
  });

  assert.ok(functionVariant);
  assert.ok(functionVariant.properties.nodes);
  const relationships = functionVariant.properties.relationships as {
    items: { properties: { type: { enum: string[] } } };
  };
  assert.deepEqual(relationships.items.properties.type.enum, [
    "decomposition",
  ]);
});

test("requirement model response format narrows single selected diagram kind", () => {
  const format = getGenerateModelsResponseFormat("gpt-5.4", ["deployment"]);
  assert.ok(format);
  const variants = (
    format.json_schema.schema.properties as {
      models: { items: { anyOf: Array<{ properties: { diagramKind: { enum: string[] } } }> } };
    }
  ).models.items.anyOf;

  assert.equal(variants.length, 1);
  assert.deepEqual(variants[0]?.properties.diagramKind.enum, ["deployment"]);
  assert.match(format.json_schema.name, /deployment/);
});
