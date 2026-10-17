// Adapts run input to the shared versioned rule snapshot contract.
import {
  createRequirementBaselineSnapshot,
  type RequirementBaseline,
  type RequirementRule,
} from "@uml-platform/contracts";

// Extraction IDs are temporary sequence numbers. Reuse an identity only for a
// unique unchanged rule; manual edits continue to retain their explicit IDs.
export function reconcileExtractedRuleIds(rules: RequirementRule[], previous: RequirementBaseline | null | undefined, runId: string): RequirementRule[] {
  const oldRules = previous?.rules ?? previous?.requirements.map(rule => ({ id: rule.sourceRuleId ?? rule.id, text: rule.sourceFragment, category: undefined })) ?? [];
  if (!oldRules.length && (previous?.version ?? 1) <= 1) return rules;
  const key = (rule: { text: string; category?: string }) => JSON.stringify([rule.category, rule.text.trim()]);
  const counts = new Map<string, number>();
  for (const rule of rules) counts.set(key(rule), (counts.get(key(rule)) ?? 0) + 1);
  const used = new Set(oldRules.map(rule => rule.id));
  return rules.map((rule, index) => {
    const matches = oldRules.filter(old => key(old) === key(rule));
    if (counts.get(key(rule)) === 1 && matches.length === 1) return { ...rule, id: matches[0]!.id };
    // Run-scoped IDs cannot accidentally revive a deleted rule from an older extraction.
    const base = `r-${runId}-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    return { ...rule, id };
  });
}

export function buildRequirementBaseline(input: {
  runId: string;
  requirementText: string;
  rules: RequirementRule[];
  createdAt?: string;
  previousBaseline?: RequirementBaseline | null;
}): RequirementBaseline {
  return createRequirementBaselineSnapshot(input);
}

export function buildEmptyRequirementBaseline(input: { runId: string; createdAt?: string }): RequirementBaseline {
  return createRequirementBaselineSnapshot({ ...input, requirementText: "", rules: [] });
}

export function assertRequirementBaselineAllowsDownstream(
  baseline: RequirementBaseline | null | undefined,
): asserts baseline is RequirementBaseline {
  // Saving rules is sufficient for generation; it never certifies human review.
  if (!baseline) {
    throw new Error("RequirementBaseline blocked downstream generation: baseline is missing");
  }
}
