// Renders generation result and confirmation dialogs used by the workspace session provider.
import { useTranslation } from "react-i18next";
import { CircleAlert } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { StatusFlow, StatusFlowItem } from "../../../shared/ui/status-flow";
import { cn } from "../../../shared/ui/utils";
import {
  FeedbackDialog,
  type FeedbackDialogAction,
  type FeedbackDialogState,
} from "../../../shared/ui/feedback-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { i18n } from "../../../shared/i18n/i18n";
import type { GenerationConfirmationSummary } from "../lib/generation-planning";

export type GenerationResultDialogState = {
  title: string;
  message: string;
  tone: "success" | "warning" | "destructive";
  runId?: string | null;
  requirementId?: string | null;
  ruleId?: string | null;
  stageLabel?: string;
  targetLabel?: string | null;
  primaryAction?: FeedbackDialogAction;
  secondaryAction?: FeedbackDialogAction;
  dismissLabel?: string;
  dedupeKey?: string;
  revision?: string | number | null;
};

export type GenerationConfirmationDialogState =
  GenerationConfirmationSummary & {
    resolve: (confirmed: boolean) => void;
  };

function sanitizeResultDialogCopy(text: string) {
  const cleaned = text
    .replace(/\.docx\b/giu, "")
    .replace(/\bAI\b/giu, i18n.t("generation.dialog.smartRepair"))
    .replace(/\s+/g, " ")
    .replace(/\s+([，。；：！？])/g, "$1")
    .replace(/[:：]\s*$/g, "")
    .trim();
  return cleaned || i18n.t("generation.dialog.technicalHidden");
}

function resultDialogMessage(result: GenerationResultDialogState) {
  return sanitizeResultDialogCopy(result.message);
}

export function generationResultFeedback(
  result: GenerationResultDialogState,
): FeedbackDialogState {
  return {
    dedupeKey: result.dedupeKey ?? generationResultDialogGroup(result),
    revision: result.revision ?? result.runId ?? result.message,
    tone: result.tone,
    title: sanitizeResultDialogCopy(result.title),
    message: resultDialogMessage(result),
    primaryAction: result.primaryAction,
    secondaryAction: result.secondaryAction,
    dismissLabel: result.dismissLabel,
  };
}

export function completedRunResultMessage({
  qualityHintCount,
  diagramFailureCount,
}: {
  qualityHintCount: number;
  diagramFailureCount: number;
}) {
  const parts: string[] = [];
  if (diagramFailureCount > 0) {
    parts.push(
      i18n.t("generation.dialog.completedWithFailures", { count: diagramFailureCount }),
    );
  } else {
    parts.push(i18n.t("generation.dialog.completed"));
  }
  if (qualityHintCount > 0) {
    parts.push(i18n.t("generation.dialog.qualityHints", { count: qualityHintCount }));
  }
  return parts.join(" ");
}

export function generationResultDialogGroup(
  result: GenerationResultDialogState,
) {
  const tone = result.tone === "destructive" ? "failure" : "completion";
  const runKey = result.runId ? `run:${result.runId}` : "";
  const stageKey = sanitizeResultDialogCopy(
    result.stageLabel ?? result.title ?? i18n.t("generation.dialog.result"),
  );
  return `${tone}:${runKey || stageKey}`;
}

export function GenerationResultDialog({
  result,
  onClose,
}: {
  result: GenerationResultDialogState | null;
  onClose: () => void;
}) {
  return (
    <FeedbackDialog
      feedback={result ? generationResultFeedback(result) : null}
      open={Boolean(result)}
      onClose={onClose}
    />
  );
}

function DependencySummary({ label, items }: { label: string; items: string[] }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <div className="text-left text-sm">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words leading-5 text-muted-foreground">
        {items.join(t("generation.dialog.listSeparator"))}
      </p>
    </div>
  );
}

export function GenerationConfirmationDialog({
  confirmation,
  onCancel,
  onConfirm,
}: {
  confirmation: GenerationConfirmationDialogState | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  if (!confirmation) return null;

  // Present the plan's categories in review order; dependencies retain their own meaning below.
  const groups = [
    { id: "kept", title: t("generation.dialog.groups.kept"), tone: "success", items: confirmation.keptLabels },
    { id: "updated", title: t("generation.confirmationFlow.updated"), tone: "warning", items: confirmation.regeneratedLabels },
    { id: "added", title: t("generation.confirmationFlow.added"), tone: "info", items: confirmation.newLabels },
  ] as const;
  const visibleGroups = groups.filter((group) => group.items.length > 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="flex max-h-[85vh] max-w-[calc(100%-2rem)] flex-col gap-6 overflow-hidden rounded-[12px] border-border/60 bg-card p-6 shadow-lg sm:max-w-[520px]">
        <DialogHeader className="shrink-0 space-y-2 text-left">
          <DialogTitle className="text-[20px] font-semibold leading-[28px] text-foreground">
            {confirmation.title}
          </DialogTitle>
          <DialogDescription className="text-[14px] leading-5 text-muted-foreground">
            {confirmation.description}
          </DialogDescription>
        </DialogHeader>
        <div data-testid="generation-confirmation-body" className="-mx-1 min-h-0 space-y-6 overflow-y-auto px-1 py-1 text-sm">
          {visibleGroups.length > 0 && (
            <StatusFlow aria-label={t("generation.confirmationFlow.label")}>
              {visibleGroups.map((group) => (
                <StatusFlowItem key={group.id} title={group.title} tone={group.tone} icon={group.id === "added" ? CircleAlert : undefined} data-generation-category={group.id}>
                  <p className={cn("mt-1 whitespace-pre-wrap break-words leading-5", group.id === "kept" ? "text-muted-foreground" : "font-semibold text-foreground")}>
                    {group.items.join(t("generation.dialog.listSeparator"))}
                  </p>
                </StatusFlowItem>
              ))}
            </StatusFlow>
          )}
          <DependencySummary
            label={t("generation.dialog.groups.rules")}
            items={confirmation.ruleDependencyLabels ?? []}
          />
          <DependencySummary
            label={t("generation.dialog.groups.requirements")}
            items={confirmation.requirementDependencyLabels ?? []}
          />
          <DependencySummary
            label={t("generation.dialog.groups.designDependencies")}
            items={confirmation.dependencyLabels}
          />
          {(confirmation.ruleDependencyLabels?.length ?? 0) === 0 &&
            (confirmation.requirementDependencyLabels?.length ?? 0) === 0 &&
            confirmation.newLabels.length === 0 &&
            confirmation.regeneratedLabels.length === 0 &&
            confirmation.dependencyLabels.length === 0 && (
              <p className="text-left text-sm leading-5 text-muted-foreground">
                {t("generation.dialog.noModels")}
              </p>
            )}
        </div>
        <DialogFooter className="shrink-0 flex-row justify-center gap-3 sm:justify-center">
          <Button
            type="button"
            variant="ghost"
            className="h-10 px-6 text-[14px] font-normal"
            onClick={onCancel}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="h-10 px-6 text-[14px] font-normal"
            onClick={onConfirm}
          >
            {t("generation.dialog.confirmGeneration")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
