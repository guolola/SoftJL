// Removes obsolete baseline entries when a requirement rule is edited or deleted.
import type { RequirementBaseline } from "@uml-platform/contracts";

export function removeRuleRequirements(
  baseline: RequirementBaseline,
  ruleIds: string[],
): RequirementBaseline {
  const targetRuleIds = new Set(ruleIds);
  const removedIds = new Set(
    baseline.rules
      .filter((requirement) => targetRuleIds.has(requirement.id))
      .map((requirement) => requirement.requirementId),
  );
  if (removedIds.size === 0) return baseline;
  const next: RequirementBaseline = {
    ...baseline,
    rules: baseline.rules.filter((requirement) => !removedIds.has(requirement.requirementId)),
    qualityReport: {
      ...baseline.qualityReport,
      issues: baseline.qualityReport.issues.filter(
        (issue) => !issue.requirementId || !removedIds.has(issue.requirementId),
      ),
    },
  };
  const blockingIssueIds = next.qualityReport.issues.filter((issue) => issue.blocksDownstream).map((issue) => issue.id);
  const reviewRequiredRequirementIds = baseline.qualityReport.reviewRequiredRequirementIds.filter(id => !removedIds.has(id));
  return {
    ...next,
    qualityReport: {
      ...next.qualityReport,
      blockingIssueIds,
      reviewRequiredRequirementIds,
      status: blockingIssueIds.length ? "blocked" : reviewRequiredRequirementIds.length || next.qualityReport.issues.length ? "pending-review" : "passed",
    },
  };
}
