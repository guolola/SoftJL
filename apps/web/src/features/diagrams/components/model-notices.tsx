// Shows model freshness, visual review, and the next action as a compact status flow.
import { useState } from "react";
import { CURRENT_DIAGRAM_REVIEW_VERSION, type DiagramVisualReview } from "@uml-platform/contracts";
import { DiagramReviewDetails } from "../../../entities/diagram/components/diagram-review-details";
import { reviewProblemGroups } from "../../../entities/diagram/lib/review-presentation";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui/dialog";
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

export function ModelNotices({ notices }: {
  notices: ModelNotice[];
}) {
  const [open, setOpen] = useState(false);
  if (notices.length === 0) return null;

  const freshness = notices.find((notice) => notice.kind === "freshness");
  const visual = notices.find((notice) => notice.kind === "visual");
  const otherNotices = notices.filter((notice) => notice.kind !== "freshness" && notice.kind !== "visual");
  const hasFailure = otherNotices.some((notice) => notice.tone === "destructive");
  const review = visual?.review;
  const groups = review ? reviewProblemGroups(review) : [];
  const structuralFailure = review?.status === "failed" || review?.structureStatus === "failed" || review?.renderStatus === "failed";
  const legacyReview = Boolean(review && review.reviewVersion !== CURRENT_DIAGRAM_REVIEW_VERSION);
  const unresolved = groups.some((group) => group.category !== "business_content" || !visual?.confirmed) || Boolean(!review && visual?.issues?.length) || review?.status === "not_completed" || legacyReview;
  const actionTone: ModelNotice["tone"] = hasFailure || structuralFailure ? "destructive" : freshness || unresolved ? "warning" : "success";
  // Always render the same three stages; missing notices become positive or neutral states.
  const stages: ModelNotice[] = [
    freshness ?? { id: "current", kind: "freshness", tone: "success", title: "模型未标记过期", detail: "上游内容未标记为过期；结构是否通过请查看下方检查结果。" },
    visual ? { ...visual, title: "模型检查" } : { id: "unchecked", kind: "visual", tone: "info", title: "模型检查", detail: "当前没有检查结果。" },
    {
      id: "action", kind: "info", tone: actionTone, title: "下一步",
      detail: hasFailure ? "查看下方错误并重试相关操作。"
          : structuralFailure ? "当前生成未通过结构或绘制校验，请修复或重新生成；上次有效模型保留。"
          : freshness ? "更新模型后再次检查图形。"
          : legacyReview ? "历史结论尚未用当前规则复核，请重新检查模型和图形；原业务确认保留。"
          : unresolved ? "查看下方四类问题及处理依据；业务内容需核实，检查执行问题可重试。" : "当前没有需要处理的操作。",
    },
  ];

  const buttonTone: PageNoticeTone = hasFailure || structuralFailure ? "destructive"
    : unresolved || notices.some((notice) => notice.tone === "warning") ? "warning" : "info";

  return <>
    <PageNoticeButton label={`提示（${notices.length}）`} tone={buttonTone} onClick={() => setOpen(true)} />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>模型提示</DialogTitle>
          <DialogDescription>查看模型状态、四类检查问题，以及依据和修复记录。</DialogDescription>
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
