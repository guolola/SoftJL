// Shows model freshness, check records and generation failures directly in one dialog.
import { useEffect, useState } from "react";
import type { DiagramVisualReview } from "@uml-platform/contracts";
import { DiagramReviewDetails } from "../../../entities/diagram/components/diagram-review-details";
import { reviewProblemGroups } from "../../../entities/diagram/lib/review-presentation";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
import { PageNoticeButton, type PageNoticeTone } from "../../../shared/ui/page-notice-button";
import { StatusFlow, StatusFlowItem } from "../../../shared/ui/status-flow";
import { cn } from "../../../shared/ui/utils";

export interface ModelNotice {
  id: string;
  kind: "freshness" | "visual" | "error" | "info";
  tone: "warning" | "success" | "destructive" | "info";
  title: string;
  detail: string;
  issues?: string[];
  checks?: number;
  repairs?: number;
  confirmed?: boolean;
  review?: DiagramVisualReview;
}

function hasNoticeProblem(notice: ModelNotice) {
  if (notice.kind !== "visual") return notice.kind === "error" || notice.tone === "warning" || notice.tone === "destructive";
  const review = notice.review ?? {
    status: "pending_review" as const, issues: notice.issues ?? [], reason: notice.detail,
    attempts: notice.checks ?? 0, checkedAt: "",
  };
  return reviewProblemGroups(review).some((group) => group.category !== "business_content" || !notice.confirmed) ||
    review.status === "failed" || review.structureStatus === "failed" || review.renderStatus === "failed" ||
    review.status === "not_completed" || review.checkOutcome === "skipped";
}

export function ModelNotices({ notices }: {
  notices: ModelNotice[];
}) {
  const [open, setOpen] = useState(false);
  // Successful checks and ordinary status messages are context, not problems.
  // Use the same filtered review groups as the dialog so an empty check adds no badge.
  const problemNotices = notices.filter(hasNoticeProblem);
  const hasProblems = problemNotices.length > 0;
  useEffect(() => {
    if (!hasProblems) setOpen(false);
  }, [hasProblems]);
  if (!hasProblems) return null;

  const freshness = notices.find((notice) => notice.kind === "freshness");
  const visual = notices.find((notice) => notice.kind === "visual");
  const otherNotices = problemNotices.filter((notice) => notice.kind !== "freshness" && notice.kind !== "visual");
  const hasFailure = otherNotices.some((notice) => notice.tone === "destructive");
  const review = visual?.review;
  const structuralFailure = review?.status === "failed" || review?.structureStatus === "failed" || review?.renderStatus === "failed";
  // Keep the shared flow focused on freshness and model checks.
  const stages: ModelNotice[] = [
    freshness ?? { id: "current", kind: "freshness", tone: "success", title: "模型未标记过期", detail: "上游内容未标记为过期；结构是否通过请查看下方检查结果。" },
    visual ? { ...visual, title: "模型检查" } : { id: "unchecked", kind: "visual", tone: "info", title: "模型检查", detail: "当前没有检查结果。" },
  ];

  const buttonTone: PageNoticeTone = hasFailure || structuralFailure ? "destructive"
    : "warning";

  return <>
    <PageNoticeButton label={`提示（${problemNotices.length}）`} tone={buttonTone} onClick={() => setOpen(true)} />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby={undefined} className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>模型提示</DialogTitle>
        </DialogHeader>
        <StatusFlow aria-label="模型状态流程">
          {stages.map((stage) => (
            <StatusFlowItem key={stage.id} title={stage.title} tone={stage.tone} data-notice-stage={stage.id}>
              {stage.kind === "visual" ? <DiagramReviewDetails showEmptyGroups confirmed={stage.confirmed} review={stage.review ?? {
                status: "pending_review", reason: stage.detail, issues: stage.issues ?? [], attempts: stage.checks ?? 0,
                repairAttempts: stage.repairs, checkedAt: "",
              }} /> : <p className="mt-1 whitespace-pre-wrap break-words text-sm text-black dark:text-foreground">{stage.detail}</p>}
            </StatusFlowItem>
          ))}
        </StatusFlow>
        {otherNotices.length > 0 ? <ul className="divide-y border-t text-sm">{otherNotices.map((notice) => <li key={notice.id} className="py-3"><strong className={cn("font-medium", notice.tone === "destructive" ? "text-destructive" : notice.tone === "warning" ? "text-warning" : "text-info")}>{notice.title}</strong><p className="mt-1 text-muted-foreground">{notice.detail}</p></li>)}</ul> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>知道了</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
