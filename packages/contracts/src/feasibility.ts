// Defines editable feasibility facts, context traceability, implementation plans, and run snapshots.
import { z } from "zod";
import { feasibilityActivityDiagramSpecSchema, contextDiagramSpecSchema, plantUmlArtifactSchema, svgArtifactSchema } from "./models.js";
import { requirementBaselineSchema, requirementRulesSchema } from "./requirements.js";
import { providerSettingsSchema } from "./provider-configs.js";
import { snapshotInputFingerprint } from "./fingerprints.js";
import { diagramVisualReviewSchema } from "./visual-review.js";

const optionalText = z.string().trim().default("");
const optionalNumber = z.number().nonnegative().nullable().default(null);

export const feasibilityArtifactKindSchema = z.enum(["context", "business-flow", "implementation"]);
export type FeasibilityArtifactKind = z.infer<typeof feasibilityArtifactKindSchema>;

// Feasibility activities have their own source mappings and never replace requirement models.
export const feasibilityBusinessFlowSchema = z.object({
  model: feasibilityActivityDiagramSpecSchema,
  traceability: z.array(z.object({
    requirementId: z.string().min(1),
    targetId: z.string().min(1),
    targetKind: z.enum(["swimlane", "node", "relationship"]),
  })).min(1),
});
export type FeasibilityBusinessFlow = z.infer<typeof feasibilityBusinessFlowSchema>;

export const feasibilityBusinessFlowArtifactSchema = feasibilityBusinessFlowSchema.extend({
  plantUml: plantUmlArtifactSchema,
  svg: svgArtifactSchema,
  fingerprint: z.string().min(1),
});
export type FeasibilityBusinessFlowArtifact = z.infer<typeof feasibilityBusinessFlowArtifactSchema>;

// A partial or mismatched render is not a generated artifact, even in historical workspaces.
export function readFeasibilityBusinessFlowArtifact(value: unknown): FeasibilityBusinessFlowArtifact | null {
  const parsed = feasibilityBusinessFlowArtifactSchema.safeParse(value);
  if (!parsed.success) return null;
  const artifact = parsed.data;
  return artifact.model.modelId && artifact.model.swimlanes.some((lane) => lane.id === "system") &&
    artifact.model.nodes.some((node) => node.type === "start") &&
    artifact.model.nodes.some((node) => node.type === "end") &&
    artifact.model.nodes.some((node) => node.type === "activity" && node.actorOrLane === "system") &&
    artifact.model.relationships.length > 0 && artifact.plantUml.source.trim() && artifact.svg.svg.trim() &&
    artifact.plantUml.diagramKind === "activity" && artifact.svg.diagramKind === "activity" &&
    artifact.plantUml.modelId === artifact.model.modelId && artifact.svg.modelId === artifact.model.modelId
    ? artifact : null;
}

export const acceptedRequirementSnapshotSchema = z.object({
  ruleIds: z.array(z.string().min(1)),
  baselineVersion: z.string().min(1).nullable(),
  fingerprint: z.string().min(1),
});
export type AcceptedRequirementSnapshot = z.infer<
  typeof acceptedRequirementSnapshotSchema
>;

export function buildAcceptedRequirementSnapshot(
  rawRules: unknown,
  rawBaseline: unknown,
) {
  const rules = requirementRulesSchema.parse(rawRules);
  const baselineResult = requirementBaselineSchema.nullable().safeParse(rawBaseline);
  // Historical workspaces may contain an older baseline quality-status enum.
  // They remain readable and fall back to the current rule list until reconfirmed.
  const baseline = baselineResult.success ? baselineResult.data : null;
  const acceptedIds = baseline
    ? new Set(
        baseline.requirements
          .filter((requirement) => requirement.status === "accepted")
          .map((requirement) => requirement.sourceRuleId)
          .filter((id): id is string => Boolean(id)),
      )
    : null;
  const acceptedRules = acceptedIds
    ? rules.filter((rule) => acceptedIds.has(rule.id))
    : rules;
  return {
    rules: acceptedRules,
    baseline,
    snapshot: acceptedRequirementSnapshotSchema.parse({
      ruleIds: acceptedRules.map((rule) => rule.id),
      baselineVersion: baseline?.runId ?? null,
      fingerprint: snapshotInputFingerprint({
        rules: acceptedRules,
        requirementBaseline: baseline,
      }),
    }),
  };
}

