// Composes the selected task's restored transcript and single retry action without result navigation.
import { useMemo, useState } from "react";
import type { RunEventInput, RunStage } from "@uml-platform/contracts";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { requestOpenGenerationTask } from "../../../shared/lib/app-navigation";
import { platformApi, type PlatformRunSummary } from "../../user-platform/services/platform-api";
import { useWorkspaceSession } from "../../workspace-session/state";
import { mergeTranscriptEvents, progressTranscriptEvents } from "../../workspace-session/lib/run-transcript";
import { projectGenerationTranscript, readableTaskText } from "../lib/generation-transcript";
import { useFrameValue } from "../lib/use-frame-value";
import { useRunTranscript } from "../lib/use-run-transcript";
import { GenerationTranscript, type GenerationQueueDetails } from "./generation-transcript";
import { generationFailureSummary } from "../lib/generation-failure-summary";
import { operationFailurePresentation } from "../../workspace-session/lib/operation-failure";
import { useFloatingAlert } from "../../../shared/ui/floating-alert";

const emptyRuns: PlatformRunSummary[] = [];
const emptyEvents: RunEventInput[] = [];
export function ProjectGenerationTasksDrawerContent({ projectRuns = emptyRuns, preferredRunId, projectId }: {
  projectRuns?: PlatformRunSummary[];
  preferredRunId?: string | null;
  projectId?: string;
} = {}) {
  const { t } = useTranslation();
  const { showAlert } = useFloatingAlert();
  const session = useWorkspaceSession();
  const [actionBusy, setActionBusy] = useState(false);
  const [actionRun, setActionRun] = useState<PlatformRunSummary | null>(null);
  const explicitlySelectedLocal = session.selectedGenerationTaskId
    ? session.generationTasks.find(
        (task) => task.clientTaskId === session.selectedGenerationTaskId,
      )
    : undefined;
  const candidateLocal = preferredRunId
    ? session.generationTasks.find((task) => task.runId === preferredRunId)
    : explicitlySelectedLocal ?? session.generationTasks.find((task) => ["queued", "running"].includes(task.status)) ?? session.generationTasks[0];
  const hasExplicitLocalSelection = !preferredRunId && Boolean(explicitlySelectedLocal);
  const activeRemote = projectRuns.find((run) => ["queued", "running"].includes(run.status));
  const local = !hasExplicitLocalSelection && !preferredRunId && activeRemote && candidateLocal && !["queued", "running"].includes(candidateLocal.status) ? undefined : candidateLocal;
  const remote = projectRuns.find((run) => run.runId === (preferredRunId ?? local?.runId))
    ?? (preferredRunId || hasExplicitLocalSelection ? undefined : activeRemote ?? [...projectRuns].sort((a, b) => (b.updatedAt ?? b.completedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.completedAt ?? a.createdAt ?? ""))[0]);
  const relevantAction = actionRun && (!preferredRunId || preferredRunId === actionRun.runId || preferredRunId === actionRun.sourceRunId) ? actionRun : null;
  const runId = relevantAction?.runId ?? preferredRunId ?? local?.runId ?? (hasExplicitLocalSelection ? null : remote?.runId ?? session.currentRunDiagnostics.runId);
  const selectedLocal = local?.runId === runId || !runId ? local : undefined;
  const selectedRemote = relevantAction?.runId === runId ? relevantAction : remote?.runId === runId ? remote : undefined;
  const kind = selectedLocal?.kind ?? selectedRemote?.runKind ?? session.currentRunDiagnostics.runKind;
  const scopedProjectId = projectId ?? selectedRemote?.projectId;
  const restored = useRunTranscript(scopedProjectId, runId);
  const diagnostics = selectedLocal?.diagnostics ?? (!runId || session.currentRunDiagnostics.runId === runId ? session.currentRunDiagnostics : undefined);
  const events = useMemo(() => {
    const localEvents = diagnostics ? diagnostics.transcript ?? emptyEvents : !restored.events.length && selectedRemote?.stage ? [{ type: "stage_started", stage: selectedRemote.stage as RunStage }] as RunEventInput[] : emptyEvents;
    return mergeTranscriptEvents(restored.events, progressTranscriptEvents(localEvents));
  }, [diagnostics, restored.events, selectedRemote?.stage]);
  const fallbackStatus = relevantAction?.status ?? restored.status ?? selectedRemote?.status ?? selectedLocal?.status ?? (runId ? "running" : session.runStatus);
  const taskKey = runId ?? selectedLocal?.clientTaskId ?? "empty";
  const live = ["queued", "running"].includes(fallbackStatus) && !events.some((event) => ["completed", "failed", "cancelled"].includes(event.type));
  const displayedEvents = useFrameValue(events, live && !restored.loading, taskKey);
  const currentVisualReviews = useMemo(() => Object.fromEntries(
    Object.entries(session.visualReviews).filter(([key]) => key.startsWith(`${kind}:`)).map(([key, review]) => [key.slice(`${kind}:`.length), review]),
  ), [session.visualReviews, kind]);
  const transcript = useMemo(() => projectGenerationTranscript(displayedEvents, fallbackStatus, selectedLocal?.subtasks, currentVisualReviews, { includeContent: false }), [displayedEvents, fallbackStatus, selectedLocal?.subtasks, currentVisualReviews]);
  const active = ["queued", "running"].includes(transcript.status);
  const queuedEvent = [...displayedEvents].reverse().find((event) => event.type === "queued");
  const queuedItems = active ? (selectedLocal?.subtasks ?? []).filter((subtask) =>
    subtask.status === "queued" && (
      subtask.queuePosition !== undefined || subtask.queueAhead !== undefined ||
      subtask.estimatedWaitMs !== undefined || subtask.queueReason !== undefined
    ),
  ) : [];
  const queue: GenerationQueueDetails | null = transcript.status === "queued" || queuedItems.length > 0 ? {
    position: queuedEvent?.type === "queued" && transcript.status === "queued" ? queuedEvent.queuePosition : undefined,
    ahead: queuedEvent?.type === "queued" && transcript.status === "queued" ? queuedEvent.queueAhead : undefined,
    estimatedWaitMs: queuedEvent?.type === "queued" && transcript.status === "queued" ? queuedEvent.estimatedWaitMs : undefined,
    reason: queuedEvent?.type === "queued" && transcript.status === "queued" ? queuedEvent.queueReason : undefined,
    items: queuedItems.map((subtask) => ({
      id: subtask.id, label: readableTaskText(subtask.label), ahead: subtask.queueAhead,
      estimatedWaitMs: subtask.estimatedWaitMs, reason: subtask.queueReason,
    })),
  } : null;
  const perform = async (action: () => Promise<void>) => {
    if (actionBusy) return;
    setActionBusy(true);
    try { await action(); } catch (error) {
      showAlert({
        title: operationFailurePresentation(error, {
          fallbackMessage: t("errors.operations.taskAction"),
        }).message,
        tone: "destructive",
      });
    }
    finally { setActionBusy(false); }
  };
  // Historical tasks use their saved model; changing global model settings cannot relabel a past run.
  const providerModel = restored.model ?? selectedRemote?.model ?? diagnostics?.providerModel;
  return <GenerationTranscript key={taskKey} taskKey={taskKey} steps={transcript.visibleSteps} active={active} failed={transcript.status === "failed"} kind={kind} model={providerModel} queue={queue}
    emptyMessage={runId || selectedLocal ? undefined : "暂无生成任务。发起生成后，执行过程会在这里逐段显示。"}
    finalMessage={transcript.finalMessage || (transcript.status === "failed" ? generationFailureSummary(selectedRemote?.error ?? selectedLocal?.errorMessage) : !active && runId ? t(`generation.status.${transcript.status === "interrupted" ? "interruptedDetail" : transcript.status}`) : "")}>
    {restored.loading && <p role="status" className="text-sm text-muted-foreground">正在恢复任务过程…</p>}
    {restored.disconnected && <p role="status" className="text-sm text-muted-foreground">连接中断，正在恢复。已收到的内容会保留。</p>}
    {restored.unavailable && <p role="status" className="text-xs text-destructive">无法读取任务过程，任务可能已移除或你没有访问权限。</p>}
    {!restored.loading && runId && !events.some((event) => event.type === "run_activity") && <p className="text-xs text-muted-foreground">此任务未保存完整回复，当前仅展示可用的执行记录。</p>}


    <div className="flex flex-wrap items-center gap-3">
      {!active && ["failed", "cancelled", "interrupted"].includes(transcript.status) && scopedProjectId && runId && <Button size="sm" variant="default" disabled={actionBusy || restored.loading || restored.unavailable} onClick={() => void perform(async () => {
        if (active) return;
        const response = await platformApi.retryProjectRun(scopedProjectId, runId);
        const nextId = response.runId ?? response.run?.runId;
        if (nextId) { setActionRun({ ...response.run, runId: nextId, sourceRunId: runId, runKind: kind, status: response.status ?? response.run?.status ?? "queued" }); requestOpenGenerationTask({ runId: nextId }); }
      })}>{t("generation.drawer.retryTask")}</Button>}
    </div>

  </GenerationTranscript>;
}
