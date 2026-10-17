// Creates immutable rule snapshots without reinterpreting their business meaning.
import { snapshotInputFingerprint } from "./fingerprints.js";
import { requirementBaselineSchema, requirementRuleSchema, type AtomicRequirement, type AtomicRequirementField, type RequirementBaseline, type RequirementRule } from "./requirements.js";

function legacyManualFields(requirement: AtomicRequirement) {
  const fields: Partial<Record<AtomicRequirementField, string>> = {};
  for (const [key, provenance] of Object.entries(requirement.fieldProvenance)) {
    if (provenance?.source !== "manual" || provenance.status === "rejected") continue;
    const field = key as AtomicRequirementField;
    const value = provenance.value ?? (field === "acceptanceCriteria"
      ? requirement.acceptanceCriteria.join("；") : requirement[field]);
    if (value?.trim()) fields[field] = value;
  }
  return fields;
}

export type BaselineTraceRequirement = Omit<AtomicRequirement, "status" | "confidence" | "criticality" | "fieldProvenance"> & {
  status: AtomicRequirement["status"] | "generated";
  confidence?: number;
};

// Transient compatibility view for coverage and older document consumers. The
// full rule is carried as text; no actor/object extraction or review is inferred.
export function requirementBaselineTraceEntries(baseline: RequirementBaseline): BaselineTraceRequirement[] {
  if (!baseline.rules) return baseline.requirements;
  const types: Record<RequirementRule["category"], AtomicRequirement["type"]> = {
    业务规则: "business-rule", 功能需求: "functional", 外部接口: "interface", 界面需求: "interface",
    数据需求: "data", 非功能需求: "non-functional", 部署需求: "constraint", 异常处理: "exception",
  };
  return baseline.rules.map((rule) => ({
    id: rule.requirementId, sourceRuleId: rule.id, type: types[rule.category],
    sourceFragment: rule.sourceFragment ?? rule.text,
    action: rule.text, actor: null, subject: null, object: null, condition: null, outcome: null,
    acceptanceCriteria: [], status: "generated",
  }));
}

export function createRequirementBaselineSnapshot(input: {
  runId: string;
  requirementText: string;
  rules: RequirementRule[];
  previousBaseline?: RequirementBaseline | null;
  previousRules?: RequirementRule[];
  createdAt?: string;
  origin?: "generated" | "manual";
}): RequirementBaseline {
  const previous = input.previousBaseline;
  const used = new Set<string>();
  const rules = input.rules.map((value) => {
    const rule = requirementRuleSchema.parse(value);
    const base = rule.id.trim() || "r";
    let id = base;
    let suffix = 2;
    while (used.has(id.toLowerCase())) id = `${base}-${suffix++}`;
    used.add(id.toLowerCase());
    return { ...rule, id };
  });
  const fingerprint = snapshotInputFingerprint({ requirementText: input.requirementText, rules });
  if (previous?.schemaVersion === 2 && previous.sourceInputFingerprint === fingerprint && previous.rules &&
      snapshotInputFingerprint({ requirementText: input.requirementText, rules: previous.rules.map(rule => requirementRuleSchema.parse(rule)) }) === fingerprint) {
    return structuredClone(previous);
  }

  const previousRules = new Map(previous?.rules?.map((rule) => [rule.id, rule]));
  const previousSourceRules = new Map(input.previousRules?.map((rule) => [rule.id, rule]));
  const legacy = new Map(previous?.requirements.map((item) => [item.sourceRuleId, item]));
  const reservedIds = new Set(rules.flatMap((rule) => {
    const id = previousRules.get(rule.id)?.requirementId ?? legacy.get(rule.id)?.id;
    return id ? [id] : [];
  }));
  const usedRequirementIds = new Set<string>();
  const unchangedIds = new Set<string>();
  const snapshots = rules.map((rule) => {
    const old = previousRules.get(rule.id);
    const oldAtomic = legacy.get(rule.id);
    const previousRule = old ?? previousSourceRules.get(rule.id);
    const unchanged = previousRule
      ? snapshotInputFingerprint(requirementRuleSchema.parse(previousRule)) === snapshotInputFingerprint(rule)
      : oldAtomic?.sourceFragment === rule.text;
    // Stable IDs survive edits and deletion of preceding rules; never use array positions.
    const numericRuleId = /^r(\d+)$/i.exec(rule.id);
    const baseId = old?.requirementId ?? oldAtomic?.id ??
      `REQ-${numericRuleId ? numericRuleId[1]!.padStart(3, "0") : rule.id}`;
    let requirementId = baseId;
    let suffix = 2;
    while (usedRequirementIds.has(requirementId) || (!old && !oldAtomic && reservedIds.has(requirementId))) {
      requirementId = `${baseId}-${suffix++}`;
    }
    usedRequirementIds.add(requirementId);
    if (unchanged) unchangedIds.add(requirementId);
    const manualFields = unchanged && old ? old.manualFields : unchanged && oldAtomic
      ? legacyManualFields(oldAtomic)
      : undefined;
    return {
      ...rule,
      requirementId,
      origin: unchanged ? old?.origin ?? "legacy" as const : input.origin === "manual"
        ? previousRule || oldAtomic ? "manual-edited" as const : "manual-added" as const
        : "generated" as const,
      ...(manualFields && Object.keys(manualFields).length ? { manualFields } : {}),
    };
  });
  // Keep explicit unresolved records only while their referenced rules are unchanged.
  const issues = previous?.qualityReport.issues.filter((issue) => issue.requirementId && unchangedIds.has(issue.requirementId)) ?? [];
  const conflicts = previous?.conflicts.filter((conflict) => conflict.requirementIds.every((id) => unchangedIds.has(id))) ?? [];
  const assumptions = previous?.assumptions.filter((item) => item.requirementId && unchangedIds.has(item.requirementId)) ?? [];
  return requirementBaselineSchema.parse({
    schemaVersion: 2,
    id: `baseline:${fingerprint}`,
    version: (previous?.version ?? (previous ? 1 : 0)) + 1,
    runId: input.runId,
    sourceInputFingerprint: fingerprint,
    sourceDocumentId: previous?.sourceDocumentId ?? "inline-requirement",
    rules: snapshots,
    requirements: [],
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
  const manualEdits = baseline.rules?.filter((rule) => rule.manualFields && Object.keys(rule.manualFields).length)
    .map((rule) => ({ id: rule.id, fields: rule.manualFields }))
    ?? baseline.requirements.flatMap((item) => {
      const fields = legacyManualFields(item);
      return Object.keys(fields).length ? [{ id: item.sourceRuleId ?? item.id, fields }] : [];
    });
  return {
    ...(rulesProvided && manualEdits.length ? { manualEdits } : {}),
    ...(rulesProvided === true ? {} : {
      rules: baseline.rules?.filter(rule => !providedIds?.has(rule.id)).map(({ id, category, text, manualFields }) => ({ id, category, text, ...(manualFields ? { manualFields } : {}) }))
        ?? baseline.requirements.filter(item => !providedIds?.has(item.sourceRuleId ?? item.id)).map((item) => ({
          id: item.sourceRuleId ?? item.id,
          type: item.type,
          text: item.sourceFragment,
          ...(Object.keys(legacyManualFields(item)).length ? { manualFields: legacyManualFields(item) } : {}),
        })),
    }),
    ...(baseline.conflicts.length ? { conflicts: baseline.conflicts } : {}),
    ...(baseline.assumptions.length ? { assumptions: baseline.assumptions } : {}),
    ...(baseline.qualityReport.issues.length ? { issues: baseline.qualityReport.issues } : {}),
  };
}