export const feasibilityContentProvenanceSchema = z.enum([
  "ai-estimate",
  "user-edited",
  "user-confirmed",
  "legacy",
]);
export type FeasibilityContentProvenance = z.infer<typeof feasibilityContentProvenanceSchema>;

export const feasibilityEstimateRangeSchema = z.object({
  minimum: z.number().nonnegative(),
  maximum: z.number().nonnegative(),
  currency: z.string().trim().min(1).default("CNY"),
  basis: z.string().trim().min(1),
  confidence: z.enum(["low", "medium", "high"]),
}).superRefine((range, context) => {
  if (range.maximum < range.minimum) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maximum"],
      message: "Estimate maximum must be greater than or equal to minimum.",
    });
  }
});
export type FeasibilityEstimateRange = z.infer<typeof feasibilityEstimateRangeSchema>;

export const feasibilityMoneyItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  amount: optionalNumber,
  frequency: z.enum(["one-time", "monthly", "annual"]).default("one-time"),
  note: optionalText,
});
export type FeasibilityMoneyItem = z.infer<typeof feasibilityMoneyItemSchema>;

export const feasibilityInputsSchema = z.object({
  projectName: optionalText,
  school: optionalText,
  college: optionalText,
  groupNumber: optionalText,
  members: optionalText,
  gradeClass: optionalText,
  submissionDate: optionalText,
  proposedBy: optionalText,
  developedBy: optionalText,
  expectedUsers: optionalText,
  targetEnvironment: optionalText,
  deadline: optionalText,
  expectedLifetimeYears: optionalNumber,
  budgetLimit: optionalNumber,
  teamSize: optionalNumber,
  teamSkills: optionalText,
  availableResources: optionalText,
  legalConstraints: optionalText,
  references: optionalText,
  costItems: z.array(feasibilityMoneyItemSchema).default([]),
  benefitItems: z.array(feasibilityMoneyItemSchema).default([]),
  analysisYears: optionalNumber,
});
export type FeasibilityInputs = z.infer<typeof feasibilityInputsSchema>;

// Share the exact semantic inputs across generation, editing, samples and report preflight.
// Render timestamps, SVG markup and PlantUML repairs do not change the implementation basis.
export function buildFeasibilityImplementationFingerprint(input: {
  rules: unknown;
  requirementBaseline: unknown;
  contextModel: unknown;
  businessFlow: FeasibilityBusinessFlow | null;
  inputs: unknown;
}) {
  const source = buildAcceptedRequirementSnapshot(input.rules, input.requirementBaseline);
  return snapshotInputFingerprint({
    rules: source.rules,
    requirementBaseline: source.baseline,
    contextModel: input.contextModel,
    businessFlow: input.businessFlow
      ? { model: input.businessFlow.model, traceability: input.businessFlow.traceability }
      : null,
    inputs: feasibilityInputsSchema.parse(input.inputs),
  });
}

export const feasibilitySourceRefSchema = z.object({
  sourceRequirementIds: z.array(z.string().min(1)).default([]),
  assumption: optionalText,
  provenance: feasibilityContentProvenanceSchema.default("legacy"),
});

export const feasibilityModuleSchema = feasibilitySourceRefSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  responsibility: z.string().min(1),
});

// Integrations are tied to the feasibility context boundary. Historical
// workspaces did not persist that link, so null remains readable as legacy data.
export const feasibilityIntegrationSchema = feasibilitySourceRefSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  responsibility: z.string().min(1),
  contextExternalSystemId: z.string().min(1).nullable().default(null),
});
export type FeasibilityIntegration = z.infer<typeof feasibilityIntegrationSchema>;

