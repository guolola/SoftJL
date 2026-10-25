// Projects feasibility schemas from persisted contracts; semantic refinements remain server enforced.
import { contextDiagramSpecSchema, feasibilityBusinessFlowSchema, completeFeasibilityImplementationPlanSchema, generationResponseSchema } from "@uml-platform/contracts";
import type { JsonSchemaResponseFormat } from "../llm-transport.js";
import { toOpenAiStrictJsonSchema } from "./openai-strict-schema.js";

function format(name: string, schema: Parameters<typeof generationResponseSchema>[0]): JsonSchemaResponseFormat {
  return { type: "json_schema", json_schema: { name, strict: true, schema: toOpenAiStrictJsonSchema(generationResponseSchema(schema)) } };
}

export const GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT = format("feasibility_context_result", contextDiagramSpecSchema);
export const GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT = format("feasibility_business_flow_result", feasibilityBusinessFlowSchema);
export const GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT = format("feasibility_implementation_result", completeFeasibilityImplementationPlanSchema);
