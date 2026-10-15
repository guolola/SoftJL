// Verifies cross-cutting response schemas stay compatible with OpenAI strict JSON Schema.
import assert from "node:assert/strict";
import test from "node:test";
import {
  DOCUMENT_CONTENT_RESPONSE_FORMAT,
  EXTRACT_REQUIREMENT_RULES_RESPONSE_FORMAT,
  HEALTHCHECK_RESPONSE_FORMAT,
  REPAIR_REQUIREMENT_RULES_RESPONSE_FORMAT,
  REPAIR_REQUIREMENT_RULE_RESPONSE_FORMAT,
} from "./general-response-formats.js";

function assertStrictObjectRequirements(schema: unknown, path = "schema") {
  if (!schema || typeof schema !== "object") return;
  const node = schema as {
    additionalProperties?: unknown;
    anyOf?: unknown[];
    items?: unknown;
    oneOf?: unknown;
    properties?: Record<string, unknown>;
    required?: unknown;
  };

  assert.equal(node.oneOf, undefined, `${path} must not use oneOf`);

  if (node.properties) {
    assert.equal(
      node.additionalProperties,
      false,
      `${path} must set additionalProperties=false`,
    );
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

test("general response formats are valid for OpenAI strict JSON Schema", () => {
  for (const format of [
    EXTRACT_REQUIREMENT_RULES_RESPONSE_FORMAT,
    REPAIR_REQUIREMENT_RULE_RESPONSE_FORMAT,
    REPAIR_REQUIREMENT_RULES_RESPONSE_FORMAT,
    DOCUMENT_CONTENT_RESPONSE_FORMAT,
      HEALTHCHECK_RESPONSE_FORMAT,
  ]) {
    assert.equal(format.type, "json_schema");
    assert.equal(format.json_schema.strict, true);
    assertStrictObjectRequirements(format.json_schema.schema);
  }
});

test("requirement rule response formats allow function structure mappings", () => {
  const rules = (
    EXTRACT_REQUIREMENT_RULES_RESPONSE_FORMAT.json_schema.schema.properties as {
      rules: {
        items: {
          properties: {
            relatedDiagrams: { items: { enum: string[] } };
            sourceFragment: { type: string };
          };
          required: string[];
        };
      };
    }
  ).rules;

  assert.ok(rules.items.properties.relatedDiagrams.items.enum.includes("function"));
  assert.equal(rules.items.properties.sourceFragment.type, "string");
  assert.ok(rules.items.required.includes("sourceFragment"));
});