export const feasibilityMilestoneSchema = feasibilitySourceRefSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  timeframe: z.string().min(1),
  deliverables: z.array(z.string().min(1)).default([]),
  roles: z.array(z.string().min(1)).default([]),
  dependencies: z.array(z.string().min(1)).default([]),
  dependencyRationale: optionalText,
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
});

export const feasibilityRiskSchema = feasibilitySourceRefSchema.extend({
  id: z.string().min(1),
  risk: z.string().min(1),
  probability: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high"]),
  mitigation: z.string().min(1),
  owner: z.string().min(1).default("待确认"),
  provenance: feasibilityContentProvenanceSchema.default("legacy"),
});

export const feasibilityVerdictSchema = z.object({
  category: z.enum(["technical", "operational", "schedule", "economic", "legal"]),
  verdict: z.enum(["feasible", "conditional", "not-feasible", "unknown"]),
  rationale: z.string().min(1),
  provenance: feasibilityContentProvenanceSchema.default("legacy"),
});

export const feasibilityCostEstimateSchema = feasibilitySourceRefSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(["capital", "other-one-time", "recurring"]),
  frequency: z.enum(["one-time", "monthly", "annual"]),
  range: feasibilityEstimateRangeSchema,
  note: optionalText,
  provenance: feasibilityContentProvenanceSchema.default("ai-estimate"),
});
export type FeasibilityCostEstimate = z.infer<typeof feasibilityCostEstimateSchema>;

export const feasibilityBenefitEstimateSchema = feasibilitySourceRefSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(["one-time", "recurring", "intangible"]),
  frequency: z.enum(["one-time", "monthly", "annual"]),
  range: feasibilityEstimateRangeSchema.nullable(),
  outcome: z.string().min(1),
  provenance: feasibilityContentProvenanceSchema.default("ai-estimate"),
}).superRefine((benefit, context) => {
  if (benefit.category !== "intangible" && !benefit.range) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["range"],
      message: "Quantifiable benefits require an estimate range.",
    });
  }
  if (benefit.category === "intangible" && benefit.range) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["range"],
      message: "Intangible benefits must not contain a monetary range.",
    });
  }
});
export type FeasibilityBenefitEstimate = z.infer<typeof feasibilityBenefitEstimateSchema>;

export const feasibilityAbsenceDeclarationSchema = z.object({
  scope: z.enum([
    "integrations",
    "dependencies",
    "capital-costs",
    "other-one-time-costs",
    "recurring-costs",
    "one-time-benefits",
    "recurring-benefits",
    "intangible-benefits",
  ]),
  reason: z.string().min(1),
  provenance: feasibilityContentProvenanceSchema.default("ai-estimate"),
});
export type FeasibilityAbsenceDeclaration = z.infer<typeof feasibilityAbsenceDeclarationSchema>;

export const feasibilityCandidateImplementationSchema = z.object({
  provenance: feasibilityContentProvenanceSchema.default("legacy"),
  architecture: z.object({
    summary: z.string().min(1),
    modules: z.array(feasibilityModuleSchema).min(1),
  }),
  dataStrategy: feasibilitySourceRefSchema.extend({ summary: z.string().min(1) }),
  integrations: z.array(feasibilityIntegrationSchema).default([]),
  integrationRationale: optionalText,
  deploymentAndOperations: feasibilitySourceRefSchema.extend({ summary: z.string().min(1) }),
  securityAndCompliance: feasibilitySourceRefSchema.extend({ summary: z.string().min(1) }),
  milestones: z.array(feasibilityMilestoneSchema).min(1),
  analysisPeriodAssumption: z.object({
    years: z.number().positive(),
    basis: z.string().min(1),
    provenance: feasibilityContentProvenanceSchema.default("ai-estimate"),
  }).nullable().default(null),
  costEstimates: z.array(feasibilityCostEstimateSchema).default([]),
  benefitEstimates: z.array(feasibilityBenefitEstimateSchema).default([]),
  absenceDeclarations: z.array(feasibilityAbsenceDeclarationSchema).default([]),
  oneTimeCosts: z.array(z.string().min(1)).default([]),
  recurringCosts: z.array(z.string().min(1)).default([]),
  quantitativeBenefits: z.array(z.string().min(1)).default([]),
  qualitativeBenefits: z.array(z.string().min(1)).default([]),
  risks: z.array(feasibilityRiskSchema).default([]),
  verdicts: z.array(feasibilityVerdictSchema).length(5),
  decision: z.enum(["go", "conditional-go", "no-go"]),
  preconditions: z.array(z.string().min(1)).default([]),
});
export type FeasibilityCandidateImplementation = z.infer<typeof feasibilityCandidateImplementationSchema>;

