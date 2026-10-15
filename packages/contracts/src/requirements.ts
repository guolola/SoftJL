// Requirement, coverage, traceability, and UML diagram kind contract schemas shared across run stages.
import { z } from "zod";

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

export const ruleCategorySchema = z.enum([
  "业务规则",
  "功能需求",
  "外部接口",
  "界面需求",
  "数据需求",
  "非功能需求",
  "部署需求",
  "异常处理",
]);
export type RuleCategory = z.infer<typeof ruleCategorySchema>;

export const requirementRuleSchema = z.object({
  id: z.string().min(1),
  category: ruleCategorySchema,
  text: z.string().min(1),
  sourceFragment: z.string().min(1).optional(),
  relatedDiagrams: z.array(diagramKindSchema).min(1),
});
export type RequirementRule = z.infer<typeof requirementRuleSchema>;

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
});
export type RequirementRulesResult = z.infer<typeof requirementRulesResultSchema>;

export const atomicRequirementTypeSchema = z.enum([
  "functional",
  "non-functional",
  "data",
  "role",
  "constraint",
  "exception",
  "business-rule",
  "interface",
  "assumption",
]);
export type AtomicRequirementType = z.infer<typeof atomicRequirementTypeSchema>;

export const atomicRequirementStatusSchema = z.enum([
  "accepted",
  "ambiguous",
  "conflict",
  "pending-review",
  "rejected",
  "derived",
]);
export type AtomicRequirementStatus = z.infer<typeof atomicRequirementStatusSchema>;

export const requirementCriticalitySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);
export type RequirementCriticality = z.infer<typeof requirementCriticalitySchema>;

export const requirementPrioritySchema = z.enum(["must", "should", "could"]);
export type RequirementPriority = z.infer<typeof requirementPrioritySchema>;

export const requirementSourceLocationSchema = z.object({
  startOffset: z.number().int().min(0).optional(),
  endOffset: z.number().int().min(0).optional(),
  section: z.string().min(1).optional(),
});
export type RequirementSourceLocation = z.infer<
  typeof requirementSourceLocationSchema
>;

export const atomicRequirementFieldSchema = z.enum([
  "actor",
  "subject",
  "action",
  "object",
  "condition",
  "outcome",
  "acceptanceCriteria",
]);
export type AtomicRequirementField = z.infer<typeof atomicRequirementFieldSchema>;

export const requirementFieldProvenanceSourceSchema = z.enum([
  "source-text",
  "ai-suggested",
  "heuristic",
  "manual",
]);
export type RequirementFieldProvenanceSource = z.infer<
  typeof requirementFieldProvenanceSourceSchema
>;

export const requirementFieldReviewStatusSchema = z.enum([
  "accepted",
  "pending-review",
  "rejected",
]);
export type RequirementFieldReviewStatus = z.infer<
  typeof requirementFieldReviewStatusSchema
>;

export const requirementFieldProvenanceEntrySchema = z.object({
  source: requirementFieldProvenanceSourceSchema,
  status: requirementFieldReviewStatusSchema,
  value: z.string().min(1).nullable().optional(),
  originalValue: z.string().min(1).nullable().optional(),
  rationale: z.string().min(1).optional(),
  issueIds: z.array(z.string().min(1)).optional(),
});
export type RequirementFieldProvenanceEntry = z.infer<
  typeof requirementFieldProvenanceEntrySchema
>;

export const requirementFieldProvenanceSchema = z
  .object({
    actor: requirementFieldProvenanceEntrySchema.optional(),
    subject: requirementFieldProvenanceEntrySchema.optional(),
    action: requirementFieldProvenanceEntrySchema.optional(),
    object: requirementFieldProvenanceEntrySchema.optional(),
    condition: requirementFieldProvenanceEntrySchema.optional(),
    outcome: requirementFieldProvenanceEntrySchema.optional(),
    acceptanceCriteria: requirementFieldProvenanceEntrySchema.optional(),
  })
  .default({});
export type RequirementFieldProvenance = z.infer<
  typeof requirementFieldProvenanceSchema
>;

export const atomicRequirementSchema = z.object({
  id: z.string().min(1),
  sourceFragment: z.string().min(1),
  sourceLocation: requirementSourceLocationSchema.optional(),
  type: atomicRequirementTypeSchema,
  actor: z.string().min(1).nullable(),
  subject: z.string().min(1).nullable(),
  action: z.string().min(1).nullable(),
  object: z.string().min(1).nullable(),
  condition: z.string().min(1).nullable(),
  outcome: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),
  status: atomicRequirementStatusSchema,
  criticality: requirementCriticalitySchema,
  acceptanceCriteria: z.array(z.string().min(1)),
  fieldProvenance: requirementFieldProvenanceSchema,
  priority: requirementPrioritySchema.optional(),
  sourceRuleId: z.string().min(1).optional(),
});
export type AtomicRequirement = z.infer<typeof atomicRequirementSchema>;

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
  runId: z.string().min(1),
  sourceDocumentId: z.string().min(1),
  requirements: z.array(atomicRequirementSchema),
  assumptions: z.array(requirementAssumptionSchema),
  conflicts: z.array(requirementConflictSchema),
  qualityReport: requirementQualityReportSchema,
  createdAt: z.string().min(1),
});
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
