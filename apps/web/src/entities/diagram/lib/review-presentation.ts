// Projects current and historical review records into shared, deduplicated problem groups.
import { classifyDiagramReviewIssue, isExcludedDiagramReviewIssue, isUnverifiableReviewText, type DiagramReviewCategory, type DiagramReviewFinding, type DiagramVisualReview } from "@uml-platform/contracts";

export const reviewCategoryLabels: Record<DiagramReviewCategory, string> = {
  model_structure: "模型结构问题", business_content: "业务内容疑问", business_constraint: "业务内容疑问", render_mismatch: "绘制一致性问题",
  check_execution: "检查执行问题", other: "业务内容疑问",
};
export const reviewCategories = ["model_structure", "business_content", "render_mismatch", "check_execution"] as const;
function categoryOf(category: DiagramReviewCategory): typeof reviewCategories[number] {
  return category === "business_constraint" || category === "other" ? "business_content" : category;
}
export interface ReviewProblem {
  id: string; category: DiagramReviewCategory; observation: string; verification: DiagramReviewFinding["verification"];
  finding?: DiagramReviewFinding; inferred: boolean;
}
const key = (text: string) => text.replace(/[\s。；;]+/g, "");
export function reviewProblemGroups(review: DiagramVisualReview) {
  const items = new Map<string, ReviewProblem>();
  for (const finding of review.findings ?? []) {
    if (isExcludedDiagramReviewIssue(finding.observation)) continue;
    const inferred = classifyDiagramReviewIssue(finding.observation, finding.layer, finding.code);
    const category = categoryOf(finding.category ?? inferred);
    const value: ReviewProblem = { id: finding.id, category, observation: finding.observation, verification: isUnverifiableReviewText(finding.observation) ? "inconclusive" : finding.verification, finding, inferred: !finding.category && inferred === "other" };
    // Prefer the service-verified record when the provider repeated the same observation.
    const old = items.get(key(value.observation));
    if (!old || (old.verification !== "verified" && value.verification === "verified")) items.set(key(value.observation), value);
  }
  for (const issue of review.issues.flatMap((item) => item.split(/[；;\n]+/)).map((item) => item.trim()).filter(Boolean)) {
    if (isExcludedDiagramReviewIssue(issue) || items.has(key(issue))) continue;
    items.set(key(issue), { id: `legacy:${key(issue)}`, category: categoryOf(classifyDiagramReviewIssue(issue)), observation: issue, verification: isUnverifiableReviewText(issue) ? "inconclusive" : "unverified", inferred: true });
  }
  // Outcome is an execution state, not an invented business defect.
  const onlyExcludedHistory = !items.size && (review.issues.length > 0 || (review.findings?.length ?? 0) > 0);
  if (["not_completed", "inconclusive"].includes(review.checkOutcome ?? "") && !(review.checkOutcome === "inconclusive" && onlyExcludedHistory) && ![...items.values()].some((item) => item.category === "check_execution")) {
    const observation = review.checkOutcome === "inconclusive" ? "部分结构无法核实" : "检查未完成";
    items.set("execution", { id: "execution", category: "check_execution", observation, verification: "inconclusive", inferred: false });
  }
  return reviewCategories.map((category) => ({ category, label: reviewCategoryLabels[category], items: [...items.values()].filter((item) => item.category === category) })).filter((group) => group.items.length);
}

export function reviewProblemTreatment(problem: ReviewProblem, review: DiagramVisualReview): string {
  const repair = [...(review.repairHistory ?? [])].reverse().find((item) => item.issueIds.includes(problem.finding?.id ?? problem.id));
  if (repair) return `第 ${repair.round} 轮${repair.target === "model" ? "结构纠错" : "图形重建"}：${repair.status === "accepted" ? "已接受" : repair.status === "rejected" ? "已拒绝" : "未完成"} · ${repair.reason}`;
  if (problem.category === "business_content") return "内容待核实：保留原业务含义，未自动修改";
  if (problem.category === "check_execution") return "检查未完成或已跳过：请查看原因，必要时重试检查";
  if (problem.verification !== "verified") return "尚无程序校验依据：自动检查观察保留，不能据此宣称已修复";
  return problem.finding?.repairable ? `未尝试：${review.stopReason ?? "尚未启动修复"}` : "未修复：当前问题没有自动修复规则";
}