export const feasibilityCandidateSchema = feasibilitySourceRefSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  advantages: z.array(z.string().min(1)).default([]),
  disadvantages: z.array(z.string().min(1)).default([]),
  estimatedCost: z.string().min(1),
  estimatedSchedule: z.string().min(1),
  implementation: feasibilityCandidateImplementationSchema.nullable(),
  provenance: feasibilityContentProvenanceSchema.default("legacy"),
});

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function migrateLegacyImplementationPlan(value: unknown) {
  const plan = asRecord(value);
  if (!plan || !Array.isArray(plan.candidates)) return value;
  const recommendedCandidateId = typeof plan.recommendedCandidateId === "string"
    ? plan.recommendedCandidateId
    : "";
  const legacyImplementation = feasibilityCandidateImplementationSchema.safeParse({
    architecture: plan.architecture,
    dataStrategy: plan.dataStrategy,
    integrations: plan.integrations,
    deploymentAndOperations: plan.deploymentAndOperations,
    securityAndCompliance: plan.securityAndCompliance,
    milestones: plan.milestones,
    oneTimeCosts: plan.oneTimeCosts,
    recurringCosts: plan.recurringCosts,
    quantitativeBenefits: plan.quantitativeBenefits,
    qualitativeBenefits: plan.qualitativeBenefits,
    risks: plan.risks,
    verdicts: plan.verdicts,
    decision: plan.decision,
    preconditions: plan.preconditions,
  });
  return {
    overview: plan.overview,
    candidates: plan.candidates.map((candidate) => {
      const record = asRecord(candidate);
      if (!record) return candidate;
      if ("implementation" in record) return record;
      return {
        ...record,
        implementation:
          record.id === recommendedCandidateId && legacyImplementation.success
            ? legacyImplementation.data
            : null,
      };
    }),
    reducedCandidateReason: plan.reducedCandidateReason,
    recommendedCandidateId: plan.recommendedCandidateId,
    recommendationRationale: plan.recommendationRationale,
  };
}

const currentFeasibilityImplementationPlanSchema = z.object({
  overview: z.string().min(1),
  candidates: z.array(feasibilityCandidateSchema).min(1).max(3),
  reducedCandidateReason: optionalText,
  recommendedCandidateId: z.string().min(1),
  recommendationRationale: z.string().min(1),
}).superRefine((plan, context) => {
  if (!plan.candidates.some((candidate) => candidate.id === plan.recommendedCandidateId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recommendedCandidateId"],
      message: "Recommended candidate must reference an existing candidate.",
    });
  }
});

