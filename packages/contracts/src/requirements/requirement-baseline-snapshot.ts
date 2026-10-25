// Creates immutable rule snapshots without reinterpreting their business meaning.
import { snapshotInputFingerprint } from "../fingerprints.js";
import { requirementBaselineSchema, requirementRuleSchema, requirementRuleFacts, type RequirementBaseline, type RequirementRule } from "./requirements.js";

export function createRequirementBaselineSnapshot(input: {
  runId: string;
  requirementText: string;
  rules: RequirementRule[];
  previousBaseline?: RequirementBaseline | null;
  createdAt?: string;
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
  const reservedIds = new Set(rules.flatMap((rule) => {
    const id = previousRules.get(rule.id)?.requirementId;
    return id ? [id] : [];
  }));
  const usedRequirementIds = new Set<string>();
  const snapshots = rules.map((rule) => {
    const old = previousRules.get(rule.id);
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
    return {
      ...rule,
      requirementId,
    };
  });
  return requirementBaselineSchema.parse({
    schemaVersion: 3,
    id: `baseline:${fingerprint}`,
    version: (previous?.version ?? 0) + 1,
    runId: input.runId,
    sourceInputFingerprint: fingerprint,
    rules: snapshots,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}
