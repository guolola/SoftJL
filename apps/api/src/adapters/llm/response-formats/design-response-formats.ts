// Builds discriminated design schemas from contracts and narrows them to the requested models.
import { designDiagramModelsResultSchema, generationResponseSchema, type DesignDiagramKind } from "@uml-platform/contracts";
import type { JsonSchemaResponseFormat } from "../../../llm.js";
import { getStructuredResponseFormat, type ModelCapabilitySource } from "../../../model-capabilities.js";
import { contractResponseSchema } from "./contract-response-schema.js";
import { toOpenAiStrictJsonSchema } from "./openai-strict-schema.js";

export const GENERATE_DESIGN_MODELS_RESPONSE_FORMAT: JsonSchemaResponseFormat = { type: "json_schema", json_schema: { name: "design_diagram_models_result", strict: true, schema: toOpenAiStrictJsonSchema(generationResponseSchema(designDiagramModelsResultSchema)) } };
export const GENERATE_DESIGN_TRACEABILITY_RESPONSE_FORMAT: JsonSchemaResponseFormat = { type: "json_schema", json_schema: { name: "design_model_traceability_result", strict: true, schema: toOpenAiStrictJsonSchema(contractResponseSchema(designDiagramModelsResultSchema.pick({ designModelTraceability: true }))) } };

export function getGenerateDesignModelsResponseFormat(model: ModelCapabilitySource, selectedDiagrams: readonly DesignDiagramKind[] = []) {
  const format = structuredClone(GENERATE_DESIGN_MODELS_RESPONSE_FORMAT);
  if (selectedDiagrams.length) {
    const schemas = (format.json_schema.schema as any).properties.models.items;
    schemas.anyOf = schemas.anyOf.filter((item: any) => selectedDiagrams.includes(item.properties.diagramKind.enum[0]));
  }
  return getStructuredResponseFormat(model, format);
}
export function getGenerateDesignTraceabilityResponseFormat(model: ModelCapabilitySource) { return getStructuredResponseFormat(model, GENERATE_DESIGN_TRACEABILITY_RESPONSE_FORMAT); }