export const completeFeasibilityImplementationPlanSchema = currentFeasibilityImplementationPlanSchema.superRefine(
  (plan, context) => {
    if (plan.candidates.length !== 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["candidates"],
        message: "Generated feasibility plans must contain exactly two candidates.",
      });
    }
    plan.candidates.forEach((candidate, index) => {
      if (!candidate.implementation) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidates", index, "implementation"],
          message: "Every candidate must have complete implementation details.",
        });
        return;
      }
      if (candidate.advantages.length === 0 || candidate.disadvantages.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidates", index],
          message: "Every candidate must include advantages and disadvantages.",
        });
      }
      const implementation = candidate.implementation;
      if (implementation.costEstimates.length === 0 || implementation.benefitEstimates.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidates", index, "implementation"],
          message: "Every candidate must include cost and benefit estimates.",
        });
      }
      if (!implementation.analysisPeriodAssumption) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidates", index, "implementation", "analysisPeriodAssumption"],
          message: "Every candidate must include an analysis period assumption.",
        });
      }
      if (implementation.risks.length < 3 || implementation.risks.length > 5) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidates", index, "implementation", "risks"],
          message: "Every candidate must include three to five risks.",
        });
      }
      if (implementation.integrations.length === 0 && !implementation.integrationRationale.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidates", index, "implementation", "integrationRationale"],
          message: "Candidates without integrations must explain why none are required.",
        });
      }
      implementation.milestones.forEach((milestone, milestoneIndex) => {
        if (milestone.dependencies.length === 0 && !milestone.dependencyRationale.trim()) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["candidates", index, "implementation", "milestones", milestoneIndex, "dependencyRationale"],
            message: "Milestones without dependencies must explain why none are required.",
          });
        }
      });
      const requiredScopes: Array<[string, boolean]> = [
        ["capital-costs", implementation.costEstimates.some((item) => item.category === "capital")],
        ["other-one-time-costs", implementation.costEstimates.some((item) => item.category === "other-one-time")],
        ["recurring-costs", implementation.costEstimates.some((item) => item.category === "recurring")],
        ["one-time-benefits", implementation.benefitEstimates.some((item) => item.category === "one-time")],
        ["recurring-benefits", implementation.benefitEstimates.some((item) => item.category === "recurring")],
        ["intangible-benefits", implementation.benefitEstimates.some((item) => item.category === "intangible")],
      ];
      for (const [scope, present] of requiredScopes) {
        const declarationIndex = implementation.absenceDeclarations.findIndex((item) => item.scope === scope);
        if (!present && declarationIndex === -1) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["candidates", index, "implementation", "absenceDeclarations"],
            message: `Missing an item or absence declaration for ${scope}.`,
          });
        }
        if (present && declarationIndex !== -1) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["candidates", index, "implementation", "absenceDeclarations", declarationIndex],
            message: `An absence declaration cannot coexist with an item for ${scope}.`,
          });
        }
      }
      const declaredScopes = implementation.absenceDeclarations.map((item) => item.scope);
      if (new Set(declaredScopes).size !== declaredScopes.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidates", index, "implementation", "absenceDeclarations"],
          message: "Absence declaration scopes must be unique.",
        });
      }
    });
  },
);

// Old workspaces stored one global implementation. Normalize it onto the old
// recommendation only, so alternative candidates are never presented as fake copies.
export const feasibilityImplementationPlanSchema = z.preprocess(
  migrateLegacyImplementationPlan,
  currentFeasibilityImplementationPlanSchema,
);
export type FeasibilityImplementationPlan = z.infer<typeof feasibilityImplementationPlanSchema>;

export const contextTraceRowSchema = z.object({
  requirementId: z.string().min(1),
  targetId: z.string().min(1),
  targetKind: z.enum(["person", "external-system", "relationship"]),
  targetLabel: z.string().min(1),
});
export type ContextTraceRow = z.infer<typeof contextTraceRowSchema>;

export const startFeasibilityRunRequestSchema = z.object({
  projectId: z.string().min(1),
  selectedArtifacts: z.array(feasibilityArtifactKindSchema).min(1).superRefine((artifacts, context) => {
    if (new Set(artifacts).size !== artifacts.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selected feasibility artifacts must be unique.",
      });
    }
  }),
  providerSettings: providerSettingsSchema,
});
export type StartFeasibilityRunRequest = z.infer<typeof startFeasibilityRunRequestSchema>;

export const feasibilityRunStageSchema = z.enum([
  "generate_business_flow",
  "render_business_flow",
  "generate_context",
  "render_context",
  "verify_diagram_visual",
  "generate_implementation",
]);
export type FeasibilityRunStage = z.infer<typeof feasibilityRunStageSchema>;

export const feasibilityRepairSectionSchema = z.enum([
  "business-flow",
  "context",
  "technical",
  "delivery",
  "economics",
  "verdict",
  "plan",
]);
export type FeasibilityRepairSection = z.infer<typeof feasibilityRepairSectionSchema>;

