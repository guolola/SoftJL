// Defines strict response schemas for complete feasibility context and implementation generation.
import type { JsonSchemaResponseFormat } from "../../../llm.js";
import {
  getStructuredResponseFormat,
  type ModelCapabilitySource,
} from "../../../model-capabilities.js";
import { toOpenAiStrictJsonSchema } from "./openai-strict-schema.js";
import { feasibilityBusinessFlowSchema, contractResponseSchema } from "@uml-platform/contracts";

const stringSchema = { type: "string" };
const stringArraySchema = { type: "array", items: stringSchema };
const provenanceSchema = { type: "string", enum: ["ai-estimate"] };
const sourceRefProperties = {
  sourceRequirementIds: stringArraySchema,
  assumption: stringSchema,
  provenance: provenanceSchema,
};

function strictObject(
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

const contextElementSchema = strictObject({
  id: stringSchema,
  name: stringSchema,
  description: stringSchema,
  sourceRequirementIds: stringArraySchema,
});

export const GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT: JsonSchemaResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "feasibility_business_flow_result",
    strict: true,
    schema: toOpenAiStrictJsonSchema(contractResponseSchema(feasibilityBusinessFlowSchema)),
  },
};

export const GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT: JsonSchemaResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "feasibility_context_result",
    strict: true,
    schema: toOpenAiStrictJsonSchema(strictObject({
      diagramKind: { type: "string", enum: ["context"] },
      modelId: stringSchema,
      title: stringSchema,
      summary: stringSchema,
      notes: stringArraySchema,
      system: contextElementSchema,
      people: { type: "array", items: contextElementSchema },
      externalSystems: { type: "array", items: contextElementSchema },
      relationships: {
        type: "array",
        items: strictObject({
          id: stringSchema,
          sourceId: stringSchema,
          targetId: stringSchema,
          direction: { type: "string", enum: ["directed", "bidirectional"] },
          label: stringSchema,
          description: stringSchema,
          sourceRequirementIds: stringArraySchema,
        }),
      },
    })),
  },
};

const sourceSummarySchema = strictObject({
  summary: stringSchema,
  ...sourceRefProperties,
});
const moduleSchema = strictObject({
  id: stringSchema,
  name: stringSchema,
  responsibility: stringSchema,
  ...sourceRefProperties,
});
const integrationSchema = strictObject({
  id: stringSchema,
  name: stringSchema,
  responsibility: stringSchema,
  contextExternalSystemId: stringSchema,
  ...sourceRefProperties,
});
const estimateRangeSchema = strictObject({
  minimum: { type: "number", minimum: 0 },
  maximum: { type: "number", minimum: 0 },
  currency: stringSchema,
  basis: stringSchema,
  confidence: { type: "string", enum: ["low", "medium", "high"] },
});
const costEstimateSchema = strictObject({
  id: stringSchema,
  name: stringSchema,
  category: { type: "string", enum: ["capital", "other-one-time", "recurring"] },
  frequency: { type: "string", enum: ["one-time", "monthly", "annual"] },
  range: estimateRangeSchema,
  note: stringSchema,
  ...sourceRefProperties,
});
const benefitEstimateSchema = strictObject({
  id: stringSchema,
  name: stringSchema,
  category: { type: "string", enum: ["one-time", "recurring", "intangible"] },
  frequency: { type: "string", enum: ["one-time", "monthly", "annual"] },
  range: {
    anyOf: [
      estimateRangeSchema,
      { type: "null" },
    ],
  },
  outcome: stringSchema,
  ...sourceRefProperties,
});
const milestoneSchema = strictObject({
  id: stringSchema,
  name: stringSchema,
  timeframe: stringSchema,
  deliverables: stringArraySchema,
  roles: stringArraySchema,
  dependencies: stringArraySchema,
  dependencyRationale: stringSchema,
  acceptanceCriteria: stringArraySchema,
  ...sourceRefProperties,
});
const riskSchema = strictObject({
  id: stringSchema,
  risk: stringSchema,
  probability: { type: "string", enum: ["low", "medium", "high"] },
  impact: { type: "string", enum: ["low", "medium", "high"] },
  mitigation: stringSchema,
  owner: stringSchema,
  ...sourceRefProperties,
});
const verdictSchema = strictObject({
  category: {
    type: "string",
    enum: ["technical", "operational", "schedule", "economic", "legal"],
  },
  verdict: {
    type: "string",
    enum: ["feasible", "conditional", "not-feasible", "unknown"],
  },
  rationale: stringSchema,
  provenance: provenanceSchema,
});
const absenceSchema = strictObject({
  scope: {
    type: "string",
    enum: [
      "integrations",
      "dependencies",
      "capital-costs",
      "other-one-time-costs",
      "recurring-costs",
      "one-time-benefits",
      "recurring-benefits",
      "intangible-benefits",
    ],
  },
  reason: stringSchema,
  provenance: provenanceSchema,
});
const implementationSchema = strictObject({
  provenance: provenanceSchema,
  architecture: strictObject({
    summary: stringSchema,
    modules: { type: "array", minItems: 1, items: moduleSchema },
  }),
  dataStrategy: sourceSummarySchema,
  integrations: { type: "array", items: integrationSchema },
  integrationRationale: stringSchema,
  deploymentAndOperations: sourceSummarySchema,
  securityAndCompliance: sourceSummarySchema,
  milestones: { type: "array", minItems: 1, items: milestoneSchema },
  analysisPeriodAssumption: strictObject({
    years: { type: "number", exclusiveMinimum: 0 },
    basis: stringSchema,
    provenance: provenanceSchema,
  }),
  costEstimates: { type: "array", minItems: 1, items: costEstimateSchema },
  benefitEstimates: { type: "array", minItems: 1, items: benefitEstimateSchema },
  absenceDeclarations: { type: "array", items: absenceSchema },
  oneTimeCosts: stringArraySchema,
  recurringCosts: stringArraySchema,
  quantitativeBenefits: stringArraySchema,
  qualitativeBenefits: stringArraySchema,
  risks: { type: "array", minItems: 3, maxItems: 5, items: riskSchema },
  verdicts: { type: "array", minItems: 5, maxItems: 5, items: verdictSchema },
  decision: { type: "string", enum: ["go", "conditional-go", "no-go"] },
  preconditions: stringArraySchema,
});
const candidateSchema = strictObject({
  id: stringSchema,
  name: stringSchema,
  summary: stringSchema,
  advantages: { type: "array", minItems: 1, items: stringSchema },
  disadvantages: { type: "array", minItems: 1, items: stringSchema },
  estimatedCost: stringSchema,
  estimatedSchedule: stringSchema,
  ...sourceRefProperties,
  implementation: implementationSchema,
});

