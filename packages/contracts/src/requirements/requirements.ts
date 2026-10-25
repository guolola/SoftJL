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
  rules: z.array(requirementRuleSchema.extend({ sourceFragment: z.string().min(1) })).min(1),
}).strict();

export const requirementBaselineSchema = z.object({
  // Reject previous classified snapshots rather than silently upgrading their semantics.
  schemaVersion: z.literal(3),
  id: z.string().min(1),
  version: z.number().int().positive(),
  rules: z.array(requirementRuleSchema.extend({
    requirementId: z.string().min(1),
  }).strict()),
  runId: z.string().min(1),
  // Identifies requirement content independently of the task that consumes it.
  sourceInputFingerprint: z.string().min(1),
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
