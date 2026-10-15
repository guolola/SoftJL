// Renders the requirement quality hint and repair confirmation dialog.
import { Alert } from '../../../shared/ui/alert';
import { Card } from "../../../shared/ui/card";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AtomicRequirement,
  AtomicRequirementField,
  RequirementQualityIssue,
} from "@uml-platform/contracts";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { cn } from "../../../shared/ui/utils";
import {
  REVIEWABLE_REQUIREMENT_FIELDS,
  requirementFieldStatusLabel,
  requirementFieldValue,
  requirementSourceLabel,
  requirementStateTone,
} from "../lib/requirement-review-view-model";

type RequirementFieldProvenanceEntry = [
  AtomicRequirementField,
  NonNullable<AtomicRequirement["fieldProvenance"][AtomicRequirementField]>,
];

export interface RequirementHintDetail {
  candidate: WorkspaceRecord["requirementReviewCandidates"][string] | null;
  fieldEntries: RequirementFieldProvenanceEntry[];
  qualityIssues: RequirementQualityIssue[];
  requirement: AtomicRequirement;
  rowState: string | null;
  rule: RequirementRule;
}

interface RequirementReviewDialogProps {
  generating: boolean;
  onDecideReviewCandidate: (
    ruleId: string,
    decision: "accepted" | "rejected",
  ) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onRepairRequirementRule: (ruleId: string) => Promise<void>;
  visibleHintDetail: RequirementHintDetail | null;
}