export const feasibilityValidationIssueSchema = z.object({
  path: z.string(),
  candidateIndex: z.number().int().nonnegative().nullable().default(null),
  section: feasibilityRepairSectionSchema,
  reason: z.string().min(1),
});
export type FeasibilityValidationIssue = z.infer<typeof feasibilityValidationIssueSchema>;

export const feasibilityGenerationDiagnosticsSchema = z.object({
  requestedMode: z.enum(["strict_json", "json_object", "compatible"]),
  effectiveMode: z.enum(["strict_json", "json_object", "compatible"]),
  downgradeReasons: z.array(z.string().min(1)).default([]),
  normalizationActions: z.array(z.string().min(1)).default([]),
  repairs: z.array(z.object({
    stage: z.enum(["context", "business-flow", "implementation"]),
    candidateIndex: z.number().int().nonnegative().nullable().default(null),
    section: feasibilityRepairSectionSchema,
    round: z.number().int().positive(),
    succeeded: z.boolean(),
  })).default([]),
});
export type FeasibilityGenerationDiagnostics = z.infer<
  typeof feasibilityGenerationDiagnosticsSchema
>;

// Mirrors the shared RunError shape without importing runs.ts back into this
// leaf contract, which keeps feasibility available to the common run union.
export const feasibilityRunErrorSchema = z.object({
  code: z.enum([
    "USER_ENTITLEMENT_REQUIRED",
    "USER_ENTITLEMENT_NEGATIVE_BALANCE",
    "PLATFORM_PROVIDER_BALANCE_INSUFFICIENT",
    "PLATFORM_PROVIDER_AUTH_FAILED",
    "PLATFORM_PROVIDER_RATE_LIMITED",
    "PLATFORM_PROVIDER_UNAVAILABLE",
    "PLATFORM_PROVIDER_TIMEOUT",
    "RUN_MODEL_OUTPUT_EMPTY",
    "RUN_STRUCTURED_OUTPUT_INVALID",
    "RUN_DEPENDENCY_MISSING",
    "RUN_RENDER_FAILED",
    "RUN_CANCELLED",
    "RUN_INTERNAL_ERROR",
    "RUN_LEGACY_FAILURE",
  ]),
  message: z.string().min(1),
  category: z.enum(["user_entitlement", "platform_provider", "generation", "render", "access", "internal"]),
  retryable: z.boolean(),
  params: z.record(
    z.string().min(1),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ).optional(),
  details: z.record(z.string().min(1), z.unknown()).optional(),
});

export const feasibilityRunSnapshotSchema = z.object({
  runId: z.string().min(1),
  projectId: z.string().min(1),
  selectedArtifacts: z.array(feasibilityArtifactKindSchema),
  providerSettings: providerSettingsSchema,
  rules: requirementRulesSchema,
  requirementBaseline: requirementBaselineSchema.nullable(),
  requirementSource: acceptedRequirementSnapshotSchema.nullable().default(null),
  inputs: feasibilityInputsSchema,
  businessFlow: feasibilityBusinessFlowArtifactSchema.nullable().default(null),
  contextModel: contextDiagramSpecSchema.nullable(),
  contextTraceability: z.array(contextTraceRowSchema).default([]),
  contextPlantUml: plantUmlArtifactSchema.nullable(),
  contextSvg: svgArtifactSchema.nullable(),
  visualReviews: z.record(z.string().min(1), diagramVisualReviewSchema).default({}),
  implementationPlan: feasibilityImplementationPlanSchema.nullable(),
  contextFingerprint: z.string().nullable(),
  implementationFingerprint: z.string().nullable(),
  generationDiagnostics: feasibilityGenerationDiagnosticsSchema.nullable().default(null),
  currentStage: feasibilityRunStageSchema.nullable(),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  error: feasibilityRunErrorSchema.nullable(),
});
export type FeasibilityRunSnapshot = z.infer<typeof feasibilityRunSnapshotSchema>;
