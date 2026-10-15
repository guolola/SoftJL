// Builds requirement model provider schemas from the same contracts used by the server.
import { diagramModelsResultSchema, modelElementRefSchema, requirementModelTraceabilityEntrySchema } from "@uml-platform/contracts";
import type { JsonSchemaResponseFormat } from "../../../llm.js";
import { contractResponseSchema } from "./contract-response-schema.js";
import { toOpenAiStrictJsonSchema } from "./openai-strict-schema.js";

export const modelElementRefResponseSchema = contractResponseSchema(modelElementRefSchema);
export const requirementTraceabilityEntryResponseSchema = contractResponseSchema(requirementModelTraceabilityEntrySchema);
export const GENERATE_MODELS_RESPONSE_FORMAT: JsonSchemaResponseFormat = {
  type: "json_schema",
  json_schema: { name: "diagram_models_result", strict: true, schema: toOpenAiStrictJsonSchema(contractResponseSchema(diagramModelsResultSchema)) },
};
