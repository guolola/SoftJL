// Renders review conclusions, categorized problems and repair records in model notices.
import { isExcludedDiagramReviewIssue, type DiagramVisualReview } from "@uml-platform/contracts";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../shared/ui/collapsible";
import { reviewCategories, reviewCategoryLabels, reviewProblemGroups, reviewProblemTreatment } from "../lib/review-presentation";

export function DiagramReviewDetails({ review, confirmed = false, summaryOnly = false, showEmptyGroups = false }: { review: DiagramVisualReview; confirmed?: boolean; summaryOnly?: boolean; showEmptyGroups?: boolean }) {
  const populated = reviewProblemGroups(review);
  const groups = summaryOnly ? [] : showEmptyGroups ? reviewCategories.map((category) => populated.find((group) => group.category === category) ?? { category, label: reviewCategoryLabels[category], items: [] }) : populated;
  const reason = isExcludedDiagramReviewIssue(review.reason) ? "当前没有结构问题记录" : review.reason;
  return <section aria-label={summaryOnly ? "模型检查摘要" : "结构检查详情"} data-slot="diagram-review-details" className="min-w-0 space-y-3 text-sm leading-6 text-black dark:text-foreground">
    <div className="space-y-1">
      <p>{reason}</p>
      {confirmed && <p className="text-xs text-muted-foreground">内容已人工确认，原检查结论与结构问题仍保留。</p>}
      {!summaryOnly && review.checkOutcome === "skipped" && <p>检查已跳过：{review.stopReason ?? reason}</p>}
    </div>
    {groups.map((group) => <section key={group.category} aria-label={group.label} className="space-y-2 border-t pt-2">
      <Collapsible defaultOpen={false}>
      <h4 className="text-sm font-medium">
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-left">
          <span>{group.label}（{group.items.length}）</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-aria-expanded:rotate-180 motion-reduce:transition-none" />
        </CollapsibleTrigger>
      </h4>
      <CollapsibleContent keepMounted className="pt-2">
      <ol className="list-decimal space-y-2 pl-5">{group.items.map((problem) => {
        const treatment = reviewProblemTreatment(problem, review);
        return <li key={problem.id} className="min-w-0 space-y-1">
        <p className="break-words">{problem.observation}</p>
        {treatment && <p className="break-words text-xs text-muted-foreground">{treatment}</p>}
      </li>; })}</ol>
      </CollapsibleContent>
      </Collapsible>
    </section>)}
    {!summaryOnly && !!review.repairHistory?.length && <details className="border-t pt-2 text-xs">
      <summary className="w-fit cursor-pointer">修复记录（{review.repairHistory.length}）</summary>
      <ul className="mt-2 space-y-2">{review.repairHistory.map((repair, index) => <li key={repair.callId ?? `${repair.round}:${index}`}>
        <p>第 {repair.round} 轮{repair.target === "model" ? "结构纠错" : "图形重建"}{repair.method ? `（${repair.method === "hard_rule" ? "程序规则" : "LLM 候选"}）` : ""}：{repair.status === "accepted" ? "已接受" : repair.status === "rejected" ? "已拒绝" : "未完成"} · {repair.reason}</p>
        {repair.changes.map((change, index) => <p key={index} className="break-words">{change}</p>)}
      </li>)}</ul>
    </details>}
  </section>;
}
