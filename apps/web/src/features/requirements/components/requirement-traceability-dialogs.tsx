// Renders requirement model traceability proof dialogs for the authoring page.
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
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
import type { RequirementModelRepairRecord } from "../lib/requirement-target-view-model";
import { stageRepairCopy } from "../lib/requirement-review-view-model";

export interface RequirementModelRepairResult {
  targetLabel: string;
}

interface RequirementTraceabilityDialogsProps {
  modelRepairResult: RequirementModelRepairResult | null;
  records: RequirementModelRepairRecord[];
  setModelRepairResult: Dispatch<
    SetStateAction<RequirementModelRepairResult | null>
  >;
  setTraceabilityDialogOpen: Dispatch<SetStateAction<boolean>>;
  traceabilityDialogOpen: boolean;
}

export function RequirementTraceabilityDialogs({
  modelRepairResult,
  records,
  setModelRepairResult,
  setTraceabilityDialogOpen,
  traceabilityDialogOpen,
}: RequirementTraceabilityDialogsProps) {
  const { t } = useTranslation();
  return (
    <>
      <Dialog
        open={traceabilityDialogOpen}
        onOpenChange={setTraceabilityDialogOpen}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("requirements.traceDialogs.title")}</DialogTitle>
            <DialogDescription>
              {t("requirements.traceDialogs.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto pr-1">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <div className="text-sm font-medium text-foreground">
                  {t("requirements.traceDialogs.evidence")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("requirements.traceDialogs.count", { count: records.length })}
                </div>
              </div>
              <Badge
                variant="outline"
                className="border-success/35 text-success"
              >
                {t("requirements.traceDialogs.complete")}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5"
                >
                  <div className="text-muted-foreground">
                    {t("requirements.traceDialogs.reason", { value: stageRepairCopy(record.reason) })}
                  </div>
                  <div className="mt-1 text-foreground">
                    {t("requirements.traceDialogs.repair", { value: stageRepairCopy(record.repair) })}
                  </div>
                  <div className="mt-1 font-medium text-success">
                    {t("requirements.traceDialogs.status", { value: record.status })}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 h-8"
                    onClick={() =>
                      setModelRepairResult({ targetLabel: record.targetLabel })
                    }
                  >
                    {t("requirements.traceDialogs.repairAgain")}
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setTraceabilityDialogOpen(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(modelRepairResult)}
        onOpenChange={(open) => {
          if (!open) setModelRepairResult(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("requirements.traceDialogs.resultTitle")}</DialogTitle>
            <DialogDescription>
              {t("requirements.traceDialogs.resultDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <div>
              <span className="font-medium">{t("requirements.traceDialogs.stage")}</span>{t("requirements.traceDialogs.requirementModels")}
            </div>
            <div>
              <span className="font-medium">{t("requirements.traceDialogs.target")}</span>
              {modelRepairResult?.targetLabel}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setModelRepairResult(null)}>
              {t("requirements.traceDialogs.acknowledge")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