export function RequirementReviewDialog({
  generating,
  onDecideReviewCandidate,
  onOpenChange,
  onRepairRequirementRule,
  visibleHintDetail,
}: RequirementReviewDialogProps) {
  const { t } = useTranslation();
  const [repairingRuleId, setRepairingRuleId] = useState<string | null>(null);
  const pendingReviewCandidate =
    visibleHintDetail?.candidate?.status === "pending"
      ? visibleHintDetail.candidate
      : null;
  const failedReviewCandidate =
    visibleHintDetail?.candidate?.status === "failed"
      ? visibleHintDetail.candidate
      : null;
  const hasOpenFieldReview =
    visibleHintDetail?.fieldEntries.some(
      ([, provenance]) =>
        provenance.status === "pending-review" ||
        provenance.status === "rejected",
    ) ?? false;
  const hasActionableQualityHint =
    Boolean(visibleHintDetail) &&
    (visibleHintDetail?.rowState === "有待确认提示" ||
      visibleHintDetail?.requirement.status !== "accepted" ||
      hasOpenFieldReview ||
      (visibleHintDetail?.qualityIssues.length ?? 0) > 0);
  const repairingCurrentRule =
    Boolean(visibleHintDetail) && repairingRuleId === visibleHintDetail?.rule.id;
  const repairDisabled = generating || repairingCurrentRule;

  const close = () => onOpenChange(false);
  const runRepair = async (ruleId: string) => {
    setRepairingRuleId(ruleId);
    try {
      await onRepairRequirementRule(ruleId);
    } finally {
      setRepairingRuleId((current) => (current === ruleId ? null : current));
    }
  };

  return (
    <Dialog open={Boolean(visibleHintDetail)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {pendingReviewCandidate ? t("requirements.review.repairTitle") : t("requirements.review.qualityTitle")}
          </DialogTitle>
          <DialogDescription>
            {pendingReviewCandidate
              ? t("requirements.review.repairDescription")
              : hasActionableQualityHint
                ? t("requirements.review.qualityDescription")
                : t("requirements.review.recordDescription")}
          </DialogDescription>
        </DialogHeader>
        {visibleHintDetail && (
          <div className="max-h-[60vh] overflow-auto pr-1">
            <div className="w-full min-w-0">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs uppercase text-muted-foreground">
                  {visibleHintDetail.rule.id}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "px-2 py-1 text-xs",
                    requirementStateTone(visibleHintDetail.rowState),
                  )}
                >
                  {visibleHintDetail.rowState ? t(`requirements.statuses.${({ "已编辑": "edited", "已生成": "generated", "已确认": "confirmed", "有待确认提示": "pending", "存在冲突提示": "conflict", "修复失败待重试": "repairFailed", "修复结果待确认": "repairPending", "已采纳修复": "repairAccepted", "已拒绝修复": "repairRejected" } as Record<string, string>)[visibleHintDetail.rowState] ?? "pending"}`) : ""}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {visibleHintDetail.requirement.id}
                </span>
              </div>
              <div className="mt-2 text-foreground">
                {visibleHintDetail.rule.text}
              </div>
            </div>

            {visibleHintDetail.candidate && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("requirements.review.comparison")}
                </h3>
                {visibleHintDetail.candidate.status === "failed" ? (
                  <div className="mt-2 grid gap-2">
                    <Alert variant="destructive" className="border px-3 py-2 text-xs leading-5">
                      {t("requirements.review.repairFailed")}
                    </Alert>
                    {visibleHintDetail.candidate.errorMessage ? (
                      <details className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer font-medium text-foreground">{t("requirements.review.technicalDetails")}</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{visibleHintDetail.candidate.errorMessage}</pre>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2 overflow-hidden rounded-lg border border-border">
                    <div className="grid grid-cols-[120px_1fr_1fr] border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                      <div className="px-3 py-2">{t("requirements.review.field")}</div>
                      <div className="px-3 py-2">{t("requirements.review.before")}</div>
                      <div className="px-3 py-2">{t("requirements.review.after")}</div>
                    </div>
                    {REVIEWABLE_REQUIREMENT_FIELDS.map((field) => {
                      const beforeValue = requirementFieldValue(
                        visibleHintDetail.candidate!.beforeRequirement,
                        field,
                      );
                      const afterRequirement =
                        visibleHintDetail.candidate!.afterRequirement ??
                        visibleHintDetail.candidate!.beforeRequirement;
                      const afterValue = requirementFieldValue(afterRequirement, field);
                      const changed = beforeValue !== afterValue;
                      return (
                        <div
                          key={field}
                          className="grid grid-cols-[120px_1fr_1fr] border-b border-border last:border-b-0 text-xs leading-5"
                        >
                          <div className="px-3 py-2 font-medium text-foreground">
                            {t(`requirements.review.fields.${field}`)}
                          </div>
                          <div className="px-3 py-2 text-muted-foreground">
                            {beforeValue || t("requirements.review.noValue")}
                          </div>
                          <div
                            className={cn(
                              "px-3 py-2 text-foreground",
                              changed && "bg-success/10 text-success",
                            )}
                          >
                            {afterValue || t("requirements.review.noValue")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {visibleHintDetail.candidate.repairRationale && (
                  <div className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {visibleHintDetail.candidate.repairRationale}
                  </div>
                )}
                {visibleHintDetail.candidate.blockingReasons.length > 0 && (
                  <div className="mt-2 grid gap-1">
                    {visibleHintDetail.candidate.blockingReasons.map((reason) => (
                      <Alert
                        key={reason}
                        className="border px-3 py-2 text-xs leading-5"
                      >
                        {reason}
                      </Alert>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground">
                {t("requirements.review.provenance")}
              </h3>
              <div className="mt-2 grid gap-2">
                {visibleHintDetail.fieldEntries.length > 0 ? (
                  visibleHintDetail.fieldEntries.map(([field, provenance]) => (
                    <Card
                      key={field}
                      className="gap-0 py-0 px-3 py-2 text-xs leading-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {t(`requirements.review.fields.${field}`)}
                        </span>
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {requirementSourceLabel(provenance.source, t)}
                        </Badge>
                        <span className="text-muted-foreground">
                          {requirementFieldStatusLabel(provenance.status, t)}
                        </span>
                      </div>
                      <div className="mt-1 text-foreground">
                        {requirementFieldValue(
                          visibleHintDetail.requirement,
                          field,
                        ) || t("requirements.review.noValue")}
                      </div>
                      {provenance.rationale && (
                        <div className="mt-1 text-muted-foreground">
                          {provenance.rationale}
                        </div>
                      )}
                    </Card>
                  ))
                ) : (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {t("requirements.review.noProvenance")}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground">{t("requirements.review.qualityIssues")}</h3>
              <div className="mt-2 grid gap-2">
                {visibleHintDetail.qualityIssues.length > 0 ? (
                  visibleHintDetail.qualityIssues.map((issue) => (
                    <Alert
                      key={issue.id}
                      className="border px-3 py-2 text-xs leading-5"
                    >
                      {issue.message}
                    </Alert>
                  ))
                ) : (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {t("requirements.review.noQualityIssues")}
                  </div>
                )}
              </div>
            </div>
            </div>
          </div>
        )}
        <DialogFooter>
          {visibleHintDetail && failedReviewCandidate ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void runRepair(visibleHintDetail.rule.id)}
              disabled={repairDisabled}
            >
              {repairingCurrentRule ? t("requirements.review.repairing") : t("requirements.review.repairAgain")}
            </Button>
          ) : null}
          {visibleHintDetail &&
          !pendingReviewCandidate &&
          !failedReviewCandidate &&
          hasActionableQualityHint ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void runRepair(visibleHintDetail.rule.id)}
              disabled={repairDisabled}
            >
              {repairingCurrentRule ? t("requirements.review.repairing") : t("requirements.review.smartRepair")}
            </Button>
          ) : null}
          {pendingReviewCandidate && visibleHintDetail ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void onDecideReviewCandidate(
                    visibleHintDetail.rule.id,
                    "rejected",
                  ).then(close)
                }
                disabled={generating}
              >
                {t("requirements.review.reject")}
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void onDecideReviewCandidate(
                    visibleHintDetail.rule.id,
                    "accepted",
                  ).then(close)
                }
                disabled={generating}
              >
                {t("requirements.review.accept")}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={close}>
              {t("common.close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
