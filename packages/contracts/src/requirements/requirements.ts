// Requirement, coverage, traceability, and UML diagram kind contract schemas shared across run stages.
import { z } from "zod";
import { requirementRuleTypeSchema } from "./requirement-rule-types.js";

export const diagramKindSchema = z.enum([
  "context",
  "function",
  "usecase",
  "class",
  "activity",
  "deployment",
  "prototype",
  "analysis",
]);
export type DiagramKind = z.infer<typeof diagramKindSchema>;

export const designDiagramKindSchema = z.enum([
  "architecture",
  "sequence",
  "navigation",
  "class",
  "component",
  "deployment",
  "table",
]);
export type DesignDiagramKind = z.infer<typeof designDiagramKindSchema>;

export const umlDiagramKindSchema = z.union([
  diagramKindSchema,
  designDiagramKindSchema,
]);
export type UmlDiagramKind = z.infer<typeof umlDiagramKindSchema>;

export const requirementRuleSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  sourceFragment: z.string().min(1).optional(),
  type: requirementRuleTypeSchema,
}).strict();
export type RequirementRule = z.infer<typeof requirementRuleSchema>;

// Project a validated snapshot back to rule facts without its snapshot-only metadata.
export function requirementRuleFacts({ id, type, text, sourceFragment }: RequirementRule): RequirementRule {
  return { id, type, text, ...(sourceFragment === undefined ? {} : { sourceFragment }) };
}

