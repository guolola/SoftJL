// Owns feasibility generation and accepted results for the entire workspace session.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { workspaceGuardConflicts, type FeasibilityArtifactKind, type FeasibilityRunSnapshot, type GenerationExecutionMode, type RunEventInput } from "@uml-platform/contracts";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import { useWorkspaceRepository } from "../../../services/workspace-repository/index";
import { createStartFeasibilityRunInput } from "../../../services/workspace-repository/start-inputs";
import { ApiClientError } from "../../../services/api-client/index";
import { localizeApiFailure } from "../../../shared/i18n/api-errors";
import { generationModelBlockedReason as readGenerationModelBlockedReason } from "../../../shared/lib/generation-model";
import { useFeedbackDialog, type FeedbackDialogState } from "../../../shared/ui/feedback-dialog";
import { acceptedFeasibilityRules, feasibilityArtifactState } from "../../feasibility/lib/feasibility-freshness";
import { completedFeasibilityArtifacts, feasibilityArtifactFromEvent, mergeFeasibilityRunSnapshot } from "../../feasibility/lib/feasibility-run-progress";
import { generationResultFeedback } from "../components/generation-dialogs";
import { failedRunResultDialog } from "./generation-dialog-actions";
import type { WorkspaceSessionState } from "../model/session-state";

