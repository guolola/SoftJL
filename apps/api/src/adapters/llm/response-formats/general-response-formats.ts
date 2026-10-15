// Defines strict JSON schema response formats for cross-cutting LLM calls.
import { type JsonSchemaResponseFormat } from "../../../llm.js";
import {
  getStructuredResponseFormat,
  type ModelCapabilitySource,
} from "../../../model-capabilities.js";
import { toOpenAiStrictJsonSchema } from "./openai-strict-schema.js";

const requirementRuleSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    category: {
      type: "string",
      enum: [
        "业务规则",
        "功能需求",
        "外部接口",
        "界面需求",
        "数据需求",
        "非功能需求",
        "部署需求",
        "异常处理",
      ],
    },
    text: { type: "string" },
    sourceFragment: { type: "string" },
    relatedDiagrams: {
      type: "array",
      items: {
        type: "string",
        enum: ["function", "usecase", "class", "activity", "deployment", "prototype", "analysis"],
      },
    },
  },
  required: ["id", "category", "text", "sourceFragment", "relatedDiagrams"],
} as const;

const requirementFieldProvenanceEntrySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    source: {
      type: "string",
      enum: ["source-text", "ai-suggested", "heuristic", "manual"],
    },
    status: {
      type: "string",
      enum: ["accepted", "pending-review", "rejected"],
    },
    value: { type: ["string", "null"] },
    originalValue: { type: ["string", "null"] },
    rationale: { type: "string" },
    issueIds: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["source", "status"],
} as const;

const repairableRequirementFieldsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    actor: requirementFieldProvenanceEntrySchema,
    subject: requirementFieldProvenanceEntrySchema,
    action: requirementFieldProvenanceEntrySchema,
    object: requirementFieldProvenanceEntrySchema,
    condition: requirementFieldProvenanceEntrySchema,
    outcome: requirementFieldProvenanceEntrySchema,
    acceptanceCriteria: requirementFieldProvenanceEntrySchema,
  },
  required: [],
} as const;

const requirementRepairSuggestionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    fields: repairableRequirementFieldsSchema,
    confidence: { type: "number" },
    status: {
      type: "string",
      enum: [
        "accepted",
        "ambiguous",
        "conflict",
        "pending-review",
        "rejected",
        "derived",
      ],
    },
    rationale: { type: "string" },
  },
  required: ["fields"],
} as const;

const documentSectionTableSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headers: {
      type: "array",
      items: { type: "string" },
    },
    rows: {
      type: "array",
      items: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  required: ["headers", "rows"],
} as const;

function strictResponseFormat(
  name: string,
  schema: Record<string, unknown>,
): JsonSchemaResponseFormat {
  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: true,
      schema: toOpenAiStrictJsonSchema(schema),
    },
  };
}

function responseFormatIfSupported(
  model: ModelCapabilitySource,
  format: JsonSchemaResponseFormat,
) {
  return getStructuredResponseFormat(model, format);
}

export const EXTRACT_REQUIREMENT_RULES_RESPONSE_FORMAT = strictResponseFormat(
  "requirement_rules_result",
  {
    type: "object",
    additionalProperties: false,
    properties: {
      rules: {
        type: "array",
        items: requirementRuleSchema,
      },
    },
    required: ["rules"],
  },
);

export const REPAIR_REQUIREMENT_RULE_RESPONSE_FORMAT = strictResponseFormat(
  "requirement_rule_repair_suggestion",
  requirementRepairSuggestionSchema,
);

export const REPAIR_REQUIREMENT_RULES_RESPONSE_FORMAT = strictResponseFormat(
  "requirement_rule_batch_repair_suggestion",
  {
    type: "object",
    additionalProperties: false,
    properties: {
      repairs: {
        type: "array",
        items: {
          ...requirementRepairSuggestionSchema,
          properties: {
            ruleId: { type: "string" },
            ...requirementRepairSuggestionSchema.properties,
          },
          required: ["ruleId", "fields"],
        },
      },
    },
    required: ["repairs"],
  },
);

export const DOCUMENT_CONTENT_RESPONSE_FORMAT = strictResponseFormat(
  "document_content_result",
  {
    type: "object",
    additionalProperties: false,
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            level: { type: "number", enum: [1, 2, 3] },
            title: { type: "string" },
            body: {
              type: "array",
              items: { type: "string" },
            },
            table: documentSectionTableSchema,
            diagramKind: { type: "string" },
          },
          required: ["level", "title", "body"],
        },
      },
    },
    required: ["sections"],
  },
);

export const HEALTHCHECK_RESPONSE_FORMAT = strictResponseFormat(
  "provider_healthcheck",
  {
    type: "object",
    additionalProperties: false,
    properties: {
      ok: { type: "boolean" },
    },
    required: ["ok"],
  },
);

export function getExtractRequirementRulesResponseFormat(model: ModelCapabilitySource) {
  return responseFormatIfSupported(model, EXTRACT_REQUIREMENT_RULES_RESPONSE_FORMAT);
}

export function getRepairRequirementRuleResponseFormat(model: ModelCapabilitySource) {
  return responseFormatIfSupported(model, REPAIR_REQUIREMENT_RULE_RESPONSE_FORMAT);
}

export function getRepairRequirementRulesResponseFormat(model: ModelCapabilitySource) {
  return responseFormatIfSupported(model, REPAIR_REQUIREMENT_RULES_RESPONSE_FORMAT);
}

export function getDocumentContentResponseFormat(model: ModelCapabilitySource) {
  return responseFormatIfSupported(model, DOCUMENT_CONTENT_RESPONSE_FORMAT);
}

export function getHealthcheckResponseFormat(model: ModelCapabilitySource) {
  return responseFormatIfSupported(model, HEALTHCHECK_RESPONSE_FORMAT);
}
