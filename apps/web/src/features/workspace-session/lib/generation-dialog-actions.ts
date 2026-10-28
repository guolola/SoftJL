// Owns generation result and confirmation dialog state for the session provider.
import { useCallback, useRef, useState } from "react";
import type { RequirementBaseline } from "@uml-platform/contracts";
import {
  completedRunResultMessage,
  generationResultFeedback,
  type GenerationConfirmationDialogState,
  type GenerationResultDialogState,
} from "../components/generation-dialogs";
import { useFeedbackDialog } from "../../../shared/ui/feedback-dialog";
import type { GenerationConfirmationSummary } from "./generation-planning";
import { cancelledRunMessage } from "./run-events";
import { i18n } from "../../../shared/i18n/i18n";
import {
  requestOpenGenerationTask,
  requestOpenRequirementRule,
  requestOpenProjectWorkspaceTarget,
} from "../../../shared/lib/app-navigation";
import { operationFailurePresentation, type OperationFailurePresentation } from "./operation-failure";
import { useWorkspaceProjectId } from "../../../services/workspace-repository/index";
import { platformApi } from "../../user-platform/services/platform-api";
import { notifyProjectRunsChanged } from "../../../shared/lib/project-run-events";

export function partialRunResultDialog(input: {
  runId: string;
  stageLabel: string;
  succeeded: string[];
  failed: string[];
  onRetry?: () => void | Promise<void>;
}): GenerationResultDialogState | null {
  if (!input.succeeded.length || !input.failed.length) return null;
  return {
    title: i18n.t("generation.dialog.partialTitle"),
    tone: "warning",
    message: [
      i18n.t("generation.dialog.succeededModels", { models: input.succeeded.join(i18n.t("generation.dialog.listSeparator")) }),
      i18n.t("generation.dialog.failedModels", { models: input.failed.join(i18n.t("generation.dialog.listSeparator")) }),
    ].join("\n"),
    runId: input.runId,
    stageLabel: input.stageLabel,
    primaryAction: input.onRetry ? { label: i18n.t("generation.dialog.retryFailedModels"), onSelect: input.onRetry } : undefined,
    dismissLabel: i18n.t("common.confirm"),
  };
}

type CancelledRunDialogSnapshot = {
  error?: { message?: string } | null;
  runId?: string | null;
};

export function cancelledRunResultDialog(
  snapshot: CancelledRunDialogSnapshot,
  stageLabel: string,
  clientTaskId?: string | null,
): GenerationResultDialogState {
  const taskDetailsAvailable = Boolean(snapshot.runId || clientTaskId);
  return {
    title: i18n.t("generation.dialog.titles.cancelled"),
    tone: "warning",
    message: cancelledRunMessage(snapshot),
    runId: snapshot.runId ?? null,
    stageLabel,
    primaryAction: taskDetailsAvailable
      ? {
          label: i18n.t("feedback.actions.taskDetails"),
          onSelect: () =>
            requestOpenGenerationTask({ clientTaskId, runId: snapshot.runId }),
        }
      : undefined,
  };
}

export function failedRunResultDialog(input: {
  clientTaskId?: string | null;
  failure?: OperationFailurePresentation;
  message?: string;
  runId: string | null;
  stageLabel: string;
  requirementBaseline?: RequirementBaseline | null;
}): GenerationResultDialogState {
  const taskDetailsAvailable = Boolean(input.runId || input.clientTaskId);
  const diagnosticId = input.failure?.requestId ?? input.runId ?? input.clientTaskId ?? null;
  const target = input.failure?.actionTarget;
  const ruleIds = Array.isArray(input.failure?.details?.ruleIds)
    ? input.failure.details.ruleIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const ruleLabels = ruleIds.map((ruleId) => {
    const requirementId = input.requirementBaseline?.rules.find(rule => rule.id === ruleId)?.requirementId;
    return requirementId ? `${ruleId}（${requirementId}）` : ruleId;
  });
  const primaryAction = target === "pending-rules"
    ? {
        label: i18n.t(ruleIds[0] ? "feedback.actions.pendingRules" : "feedback.actions.systemRequirements"),
        onSelect: () => ruleIds[0]
          ? requestOpenRequirementRule(ruleIds[0])
          : requestOpenProjectWorkspaceTarget("system-requirements"),
      }
    : target === "system-requirements"
      ? {
          label: i18n.t("feedback.actions.systemRequirements"),
          onSelect: () => requestOpenProjectWorkspaceTarget("system-requirements"),
        }
      : target === "requirement-models"
        ? {
            label: i18n.t("feedback.actions.requirementModels"),
            onSelect: () => requestOpenProjectWorkspaceTarget("requirement-models"),
          }
        : target === "design-models"
          ? {
              label: i18n.t("feedback.actions.designModels"),
              onSelect: () => requestOpenProjectWorkspaceTarget("design-models"),
            }
          : target === "feasibility"
            ? {
                label: i18n.t("feedback.actions.feasibility"),
                onSelect: () => requestOpenProjectWorkspaceTarget("feasibility"),
              }
            : target === "provider-settings"
              ? {
                  label: i18n.t("feedback.actions.providerSettings"),
                  onSelect: () => requestOpenProjectWorkspaceTarget("provider-settings"),
                }
              : taskDetailsAvailable
                ? {
                    label: i18n.t("feedback.actions.taskDetails"),
                    onSelect: () =>
                      requestOpenGenerationTask({
                        clientTaskId: input.clientTaskId,
                        runId: input.runId,
                      }),
                  }
                : undefined;
  return {
    title: input.failure?.title ?? i18n.t("generation.dialog.titles.failed"),
    tone: "destructive",
    message: [
      input.failure?.message ?? input.message ?? i18n.t("errors.codes.RUN_INTERNAL_ERROR"),
      target === "pending-rules" && ruleLabels.length > 0
        ? i18n.t("errors.affectedRules", { ids: ruleLabels.join("、") })
        : null,
      diagnosticId &&
      (Boolean(input.failure?.requestId) ||
        input.failure?.code === "INTERNAL_ERROR" ||
        input.failure?.code === "RUN_INTERNAL_ERROR")
        ? i18n.t("errors.diagnosticId", { id: diagnosticId })
        : null,
    ].filter(Boolean).join(" "),
    runId: input.runId,
    stageLabel: input.stageLabel,
    primaryAction,
  };
}

