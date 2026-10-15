// Recursively guards fields, enums and nested union variants against drift between local and provider contracts.
import assert from "node:assert/strict";
import test from "node:test";
import { generationResponseSchema, getStageModelSchemas } from "@uml-platform/contracts";
import { GENERATE_DESIGN_MODELS_RESPONSE_FORMAT, getGenerateDesignModelsResponseFormat } from "./design-response-formats.js";
import { GENERATE_MODELS_RESPONSE_FORMAT } from "./requirement-model-response-format.js";
import { toOpenAiStrictJsonSchema } from "./openai-strict-schema.js";

function canonical(schema: any): any {
  const result: any = { ...schema };
  delete result.required;
  if (Array.isArray(result.type)) result.type = result.type.filter((item: unknown) => item !== "null")[0];
  if (result.enum) result.enum = result.enum.filter((item: unknown) => item !== null);
  if (result.properties) result.properties = Object.fromEntries(Object.entries(result.properties).map(([key, value]) => [key, canonical(value)]));
  if (result.items) result.items = canonical(result.items);
  if (result.anyOf) result.anyOf = result.anyOf.filter((item: any) => item.type !== "null").map(canonical);
  return result;
}
for (const stage of ["requirements", "design"] as const) {
  test(`${stage}: all recursive fields and enums match the contract projection`, () => {
    const response = stage === "design" ? GENERATE_DESIGN_MODELS_RESPONSE_FORMAT : GENERATE_MODELS_RESPONSE_FORMAT;
    const variants = (response.json_schema.schema as any).properties.models.items.anyOf;
    for (const schema of getStageModelSchemas(stage)) {
      const kind = schema.shape.diagramKind.value;
      const actual = variants.find((variant: any) => variant.properties.diagramKind.enum[0] === kind);
      assert.deepEqual(canonical(actual), canonical(generationResponseSchema(schema)), `${stage}/${kind}`);
    }
  });
}
test("selected model response excludes other model types and unrelated relationship enums", () => {
  const format = getGenerateDesignModelsResponseFormat("gpt-5.4", ["navigation"]);
  const variants = (format?.json_schema.schema as any).properties.models.items.anyOf;
  assert.equal(variants.length, 1);
  assert.deepEqual(variants[0].properties.diagramKind.enum, ["navigation"]);
  assert.ok(!variants[0].properties.relationships.items.properties.type.enum.includes("deployment"));
});
test("nullable union fields remain nullable after strict conversion", () => {
  const converted = toOpenAiStrictJsonSchema({ type: "object", properties: { branch: { anyOf: [{ type: "string" }, { type: "object", properties: {} }] } }, required: [] }) as any;
  assert.ok(converted.properties.branch.anyOf.some((variant: any) => variant.type === "null"));
});