function addDuplicateRequirementRuleIdIssues(
  rules: RequirementRule[],
  ctx: z.RefinementCtx,
) {
  const seen = new Map<string, number>();
  rules.forEach((rule, index) => {
    const key = rule.id.trim().toLowerCase();
    const firstIndex = seen.get(key);
    if (firstIndex === undefined) {
      seen.set(key, index);
      return;
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Requirement rule id "${rule.id}" duplicates rule at index ${firstIndex}.`,
      path: [index, "id"],
    });
  });
}

export function requirementRulesArraySchema(minLength = 0) {
  const schema = z.array(requirementRuleSchema);
  return (minLength > 0 ? schema.min(minLength) : schema).superRefine(
    addDuplicateRequirementRuleIdIssues,
  );
}

export const requirementRulesSchema = requirementRulesArraySchema();

export const requirementRulesResultSchema = z.object({
  rules: requirementRulesSchema,
}).strict();
export type RequirementRulesResult = z.infer<typeof requirementRulesResultSchema>;

// Extracted rules must carry real source evidence; manual rules may omit it.
export const extractedRequirementsSchema = z.object({
  rules: z.array(requirementRuleSchema.extend({ sourceFragment: z.string().min(1) })),
}).strict();

export const requirementCriticalitySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);
export type RequirementCriticality = z.infer<typeof requirementCriticalitySchema>;

export const requirementAssumptionSchema = z.object({
  id: z.string().min(1),
  requirementId: z.string().min(1).optional(),
  text: z.string().min(1),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
  status: z.enum(["accepted", "pending-review", "rejected", "derived"]),
});
export type RequirementAssumption = z.infer<typeof requirementAssumptionSchema>;

export const requirementConflictSchema = z.object({
  id: z.string().min(1),
  requirementIds: z.array(z.string().min(1)).min(2),
  description: z.string().min(1),
  severity: requirementCriticalitySchema,
  status: z.enum(["conflict", "pending-review", "resolved"]),
});
export type RequirementConflict = z.infer<typeof requirementConflictSchema>;

export const requirementQualityIssueSchema = z.object({
  id: z.string().min(1),
  requirementId: z.string().min(1).optional(),
  severity: z.enum(["info", "warning", "error", "critical"]),
  code: z.enum([
    "ambiguity",
    "conflict",
    "missing-actor",
    "missing-object",
    "missing-boundary",
    "non-verifiable",
    "low-confidence",
    "derived-assumption",
    "semantic-loss",
  ]),
  message: z.string().min(1),
  blocksDownstream: z.boolean(),
});
export type RequirementQualityIssue = z.infer<
  typeof requirementQualityIssueSchema
>;

export const requirementQualityReportSchema = z.object({
  runId: z.string().min(1),
  status: z.enum(["passed", "pending-review", "blocked"]),
  summary: z.string().min(1),
  issues: z.array(requirementQualityIssueSchema),
  blockingIssueIds: z.array(z.string().min(1)),
  reviewRequiredRequirementIds: z.array(z.string().min(1)),
});
export type RequirementQualityReport = z.infer<
  typeof requirementQualityReportSchema
>;

export const requirementBaselineSchema = z.object({
  // Reject previous classified snapshots rather than silently upgrading their semantics.
  schemaVersion: z.literal(3),
  id: z.string().min(1),
  version: z.number().int().positive(),
  rules: z.array(requirementRuleSchema.extend({
    requirementId: z.string().min(1),
    origin: z.enum(["generated", "manual-added", "manual-edited"]),
  })),
  runId: z.string().min(1),
  // Identifies requirement content independently of the task that consumes it.
  sourceInputFingerprint: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  assumptions: z.array(requirementAssumptionSchema),
  conflicts: z.array(requirementConflictSchema),
  qualityReport: requirementQualityReportSchema,
  createdAt: z.string().min(1),
}).strict();
export type RequirementBaseline = z.infer<typeof requirementBaselineSchema>;

export const coverageStatusSchema = z.enum([
  "covered",
  "partially-covered",
  "not-modelable",
  "pending-review",
  "conflict",
]);
export type CoverageStatus = z.infer<typeof coverageStatusSchema>;

export const coverageMatrixRowSchema = z.object({
  requirementId: z.string().min(1),
  status: coverageStatusSchema,
  rationale: z.string().min(1),
  modelElements: z.array(z.string().min(1)),
  designElements: z.array(z.string().min(1)),

  tests: z.array(z.string().min(1)),
  reviewItems: z.array(z.string().min(1)),
});
export type CoverageMatrixRow = z.infer<typeof coverageMatrixRowSchema>;

export const coverageMatrixSchema = z.object({
  runId: z.string().min(1),
  rows: z.array(coverageMatrixRowSchema),
});
export type CoverageMatrix = z.infer<typeof coverageMatrixSchema>;

export const traceabilityArtifactTypeSchema = z.enum([
  "requirement",
  "requirements-model",
  "design-model",

  "test",
  "evidence",
]);
export type TraceabilityArtifactType = z.infer<
  typeof traceabilityArtifactTypeSchema
>;

export const traceabilityLinkTypeSchema = z.enum([
  "satisfies",
  "refines",
  "implements",
  "verifies",
  "derives-from",
  "blocks",
]);
export type TraceabilityLinkType = z.infer<typeof traceabilityLinkTypeSchema>;

export const traceabilityLinkSchema = z.object({
  fromArtifactType: traceabilityArtifactTypeSchema,
  fromArtifactId: z.string().min(1),
  toArtifactType: traceabilityArtifactTypeSchema,
  toArtifactId: z.string().min(1),
  linkType: traceabilityLinkTypeSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});
export type TraceabilityLink = z.infer<typeof traceabilityLinkSchema>;

export const traceabilityDiagnosticSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "warning", "error", "critical"]),
  code: z.enum([
    "uncovered-requirement",
    "orphan-artifact",
    "shallow-trace",
    "fake-trace",
    "semantic-model-gap",
    "business-assertion-gap",
    "pending-review",
    "conflict",
  ]),
  message: z.string().min(1),
  artifactType: traceabilityArtifactTypeSchema.optional(),
  artifactId: z.string().min(1).optional(),
  requirementId: z.string().min(1).optional(),
  blocksCompletion: z.boolean(),
});
export type TraceabilityDiagnostic = z.infer<
  typeof traceabilityDiagnosticSchema
>;

export const traceabilityMatrixSchema = z.object({
  runId: z.string().min(1),
  links: z.array(traceabilityLinkSchema),
  diagnostics: z.array(traceabilityDiagnosticSchema).default([]),
});
export type TraceabilityMatrix = z.infer<typeof traceabilityMatrixSchema>;
