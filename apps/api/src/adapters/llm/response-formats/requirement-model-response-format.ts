// Builds requirement model provider schemas from the same contracts used by the server.
import { diagramModelsResultSchema } from "@uml-platform/contracts";
import type { JsonSchemaResponseFormat } from "../llm-transport.js";
import { contractResponseSchema } from "./contract-response-schema.js";
import { toOpenAiStrictJsonSchema } from "./openai-strict-schema.js";
export const GENERATE_MODELS_RESPONSE_FORMAT: JsonSchemaResponseFormat = {
  type: "json_schema",
  json_schema: { name: "diagram_models_result", strict: true, schema: toOpenAiStrictJsonSchema(contractResponseSchema(diagramModelsResultSchema)) },
};
