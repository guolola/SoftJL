// Derives requirement review status, blocking rule IDs, and accepted baselines for session workflows.
import type {
  AtomicRequirement,
  AtomicRequirementField,
  RequirementBaseline,
  RequirementQualityIssue,
  RequirementQualityReport,
} from "@uml-platform/contracts";
import {
  compareRequirementSemantics,
  unsupportedRequirementFacts,
} from "@uml-platform/contracts";
import type { WorkspaceRecord } from "../../../entities/workspace/model";

export function uniqueIssueMessages(issues: RequirementQualityIssue[]) {
  return Array.from(
    new Set(
      issues
        .map((issue) => issue.message?.trim())
        .filter((message): message is string => Boolean(message)),
    ),
  );
}

export function isRequirementBlocking(issue: RequirementQualityIssue) {
  return issue.blocksDownstream || issue.severity === "critical";
}

export const REVIEWABLE_REQUIREMENT_FIELDS: AtomicRequirementField[] = [
  "actor",
  "subject",
  "action",
  "object",
  "condition",
  "outcome",
  "acceptanceCriteria",
];

function requirementFieldHasReviewedValue(
  requirement: AtomicRequirement,
  field: AtomicRequirementField,
) {
  const provenance = requirement.fieldProvenance[field];
  if (
    provenance?.status === "accepted" &&
    typeof provenance.value === "string" &&
    provenance.value.trim()
  ) {
    return true;
  }
  if (field === "acceptanceCriteria") {
    return requirement.acceptanceCriteria.length > 0;
  }
  return Boolean(requirement[field]?.trim());
}

function requirementConditionIsVerifiable(requirement: AtomicRequirement) {
  const provenance = requirement.fieldProvenance.condition;
  const condition = provenance?.value ?? requirement.condition ?? "";
  return provenance?.status === "accepted" || /\d/.test(condition);
}

function rebuildRequirementQualityReport(
  baseline: RequirementBaseline,
): RequirementQualityReport {
  const blockingIssueIds = baseline.qualityReport.issues
    .filter((issue) => issue.blocksDownstream)
    .map((issue) => issue.id);
  const reviewRequiredRequirementIds = Array.from(
    new Set(
      baseline.requirements
        .filter((requirement) => requirement.status !== "accepted")
        .map((requirement) => requirement.id),
    ),
  );
  const status =
    blockingIssueIds.length > 0
      ? "blocked"
      : reviewRequiredRequirementIds.length > 0 ||
          baseline.qualityReport.issues.length > 0
        ? "pending-review"
        : "passed";
  return {
    ...baseline.qualityReport,
    status,
    summary:
      status === "passed"
        ? `已建立 ${baseline.requirements.length} 条原子需求基线。`
        : `发现 ${baseline.qualityReport.issues.length} 个需求质量提示，可继续生成并在当前页面查看。`,
    blockingIssueIds,
    reviewRequiredRequirementIds,
  };
}

export function rebuildRequirementReviewQualityReport(
  baseline: RequirementBaseline,
): RequirementQualityReport {
  const issues = baseline.qualityReport.issues.filter((issue) => {
    const requirement = issue.requirementId
      ? baseline.requirements.find((item) => item.id === issue.requirementId)
      : null;
    if (!requirement) return true;
    if (issue.code === "semantic-loss") return true;
    if (requirement.status === "accepted") return false;
    if (issue.code === "missing-actor") {
      return !requirementFieldHasReviewedValue(requirement, "actor");
    }
    if (issue.code === "missing-object") {
      return !requirementFieldHasReviewedValue(requirement, "object");
    }
    if (issue.code === "missing-boundary") {
      return !requirementConditionIsVerifiable(requirement);
    }
    if (issue.code === "low-confidence") {
      return requirement.confidence < 0.7;
    }
    if (issue.code === "derived-assumption") {
      return Object.values(requirement.fieldProvenance).some(
        (item) => item?.source === "ai-suggested" && item.status !== "accepted",
      );
    }
    return true;
  });
  return rebuildRequirementQualityReport({
    ...baseline,
    qualityReport: {
      ...baseline.qualityReport,
      issues,
    },
  });
}

