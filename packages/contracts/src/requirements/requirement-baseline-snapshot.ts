// Creates immutable rule snapshots without reinterpreting their business meaning.
import { snapshotInputFingerprint } from "../fingerprints.js";
import { requirementBaselineSchema, requirementRuleSchema, requirementRuleFacts, type RequirementBaseline, type RequirementRule } from "./requirements.js";

export function createRequirementBaselineSnapshot(input: {
  runId: string;
  requirementText: string;
  rules: RequirementRule[];
  previousBaseline?: RequirementBaseline | null;
  previousRules?: RequirementRule[];
  createdAt?: string;
  origin?: "generated" | "manual";
}): RequirementBaseline {
  const previous = input.previousBaseline ? requirementBaselineSchema.parse(input.previousBaseline) : null;
  const used = new Set<string>();
  const rules = input.rules.map((value) => {
    const rule = requirementRuleSchema.parse("requirementId" in value ? requirementRuleFacts(value) : value);
    const base = rule.id.trim() || "r";
    let id = base;
    let suffix = 2;
    while (used.has(id.toLowerCase())) id = `${base}-${suffix++}`;
    used.add(id.toLowerCase());
    return { ...rule, id };
  });
  const fingerprint = snapshotInputFingerprint({ requirementText: input.requirementText, rules });
  if (previous && previous.sourceInputFingerprint === fingerprint &&
      snapshotInputFingerprint({ requirementText: input.requirementText, rules: previous.rules.map(requirementRuleFacts) }) === fingerprint) {
    return structuredClone(previous);
  }

  const previousRules = new Map(previous?.rules.map((rule) => [rule.id, rule]));
  const previousSourceRules = new Map(input.previousRules?.map((rule) => [rule.id, rule]));
  const reservedIds = new Set(rules.flatMap((rule) => {
    const id = previousRules.get(rule.id)?.requirementId;
    return id ? [id] : [];
  }));
  const usedRequirementIds = new Set<string>();
  const unchangedIds = new Set<string>();
  const snapshots = rules.map((rule) => {
    const old = previousRules.get(rule.id);
    const previousRule = old ?? previousSourceRules.get(rule.id);
    const unchanged = previousRule
      ? snapshotInputFingerprint(requirementRuleFacts(previousRule)) === snapshotInputFingerprint(rule)
      : false;
    // Stable IDs survive edits and deletion of preceding rules; never use array positions.
    const numericRuleId = /^r(\d+)$/i.exec(rule.id);
    const baseId = old?.requirementId ??
      `REQ-${numericRuleId ? numericRuleId[1]!.padStart(3, "0") : rule.id}`;
    let requirementId = baseId;
    let suffix = 2;
    while (usedRequirementIds.has(requirementId) || (!old && reservedIds.has(requirementId))) {
      requirementId = `${baseId}-${suffix++}`;
    }
    usedRequirementIds.add(requirementId);
    if (unchanged) unchangedIds.add(requirementId);
    return {
      ...rule,
      requirementId,
      origin: unchanged ? old?.origin ?? "generated" as const : input.origin === "manual"
        ? previousRule ? "manual-edited" as const : "manual-added" as const
        : "generated" as const,
    };
  });
  // Keep explicit unresolved records only while their referenced rules are unchanged.
  const issues = previous?.qualityReport.issues.filter((issue) => issue.requirementId && unchangedIds.has(issue.requirementId)) ?? [];
  const conflicts = previous?.conflicts.filter((conflict) => conflict.requirementIds.every((id) => unchangedIds.has(id))) ?? [];
  const assumptions = previous?.assumptions.filter((item) => item.requirementId && unchangedIds.has(item.requirementId)) ?? [];
  return requirementBaselineSchema.parse({
    schemaVersion: 3,
    id: `baseline:${fingerprint}`,
    version: (previous?.version ?? 0) + 1,
    runId: input.runId,
    sourceInputFingerprint: fingerprint,
    sourceDocumentId: previous?.sourceDocumentId ?? "inline-requirement",
    rules: snapshots,
    assumptions,
    conflicts,
    qualityReport: {
      runId: input.runId,
      status: issues.length || conflicts.length ? "pending-review" : "passed",
      summary: `已保存 ${rules.length} 条需求规则快照；保存不代表人工审核。`,
      issues,
      blockingIssueIds: [],
      reviewRequiredRequirementIds: [],
    },
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

// Prompt consumers with rules already in context receive metadata only. Design
// consumers receive complete rule text, including constraints absent from UML.
export function requirementBaselinePromptContext(baseline: RequirementBaseline, rulesProvided: boolean | readonly string[] = false) {
  const providedIds = Array.isArray(rulesProvided) ? new Set(rulesProvided) : null;
  return {
    ...(rulesProvided === true ? {} : {
      rules: baseline.rules.filter(rule => !providedIds?.has(rule.id)).map(({ id, text, type }) => ({ id, text, type })),
    }),
    ...(baseline.conflicts.length ? { conflicts: baseline.conflicts } : {}),
    ...(baseline.assumptions.length ? { assumptions: baseline.assumptions } : {}),
    ...(baseline.qualityReport.issues.length ? { issues: baseline.qualityReport.issues } : {}),
  };
}
