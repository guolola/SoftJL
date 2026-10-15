// Rebuilds requirement quality consistently when API and browser restore accepted reviews.
import type { RequirementBaseline, RequirementQualityIssue } from "./requirements.js";

type BaselineRequirement = RequirementBaseline["requirements"][number];

const REVIEWABLE_REQUIREMENT_FIELDS = [
  "actor",
  "subject",
  "action",
  "object",
  "condition",
  "outcome",
  "acceptanceCriteria",
] as const;

function requirementStillNeedsReview(requirement: BaselineRequirement) {
  if (requirement.status !== "accepted") return true;
  return REVIEWABLE_REQUIREMENT_FIELDS.some((field) => {
    const provenance = requirement.fieldProvenance[field];
    return (
      provenance?.status === "pending-review" ||
      provenance?.status === "rejected"
    );
  });
}

export function rebuildRequirementQualityReport(
  baseline: RequirementBaseline,
  requirements: BaselineRequirement[],
  issues: RequirementQualityIssue[],
): RequirementBaseline["qualityReport"] {
  const blockingIssueIds = issues
    .filter((issue) => issue.blocksDownstream)
    .map((issue) => issue.id);
  const reviewRequiredRequirementIds = requirements
    .filter(requirementStillNeedsReview)
    .map((requirement) => requirement.id);
  const status: RequirementBaseline["qualityReport"]["status"] =
    blockingIssueIds.length > 0
      ? "blocked"
      : reviewRequiredRequirementIds.length > 0 || issues.length > 0
        ? "pending-review"
        : "passed";
  return {
    ...baseline.qualityReport,
    status,
    summary:
      status === "passed"
        ? `已建立 ${requirements.length} 条原子需求基线。`
        : `发现 ${issues.length} 个需求质量提示，可继续生成并在当前页面查看。`,
    issues,
    blockingIssueIds,
    reviewRequiredRequirementIds,
  };
}