export function requirementRunCompletionDialog(input: {
  diagramFailureCount: number;
  isRulesOnly: boolean;
  ignoredCount: number;
  runId: string;
}): GenerationResultDialogState {
  return {
    title:
      input.diagramFailureCount > 0
        ? i18n.t("generation.dialog.titles.requirementsPartial")
        : input.isRulesOnly
          ? i18n.t("generation.dialog.titles.rulesCompleted")
          : i18n.t("generation.dialog.titles.requirementsCompleted"),
    tone:
      input.ignoredCount > 0 || input.diagramFailureCount > 0
        ? "warning"
        : "success",
    message: [
      completedRunResultMessage({
        diagramFailureCount: input.diagramFailureCount,
      }),
      input.ignoredCount > 0
        ? i18n.t("requirements.source.ignoredSummary", { count: input.ignoredCount })
        : null,
    ].filter(Boolean).join(" "),
    runId: input.runId,
    stageLabel: input.isRulesOnly ? i18n.t("generation.dialog.labels.rules") : i18n.t("generation.dialog.labels.requirementModels"),
    targetLabel: input.isRulesOnly ? i18n.t("generation.dialog.labels.currentText") : i18n.t("generation.dialog.labels.selectedRequirementModels"),
  };
}

export function designRunCompletionDialog(input: {
  diagramFailureCount: number;
  runId: string;
}): GenerationResultDialogState {
  return {
    title: input.diagramFailureCount > 0 ? i18n.t("generation.dialog.titles.designPartial") : i18n.t("generation.dialog.titles.designCompleted"),
    tone: input.diagramFailureCount > 0 ? "warning" : "success",
    message: completedRunResultMessage({
      diagramFailureCount: input.diagramFailureCount,
    }),
    runId: input.runId,
    stageLabel: i18n.t("generation.dialog.labels.designModels"),
    targetLabel: i18n.t("generation.dialog.labels.selectedDesignModels"),
  };
}



export function documentRunCompletionDialog(input: {
  documentTitle: string;
  runId: string;
  missingArtifactCount?: number;
}): GenerationResultDialogState {
  const hasMissingArtifacts = (input.missingArtifactCount ?? 0) > 0;
  return {
    title: hasMissingArtifacts ? i18n.t("generation.dialog.titles.documentMissing") : i18n.t("generation.dialog.titles.documentCompleted"),
    tone: "success",
    message: hasMissingArtifacts
      ? i18n.t("generation.dialog.documentMissing", { title: input.documentTitle, count: input.missingArtifactCount })
      : i18n.t("generation.dialog.documentCompleted", { title: input.documentTitle }),
    runId: input.runId,
    stageLabel: i18n.t("generation.dialog.labels.document"),
    targetLabel: input.documentTitle,
  };
}

export function useGenerationDialogActions(canStartRuns: boolean) {
  const { openFeedback } = useFeedbackDialog();
  const projectId = useWorkspaceProjectId();
  const pendingRetries = useRef(new Set<string>());
  const [generationConfirmationDialog, setGenerationConfirmationDialog] =
    useState<GenerationConfirmationDialogState | null>(null);

  const openGenerationResultDialog = useCallback(
    (input: GenerationResultDialogState) => {
      openFeedback(generationResultFeedback(input));
    },
    [openFeedback],
  );

  const retryFailedRun = useCallback(async (runId: string) => {
    if (!canStartRuns || !projectId || pendingRetries.current.has(runId)) return;
    pendingRetries.current.add(runId);
    try {
      // The retry endpoint owns the saved failure scope, including individual use cases.
      const response = await platformApi.retryProjectRun(projectId, runId);
      const nextRunId = response.runId ?? response.run?.runId;
      if (nextRunId) {
        notifyProjectRunsChanged(projectId, nextRunId);
        requestOpenGenerationTask({ runId: nextRunId });
      }
    } catch (error) {
      openGenerationResultDialog(failedRunResultDialog({
        runId, stageLabel: i18n.t("generation.dialog.retryFailedModels"),
        failure: operationFailurePresentation(error, { hasTaskDetails: true }),
      }));
    } finally {
      pendingRetries.current.delete(runId);
    }
  }, [canStartRuns, projectId, openGenerationResultDialog]);

  const confirmGeneration = useCallback(
    (summary: GenerationConfirmationSummary) =>
      new Promise<boolean>((resolve) => {
        setGenerationConfirmationDialog((current) => {
          current?.resolve(false);
          return { ...summary, resolve };
        });
      }),
    [],
  );

  const closeGenerationConfirmationDialog = useCallback(
    (confirmed: boolean) => {
      setGenerationConfirmationDialog((current) => {
        current?.resolve(confirmed);
        return null;
      });
    },
    [],
  );

  return {
    closeGenerationConfirmationDialog,
    confirmGeneration,
    generationConfirmationDialog,
    openGenerationResultDialog,
    retryFailedRun: canStartRuns && projectId ? retryFailedRun : undefined,
  };
}
