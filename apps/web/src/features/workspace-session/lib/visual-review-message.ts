// Selects concrete visual review findings before the generic review reason.
import { classifyDiagramReviewIssue, isExcludedDiagramReviewIssue, type DiagramVisualReview } from "@uml-platform/contracts";
export function visualReviewDetail(review: {
  issues?: readonly string[];
  reason?: string;
} | null | undefined): string | null {
  if (!review) return null;
  const issues = review.issues?.flatMap((issue) => issue.split(/[；;\n]+/)).map((issue) => issue.trim()).filter((issue) => issue && !isExcludedDiagramReviewIssue(issue)) ?? [];
  const reason = review.reason?.trim();
  return issues.length > 0 ? [...new Set(issues)].join("；") : reason && !isExcludedDiagramReviewIssue(reason) ? reason : null;
}

export function isConfirmedVisualReview(
  review: Partial<DiagramVisualReview> | null | undefined,
  current: { checkedAt?: string; confirmedAt?: string; inputFingerprint?: string } | null | undefined,
) {
  if (!review || review.status !== "pending_review" || [review.structureStatus, review.renderStatus, review.imageStatus].some((status) => status === "failed" || status === "not_completed") || ["not_completed", "inconclusive"].includes(review.checkOutcome ?? "")) return false;
  const contentOnly = (category: string) => ["business_content", "business_constraint", "other"].includes(category);
  // Confirmation settles content questions only; failed or inconclusive structural checks remain actionable.
  if (review.findings?.some((item) => !isExcludedDiagramReviewIssue(item.observation) && !contentOnly(item.category ?? classifyDiagramReviewIssue(item.observation, item.layer, item.code)))) return false;
  if (review.issues?.flatMap((issue) => issue.split(/[；;\n]+/)).some((issue) => {
    const text = issue.trim(), finding = review.findings?.find((item) => item.observation.trim() === text);
    return text && !isExcludedDiagramReviewIssue(text) && !contentOnly(finding?.category ?? classifyDiagramReviewIssue(text));
  })) return false;
  return Boolean(review.checkedAt && current?.confirmedAt && current.checkedAt === review.checkedAt && current.inputFingerprint === review.inputFingerprint);
}
