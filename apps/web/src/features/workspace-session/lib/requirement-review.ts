// Removes obsolete baseline entries when a requirement rule is edited or deleted.
import type { RequirementBaseline } from "@uml-platform/contracts";

export function removeRuleRequirements(
  baseline: RequirementBaseline,
  ruleIds: string[],
): RequirementBaseline {
  const targetRuleIds = new Set(ruleIds);
  const removedIds = new Set(
    baseline.requirements
      .filter((requirement) => requirement.sourceRuleId && targetRuleIds.has(requirement.sourceRuleId))
      .map((requirement) => requirement.id),
  );
  if (removedIds.size === 0) return baseline;
  const next: RequirementBaseline = {
    ...baseline,
    requirements: baseline.requirements.filter((requirement) => !removedIds.has(requirement.id)),
    qualityReport: {
      ...baseline.qualityReport,
      issues: baseline.qualityReport.issues.filter(
        (issue) => !issue.requirementId || !removedIds.has(issue.requirementId),
      ),
    },
  };
  const blockingIssueIds = next.qualityReport.issues.filter((issue) => issue.blocksDownstream).map((issue) => issue.id);
  const reviewRequiredRequirementIds = next.requirements.filter((item) => item.status !== "accepted").map((item) => item.id);
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
