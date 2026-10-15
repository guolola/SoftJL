// Defines JSON schema response formats for requirement model generation.
import type { DiagramKind } from "@uml-platform/contracts";

import { type JsonSchemaResponseFormat } from "../../../llm.js";
import {
  getModelCapability,
  getStructuredResponseFormat,
  type ModelCapabilitySource,
} from "../../../model-capabilities.js";
import { toOpenAiStrictJsonSchema } from "./openai-strict-schema.js";

import {
  GENERATE_MODELS_RESPONSE_FORMAT,
  modelElementRefResponseSchema,
  requirementTraceabilityEntryResponseSchema,
} from "./requirement-model-response-format.js";
export {
  GENERATE_MODELS_RESPONSE_FORMAT,
  modelElementRefResponseSchema,
  requirementTraceabilityEntryResponseSchema,
} from "./requirement-model-response-format.js";

export const requirementModelOneOf = (
  (
    GENERATE_MODELS_RESPONSE_FORMAT.json_schema.schema.properties as {
      models: { items: { anyOf: Record<string, unknown>[] } };
    }
  ).models.items.anyOf
);

export const GENERATE_REQUIREMENT_TRACEABILITY_RESPONSE_FORMAT: JsonSchemaResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "requirement_model_traceability_result",
    strict: true,
    schema: toOpenAiStrictJsonSchema({
      type: "object",
      additionalProperties: false,
      properties: {
        requirementModelTraceability: {
          type: "array",
          items: requirementTraceabilityEntryResponseSchema,
        },
      },
      required: ["requirementModelTraceability"],
    }),
  },
};

function cloneJsonSchemaResponseFormat(
  format: JsonSchemaResponseFormat,
): JsonSchemaResponseFormat {
  return JSON.parse(JSON.stringify(format)) as JsonSchemaResponseFormat;
}

function variantDiagramKind(variant: unknown) {
  const diagramKind = (variant as { properties?: { diagramKind?: { enum?: unknown[] } } })
    ?.properties?.diagramKind?.enum?.[0];
  return typeof diagramKind === "string" ? diagramKind : null;
}

export function getGenerateModelsResponseFormat(
  model: ModelCapabilitySource,
  selectedDiagrams: readonly DiagramKind[] = [],
) {
  if (!getModelCapability(model).supportsJsonSchema) {
    return getStructuredResponseFormat(model, GENERATE_MODELS_RESPONSE_FORMAT);
  }
  const selected = new Set(selectedDiagrams);
  if (selected.size === 0) return GENERATE_MODELS_RESPONSE_FORMAT;

  const next = cloneJsonSchemaResponseFormat(GENERATE_MODELS_RESPONSE_FORMAT);
  const models = (
    next.json_schema.schema.properties as {
      models?: { items?: { anyOf?: unknown[] } };
    }
  ).models;
  const variants = models?.items?.anyOf;
  if (!models?.items || !Array.isArray(variants)) return next;
  const filtered = variants.filter((variant) => {
    const diagramKind = variantDiagramKind(variant);
    return diagramKind ? selected.has(diagramKind as DiagramKind) : false;
  });
  if (filtered.length > 0) {
    models.items = {
      ...models.items,
      anyOf: filtered,
    };
    next.json_schema.name = `diagram_models_result_${Array.from(selected).join("_")}`;
  }
  return next;
}

export function getGenerateRequirementTraceabilityResponseFormat(
  model: ModelCapabilitySource,
) {
  return getStructuredResponseFormat(
    model,
    GENERATE_REQUIREMENT_TRACEABILITY_RESPONSE_FORMAT,
  );
}