export const GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT: JsonSchemaResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "feasibility_implementation_result",
    strict: true,
    schema: toOpenAiStrictJsonSchema(strictObject({
      overview: stringSchema,
      candidates: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: candidateSchema,
      },
      reducedCandidateReason: stringSchema,
      recommendedCandidateId: stringSchema,
      recommendationRationale: stringSchema,
    })),
  },
};

function candidateSectionRepairFormat(
  name: string,
  keys: readonly string[],
): JsonSchemaResponseFormat {
  const implementationProperties = (
    implementationSchema.properties as Record<string, unknown>
  );
  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: true,
      schema: toOpenAiStrictJsonSchema(strictObject({
        candidateIndex: { type: "integer", minimum: 0, maximum: 1 },
        patch: strictObject(
          Object.fromEntries(keys.map((key) => [key, implementationProperties[key]])),
        ),
      })),
    },
  };
}

export const REPAIR_FEASIBILITY_TECHNICAL_RESPONSE_FORMAT =
  candidateSectionRepairFormat("feasibility_technical_repair", [
    "architecture",
    "dataStrategy",
    "integrations",
    "integrationRationale",
    "deploymentAndOperations",
    "securityAndCompliance",
  ]);
export const REPAIR_FEASIBILITY_DELIVERY_RESPONSE_FORMAT =
  candidateSectionRepairFormat("feasibility_delivery_repair", [
    "milestones",
    "risks",
  ]);
export const REPAIR_FEASIBILITY_ECONOMICS_RESPONSE_FORMAT =
  candidateSectionRepairFormat("feasibility_economics_repair", [
    "analysisPeriodAssumption",
    "costEstimates",
    "benefitEstimates",
    "absenceDeclarations",
    "oneTimeCosts",
    "recurringCosts",
    "quantitativeBenefits",
    "qualitativeBenefits",
  ]);
export const REPAIR_FEASIBILITY_VERDICT_RESPONSE_FORMAT =
  candidateSectionRepairFormat("feasibility_verdict_repair", [
    "verdicts",
    "decision",
    "preconditions",
  ]);

export const FEASIBILITY_SECTION_REPAIR_RESPONSE_FORMATS = {
  technical: REPAIR_FEASIBILITY_TECHNICAL_RESPONSE_FORMAT,
  delivery: REPAIR_FEASIBILITY_DELIVERY_RESPONSE_FORMAT,
  economics: REPAIR_FEASIBILITY_ECONOMICS_RESPONSE_FORMAT,
  verdict: REPAIR_FEASIBILITY_VERDICT_RESPONSE_FORMAT,
} as const;

export function getGenerateFeasibilityContextResponseFormat(
  model: ModelCapabilitySource,
) {
  return getStructuredResponseFormat(model, GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT);
}

export function getGenerateFeasibilityImplementationResponseFormat(
  model: ModelCapabilitySource,
) {
  return getStructuredResponseFormat(
    model,
    GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT,
  );
}