type ArtifactKind = FeasibilityArtifactKind;
type Input = Pick<WorkspaceSessionState, "requirementText" | "rules" | "requirementBaseline" | "rulesVersion" |
  "requirementModelTraceability" | "designModelTraceability" | "generationTasks" |
  "canUpdateWorkspace" | "canStartRuns" | "workspacePermissionReason" | "syncFeasibilityArtifacts"> & {
    generationExecutionMode: GenerationExecutionMode;
    beginFeasibilityGenerationTask: (input: {
      selectedArtifacts?: FeasibilityArtifactKind[];
      providerModel: string;
      startedAtMs: number;
    }) => string;
    attachFeasibilityGenerationRun: (clientTaskId: string, runId: string, providerModel: string) => void;
    updateFeasibilityGenerationTask: (clientTaskId: string, event: RunEventInput) => void;
    failFeasibilityGenerationTask: (clientTaskId: string, message: string) => void;
  };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useFeasibilityGeneration({ requirementText, rules, requirementBaseline, rulesVersion,
  requirementModelTraceability, designModelTraceability, generationTasks,
  canUpdateWorkspace, canStartRuns, generationExecutionMode, workspacePermissionReason,
  syncFeasibilityArtifacts, beginFeasibilityGenerationTask, attachFeasibilityGenerationRun,
  updateFeasibilityGenerationTask, failFeasibilityGenerationTask }: Input) {
  const repository = useWorkspaceRepository();
  const { t } = useTranslation();
  const { openFeedback } = useFeedbackDialog();
  const runningRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const sessionActiveRef = useRef(true);
  useEffect(() => {
    sessionActiveRef.current = true;
    return () => { sessionActiveRef.current = false; controllerRef.current?.abort(); };
  }, [repository]);
  const [savedWorkspace, setWorkspace] = useState<WorkspaceRecord | null>(null);
  // Edits in other features immediately update feasibility prerequisites and freshness.
  const workspace = useMemo(() => savedWorkspace && ({ ...savedWorkspace, requirementText, rules, requirementBaseline,
    rulesVersion, requirementModelTraceability, designModelTraceability }),
    [savedWorkspace, requirementText, rules, requirementBaseline, rulesVersion, requirementModelTraceability, designModelTraceability]);
  const latestWorkspaceRef = useRef(workspace);
  latestWorkspaceRef.current = workspace;
  const latestFactsRef = useRef({ requirementText, rules, requirementBaseline });
  latestFactsRef.current = { requirementText, rules, requirementBaseline };
  const [loading, setLoading] = useState(true);
  const [localGenerating, setGenerating] = useState(false);
  // Recovered tasks share the same generation lock even if their final read fails.
  const generating = localGenerating || generationTasks.some((task) => task.kind === "feasibility" &&
    (task.status === "queued" || task.status === "running"));
  const [activeArtifacts, setActiveArtifacts] = useState<ArtifactKind[]>([]);
  const [failedArtifacts, setFailedArtifacts] = useState<ArtifactKind[]>([]);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFailureFeedback, setLastFailureFeedback] =
    useState<FeedbackDialogState | null>(null);
  const reload = useCallback(async (snapshot?: FeasibilityRunSnapshot) => {
    const saved = await repository.loadWorkspace();
    if (!sessionActiveRef.current) return;
    // The workspace write may still be catching up with the terminal event.
    // Keep this run's accepted results visible across that final reload.
    const localFactsChanged = snapshot?.workspaceGuard && workspaceGuardConflicts({ snapshot }, { ...saved, ...latestFactsRef.current }).length > 0;
    const next = snapshot && !localFactsChanged ? mergeFeasibilityRunSnapshot(saved, snapshot, completedFeasibilityArtifacts(snapshot)) : saved;
    // A rejected snapshot leaves the freshly loaded saved workspace authoritative.
    // The shared publication guard also commits the detail-view data atomically.
    syncFeasibilityArtifacts(next, next === saved ? undefined : snapshot);
  }, [repository, syncFeasibilityArtifacts]);

  const generate = async (selectedArtifacts: ArtifactKind[]) => {
    // Mirror the UI prerequisites for every entry point, including detail-view regeneration.
    if (runningRef.current || generating || !workspace) return;
    const blockedReason = !canUpdateWorkspace || !canStartRuns
      ? workspacePermissionReason ?? t("feasibility.runPermissionDenied")
      : acceptedFeasibilityRules(workspace).length === 0 ? t("feasibility.prerequisiteRules")
        : readGenerationModelBlockedReason(generationExecutionMode) ??
          (selectedArtifacts.length === 0 ? t("feasibility.noArtifactSelected") : null);
    if (blockedReason) { setError(blockedReason); return; }
    if (selectedArtifacts.includes("implementation") &&
      feasibilityArtifactState(workspace).missingDependencies.some((kind) => !selectedArtifacts.includes(kind))) {
      setError(t("feasibility.dependencies.required"));
      return;
    }
    if (!repository.startFeasibilityRun || !repository.getFeasibilityRunSnapshot) {
      const message = t("feasibility.repositoryUnsupported");
      setError(message);
      const feedback: FeedbackDialogState = {
        dedupeKey: "feasibility:unsupported",
        tone: "destructive",
        title: t("feasibility.feedback.failureTitle"),
        message,
      };
      setLastFailureFeedback(feedback);
      openFeedback(feedback);
      return;
    }
    runningRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setGenerating(true);
    setActiveArtifacts(selectedArtifacts);
    setFailedArtifacts((current) => current.filter((artifact) => !selectedArtifacts.includes(artifact)));
    setError(null);
    let currentArtifact: ArtifactKind = selectedArtifacts[0] ?? "context";
    let clientTaskId: string | null = null;
    let runId: string | null = null;
    let runFailureMessage: string | null = null;
    let snapshotApplications = Promise.resolve();
    let latestSnapshot: FeasibilityRunSnapshot | undefined;
    let snapshotRevision = 0;
    let terminal = false;
    const acceptedArtifacts = new Set<FeasibilityArtifactKind>();
    const pendingArtifacts = new Set<FeasibilityArtifactKind>();
    let snapshotRefresh: Promise<void> | null = null;
    const applySnapshot = (snapshot: FeasibilityRunSnapshot) => {
      latestSnapshot = snapshot;
      const completed = completedFeasibilityArtifacts(snapshot);
      if (!completed.length) return;
      // Read current saved inputs instead of the workspace captured at run start.
      // Serialize receipts so a slower read cannot publish an earlier snapshot last.
      snapshotApplications = snapshotApplications.then(async () => {
        const before = latestWorkspaceRef.current;
        const saved = await repository.loadWorkspace();
        if (controller.signal.aborted) return;
        const current = latestWorkspaceRef.current !== before ? latestWorkspaceRef.current ?? saved : saved;
        if (snapshot.workspaceGuard && workspaceGuardConflicts({ snapshot }, { ...current, ...latestFactsRef.current }).length) return;
        const next = mergeFeasibilityRunSnapshot(current, snapshot, completed);
        if (next === current) return;
        syncFeasibilityArtifacts(next, snapshot);
        for (const kind of completed) pendingArtifacts.delete(kind);
      }).catch(() => { /* Terminal reload retries transient workspace reads. */ });
      setActiveArtifacts((current) => current.filter((kind) => !completed.includes(kind)));
      for (const kind of completed) {
        acceptedArtifacts.add(kind);
        if (clientTaskId) updateFeasibilityGenerationTask(clientTaskId, {
          type: "artifact_ready", stage: kind === "context" ? "render_context" : kind === "business-flow" ? "render_business_flow" : "generate_implementation",
          artifactKind: kind === "context" ? "feasibilityContext" : kind === "business-flow" ? "feasibilityBusinessFlow" : "feasibilityImplementation",
          subtaskId: kind, subtaskStatus: "completed",
        });
      }
    };
    const refreshAcceptedArtifacts = () => {
      if (snapshotRefresh) return;
      // SSE receipts can arrive before the snapshot write is visible to HTTP reads.
      // Keep retrying pending branches so their detail views do not wait for the batch.
      snapshotRefresh = (async () => {
        while (!terminal && !controller.signal.aborted && pendingArtifacts.size) {
          const revision = snapshotRevision;
          try {
            const snapshot = await repository.getFeasibilityRunSnapshot!(runId!);
            if (!terminal && !controller.signal.aborted && revision === snapshotRevision) {
              applySnapshot(snapshot);
              await snapshotApplications;
            }
          } catch { /* A subsequent read retries temporary persistence or network lag. */ }
          if (!terminal && !controller.signal.aborted && pendingArtifacts.size) await sleep(700);
        }
      })().finally(() => { snapshotRefresh = null; });
    };
    try {
      const input = createStartFeasibilityRunInput(selectedArtifacts, generationExecutionMode);
      clientTaskId = beginFeasibilityGenerationTask({
        providerModel: input.providerSettings.model,
        startedAtMs: Date.now(),
        selectedArtifacts,
      });
      ({ runId } = await repository.startFeasibilityRun(input));
      if (controller.signal.aborted) return;
      attachFeasibilityGenerationRun(
        clientTaskId,
        runId,
        input.providerSettings.model,
      );
      if (repository.subscribeToFeasibilityRun) {
        await repository.subscribeToFeasibilityRun(runId, (event) => {
          if (controller.signal.aborted) return;
          if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") {
            terminal = true;
            snapshotRevision += 1;
          }
          if (event.type === "completed" && "selectedArtifacts" in event.snapshot) applySnapshot(event.snapshot);
          if (clientTaskId) updateFeasibilityGenerationTask(clientTaskId, event);
          const artifact = feasibilityArtifactFromEvent(event);
          if (!terminal && event.type === "artifact_ready" && artifact) {
            acceptedArtifacts.add(artifact);
            pendingArtifacts.add(artifact);
            refreshAcceptedArtifacts();
          }
          if (event.type === "stage_started" || event.type === "stage_progress") {
            if (event.stage === "generate_implementation") currentArtifact = "implementation";
            else if (event.stage === "generate_business_flow" || event.stage === "render_business_flow") currentArtifact = "business-flow";
            else if (event.stage === "generate_context" || event.stage === "render_context") currentArtifact = "context";
            setGenerationMessage(
              currentArtifact === "business-flow"
                ? t("feasibility.generation.businessFlow")
                : event.stage === "generate_context"
                ? t("feasibility.generation.context")
                : event.stage === "render_context"
                  ? t("feasibility.generation.rendering")
                  : event.stage === "generate_implementation"
                    ? t("feasibility.generation.implementation")
                    : t("feasibility.generation.waiting"),
            );
          }
          if (event.type === "failed") {
            runFailureMessage = localizeApiFailure({ error: event.error }, 500);
            setError(runFailureMessage);
          }
        }, { signal: controller.signal, onSnapshot: (snapshot) => {
          if (controller.signal.aborted) return;
          snapshotRevision += 1;
          applySnapshot(snapshot);
        } });
        if (runFailureMessage) throw new Error(runFailureMessage);
      } else {
        while (true) {
          const snapshot = await repository.getFeasibilityRunSnapshot(runId);
          if (controller.signal.aborted) return;
          applySnapshot(snapshot);
          if (snapshot.currentStage === "generate_implementation") currentArtifact = "implementation";
          else if (snapshot.currentStage === "generate_business_flow" || snapshot.currentStage === "render_business_flow") currentArtifact = "business-flow";
          else if (snapshot.currentStage === "generate_context" || snapshot.currentStage === "render_context") currentArtifact = "context";
          if (snapshot.status === "completed") break;
          if (snapshot.status === "failed" || snapshot.status === "cancelled") {
            runFailureMessage = snapshot.status === "cancelled"
              ? t("feasibility.errors.cancelled")
              : localizeApiFailure(snapshot.error ? { error: snapshot.error } : null, 500);
            throw new Error(runFailureMessage);
          }
          await sleep(700);
        }
      }
      terminal = true;
      snapshotRevision += 1;
      await snapshotApplications;
      if (controller.signal.aborted) return;
      await reload(latestSnapshot);
      if (controller.signal.aborted) return;
      window.dispatchEvent(
        new CustomEvent("uml-generation-completed", {
          detail: { kind: "feasibility", selectedArtifacts },
        }),
      );
      setGenerationMessage(t("feasibility.generation.completed"));
      setLastFailureFeedback(null);
      openFeedback({
        dedupeKey: "feasibility:generation:completed",
        revision: runId,
        tone: "success",
        title: t("feasibility.feedback.successTitle"),
        message: t("feasibility.feedback.successMessage", {
          count: selectedArtifacts.length,
        }),
      });
    } catch (cause) {
      if (controller.signal.aborted) return;
      terminal = true;
      snapshotRevision += 1;
      const message = runFailureMessage
        ?? (cause instanceof ApiClientError ? cause.message : t("feasibility.errors.generate"));
      if (clientTaskId) failFeasibilityGenerationTask(clientTaskId, message);
      setFailedArtifacts((current) => Array.from(new Set([...current, currentArtifact])));
      await snapshotApplications;
      await reload(latestSnapshot).catch(() => undefined);
      if (controller.signal.aborted) return;
      setGenerationMessage(null);
      setError(message);
      const feedback = generationResultFeedback(
        failedRunResultDialog({
          clientTaskId,
          message,
          runId,
          stageLabel: t("feasibility.title"),
        }),
      );
      setLastFailureFeedback(feedback);
      openFeedback(feedback);
    } finally {
      runningRef.current = false;
      setGenerating(false);
      setActiveArtifacts([]);
    }
  };

  // Initialization and manual saves share the same result source as all feasibility views.
  const acceptWorkspace = useCallback((next: WorkspaceRecord) => {
    latestWorkspaceRef.current = next;
    setWorkspace(next);
    setLoading(false);
  }, []);

  // Recovery reads are serialized with one another; each snapshot carries cumulative receipts.
  const recoveryQueue = useRef(Promise.resolve());
  const restoreSnapshot = (snapshot: FeasibilityRunSnapshot) => {
    recoveryQueue.current = recoveryQueue.current.then(async () => {
      await reload(snapshot);
      if (!sessionActiveRef.current) return;
      const active = snapshot.status === "queued" || snapshot.status === "running";
      const completed = completedFeasibilityArtifacts(snapshot);
      setActiveArtifacts(active ? snapshot.selectedArtifacts.filter((kind) => !completed.includes(kind)) : []);
    }).catch(() => { /* A later snapshot retries temporary workspace read failures. */ });
    return recoveryQueue.current;
  };

  return { workspace, loading, generating, activeArtifacts: generating ? activeArtifacts : [], failedArtifacts,
    generationMessage, setGenerationMessage, error, setError, lastFailureFeedback,
    reload, generate, acceptWorkspace, restoreSnapshot };
}