function requirementHasPendingField(requirement: AtomicRequirement) {
  return Object.values(requirement.fieldProvenance).some(
    (item) => item?.status === "pending-review" || item?.status === "rejected",
  );
}

function requirementNeedsRepairReview(
  requirement: AtomicRequirement,
  issues: RequirementQualityIssue[],
  reviewRequired: boolean,
) {
  const hasBlockingIssue = issues.some((issue) => issue.blocksDownstream);
  return (
    reviewRequired ||
    requirement.status !== "accepted" ||
    requirementHasPendingField(requirement) ||
    hasBlockingIssue
  );
}

export function requirementRuleIdsNeedingReview(
  baseline: RequirementBaseline | null,
) {
  if (!baseline) return [];
  const issuesByRequirementId = new Map<string, RequirementQualityIssue[]>();
  const reviewRequiredIds = new Set(
    baseline.qualityReport.reviewRequiredRequirementIds,
  );
  for (const issue of baseline.qualityReport.issues) {
    if (!issue.requirementId) continue;
    issuesByRequirementId.set(issue.requirementId, [
      ...(issuesByRequirementId.get(issue.requirementId) ?? []),
      issue,
    ]);
  }
  return Array.from(
    new Set(
      baseline.requirements
        .filter((requirement) =>
          Boolean(
            requirement.sourceRuleId &&
              requirementNeedsRepairReview(
                requirement,
                issuesByRequirementId.get(requirement.id) ?? [],
                reviewRequiredIds.has(requirement.id),
              ),
          ),
        )
        .map((requirement) => requirement.sourceRuleId!),
    ),
  );
}

export function requirementRuleIdsBlockingGeneration(
  baseline: RequirementBaseline | null,
  candidates: WorkspaceRecord["requirementReviewCandidates"],
) {
  if (!baseline) return [];
  const issuesByRequirementId = new Map<string, RequirementQualityIssue[]>();
  for (const issue of baseline.qualityReport.issues) {
    if (!issue.requirementId) continue;
    issuesByRequirementId.set(issue.requirementId, [
      ...(issuesByRequirementId.get(issue.requirementId) ?? []),
      issue,
    ]);
  }
  const blockedRuleIds = new Set<string>();
  for (const requirement of baseline.requirements) {
    if (!requirement.sourceRuleId) continue;
    const candidate = candidates[requirement.sourceRuleId];
    const candidatePending =
      candidate?.status === "pending" || candidate?.status === "failed";
    const issues = issuesByRequirementId.get(requirement.id) ?? [];
    if (
      candidatePending ||
      (Boolean(candidate) && requirement.status !== "accepted") ||
      (Boolean(candidate) && requirementHasPendingField(requirement)) ||
      issues.some((issue) => issue.blocksDownstream)
    ) {
      blockedRuleIds.add(requirement.sourceRuleId);
    }
  }
  return Array.from(blockedRuleIds);
}

export function markRequirementReviewed(requirement: AtomicRequirement) {
  const next = structuredClone(requirement) as AtomicRequirement;
  next.status = "accepted";
  next.confidence = Math.max(next.confidence, 0.72);
  for (const field of REVIEWABLE_REQUIREMENT_FIELDS) {
    const provenance = next.fieldProvenance[field];
    if (!provenance) continue;
    next.fieldProvenance[field] = {
      ...provenance,
      status: "accepted",
      rationale:
        provenance.status === "accepted"
          ? provenance.rationale
          : "用户已确认本次需求规则修复结果。",
    };
  }
  return next;
}

export function markRequirementAutomaticallyReviewed(
  requirement: AtomicRequirement,
) {
  const next = structuredClone(requirement) as AtomicRequirement;
  next.status = "accepted";
  next.confidence = Math.max(next.confidence, 0.72);
  for (const field of REVIEWABLE_REQUIREMENT_FIELDS) {
    const provenance = next.fieldProvenance[field];
    if (!provenance) continue;
    next.fieldProvenance[field] = {
      ...provenance,
      status: "accepted",
      rationale: "质量检查自动通过：字段来源完整，且未发现语义丢失或无依据新增。",
    };
  }
  return next;
}

export function resolveSafeRequirementReviewCandidates(
  baseline: RequirementBaseline,
  candidates: WorkspaceRecord["requirementReviewCandidates"],
) {
  let nextBaseline = structuredClone(baseline) as RequirementBaseline;
  const nextCandidates = structuredClone(
    candidates,
  ) as WorkspaceRecord["requirementReviewCandidates"];
  const acceptedRuleIds: string[] = [];

  for (const [ruleId, candidate] of Object.entries(nextCandidates)) {
    if (
      candidate.status !== "pending" ||
      !candidate.afterRequirement ||
      candidate.blockingReasons.length > 0
    ) {
      continue;
    }
    const after = candidate.afterRequirement;
    if (
      after.status === "conflict" ||
      Object.values(after.fieldProvenance).some(
        (item) => item?.status === "pending-review" || item?.status === "rejected",
      )
    ) {
      continue;
    }
    const semanticDiff = compareRequirementSemantics(
      candidate.beforeRequirement,
      after,
    );
    const unsupportedFacts = unsupportedRequirementFacts(
      candidate.beforeRequirement.sourceFragment,
      after,
    );
    if (semanticDiff.lostFacts.length > 0 || unsupportedFacts.length > 0) {
      continue;
    }

    const reviewed = markRequirementAutomaticallyReviewed(after);
    const tentativeBaseline = mergeReviewedRequirement(nextBaseline, reviewed);
    const remainingIssues = tentativeBaseline.qualityReport.issues.filter(
      (issue) => issue.requirementId === reviewed.id,
    );
    if (
      remainingIssues.length > 0 ||
      tentativeBaseline.qualityReport.reviewRequiredRequirementIds.includes(
        reviewed.id,
      )
    ) {
      continue;
    }

    nextBaseline = tentativeBaseline;
    nextCandidates[ruleId] = {
      ...candidate,
      afterRequirement: reviewed,
      status: "accepted",
      errorMessage: null,
    };
    acceptedRuleIds.push(ruleId);
  }

  return {
    acceptedRuleIds,
    baseline: nextBaseline,
    blockingRuleIds: requirementRuleIdsBlockingGeneration(
      nextBaseline,
      nextCandidates,
    ),
    candidates: nextCandidates,
  };
}

function readableSlot(value: string | null | undefined) {
  return value?.trim() || null;
}

function compactAction(action: string, actor: string | null) {
  let normalized = action.trim();
  if (actor && normalized.startsWith(actor)) {
    normalized = normalized.slice(actor.length).trim();
  }
  return normalized.replace(/^(必须|需要|可以|应当|不得|不能|禁止|支持|能够|可|需)/u, "");
}

export function buildReadableRequirementRuleText(
  requirement: AtomicRequirement,
) {
  const actor = readableSlot(requirement.actor) ?? readableSlot(requirement.subject);
  const action = readableSlot(requirement.action);
  const object = readableSlot(requirement.object);
  const condition = readableSlot(requirement.condition);
  const outcome = readableSlot(requirement.outcome);
  const actionPhrase = action ? compactAction(action, actor) : null;

  if ((!actor && !object) || (!actionPhrase && !object)) {
    return requirement.sourceFragment;
  }

  const base =
    actor && actionPhrase
      ? `${actor}可以${actionPhrase}`
      : actor
        ? `${actor}相关需求`
        : actionPhrase
          ? `系统需要${actionPhrase}`
          : "系统需求";
  const objectText =
    object && !(actionPhrase ?? "").includes(object) ? `（对象：${object}）` : "";
  const conditionText = condition ? `，条件：${condition}` : "";
  const outcomeText =
    outcome && outcome !== "系统满足该需求" ? `，结果：${outcome}` : "";
  return `${base}${objectText}${conditionText}${outcomeText}。`;
}

export function mergeReviewedRequirement(
  baseline: RequirementBaseline,
  reviewedRequirement: AtomicRequirement,
) {
  const next = {
    ...baseline,
    requirements: baseline.requirements.map((requirement) =>
      requirement.id === reviewedRequirement.id
        ? reviewedRequirement
        : requirement,
    ),
  };
  return {
    ...next,
    qualityReport: rebuildRequirementReviewQualityReport(next),
  };
}
