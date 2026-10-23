// Restores active model runs after navigation without starting another generation job.
import { useEffect, useRef } from "react";
import type { DesignRunSnapshot, FeasibilityArtifactKind, FeasibilityRunSnapshot, RunEventInput, RunSnapshot } from "@uml-platform/contracts";
import { completedFeasibilityArtifacts, feasibilityArtifactFromEvent } from "../../feasibility/lib/feasibility-run-progress";
import type { WorkspaceRepository } from "../../../services/workspace-repository/index";
import type { GenerationTask, GenerationTaskRunSummary } from "../model/session-state";
import { shouldRefreshRunSnapshotFromEvent } from "./run-events";

interface RecoveredGenerationRunsInput {
  initialized: boolean;
  repository: WorkspaceRepository;
  runs: GenerationTaskRunSummary[];
  getTasks: () => GenerationTask[];
  recoverTask: (run: GenerationTaskRunSummary) => string;
  onEvent: (taskId: string, event: RunEventInput) => void;
  onSnapshot: (taskId: string, snapshot: RunSnapshot | DesignRunSnapshot | FeasibilityRunSnapshot) => void | Promise<void>;
}

export function useRecoveredGenerationRuns(input: RecoveredGenerationRunsInput) {
  const latest = useRef(input);
  latest.current = input;
  const connections = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const activeConnections = connections.current;
    return () => {
      for (const controller of activeConnections.values()) controller.abort();
      activeConnections.clear();
    };
  }, [input.repository]);

  useEffect(() => {
    if (!input.initialized) return;
    for (const run of input.runs) {
      const runId = run.runId;
      if (!runId || (run.status !== "queued" && run.status !== "running") ||
        (run.runKind !== "requirements" && run.runKind !== "design" && run.runKind !== "feasibility") || connections.current.has(runId)) continue;
      const existing = latest.current.getTasks().find((task) => task.runId === runId);
      // Locally started runs already own a subscription. Recovered runs may retry
      // a temporary network failure on the next server summary refresh.
      if (existing && (!existing.clientTaskId.startsWith("recovered:") ||
        (existing.status !== "queued" && existing.status !== "running"))) continue;
      const repository = input.repository;
      const read = run.runKind === "feasibility" ? repository.getFeasibilityRunSnapshot?.bind(repository) :
        run.runKind === "design" ? repository.getDesignRunSnapshot?.bind(repository) : repository.getRunSnapshot.bind(repository);
      const subscribe = run.runKind === "feasibility" ? repository.subscribeToFeasibilityRun?.bind(repository) :
        run.runKind === "design" ? repository.subscribeToDesignRun?.bind(repository) : repository.subscribeToRun.bind(repository);
      if (!read || !subscribe) continue;
      const taskId = latest.current.recoverTask(run);
      const controller = new AbortController();
      connections.current.set(runId, controller);
      const pendingArtifacts = new Set<FeasibilityArtifactKind>();
      let recoveringTerminal = false;
      const apply = async (snapshot: RunSnapshot | DesignRunSnapshot | FeasibilityRunSnapshot) => {
        // Missing or mismatched snapshots cannot restore this run's workspace.
        if (snapshot?.runId !== runId || controller.signal.aborted) return;
        await latest.current.onSnapshot(taskId, snapshot);
        if ("selectedArtifacts" in snapshot) {
          for (const kind of completedFeasibilityArtifacts(snapshot)) pendingArtifacts.delete(kind);
          if (!["queued", "running"].includes(snapshot.status)) pendingArtifacts.clear();
        }
      };
      // Coalesce replay bursts and serialize reads so older responses cannot
      // overwrite a newer partial snapshot or terminal result.
      let refreshRequested = false;
      let refreshing: Promise<void> | null = null;
      let snapshotRevision = 0;
      const refresh = () => {
        refreshRequested = true;
        if (!refreshing) {
          refreshing = (async () => {
            while (refreshRequested && !controller.signal.aborted) {
              refreshRequested = false;
              const revision = snapshotRevision;
              try {
                const snapshot = await read(runId);
                if (revision === snapshotRevision) await apply(snapshot);
              } catch (error) {
                if (!pendingArtifacts.size) throw error;
              }
              // Recovered SSE subscriptions see the same persistence lag as a
              // locally started run; retry until the announced branch is readable.
              if (pendingArtifacts.size && !controller.signal.aborted) {
                await new Promise<void>((resolve) => setTimeout(resolve, 700));
                refreshRequested = true;
              }
            }
          })().finally(() => { refreshing = null; });
        }
        return refreshing;
      };
      void (async () => {
        await refresh().catch(() => {});
        if (controller.signal.aborted) return;
        await subscribe(runId, (event: RunEventInput) => {
          if (controller.signal.aborted) return;
          latest.current.onEvent(taskId, event);
          if (event.type === "completed") {
            // Invalidate in-flight reads before applying the terminal snapshot.
            controller.abort();
            if (event.snapshot?.runId === runId) void latest.current.onSnapshot(taskId, event.snapshot as RunSnapshot | DesignRunSnapshot | FeasibilityRunSnapshot);
          } else if (run.runKind === "feasibility" && (event.type === "failed" || event.type === "cancelled")) {
            // A failed sibling must not hide the branches already accepted by the server.
            recoveringTerminal = true;
            snapshotRevision += 1;
            void refresh().catch(() => {}).finally(() => controller.abort());
          } else if (shouldRefreshRunSnapshotFromEvent(event)) {
            const artifact = run.runKind === "feasibility" && event.type === "artifact_ready" ? feasibilityArtifactFromEvent(event) : null;
            if (artifact) pendingArtifacts.add(artifact);
            void refresh().catch(() => {});
          }
        }, {
          signal: controller.signal,
          onSnapshot: (snapshot: RunSnapshot | DesignRunSnapshot | FeasibilityRunSnapshot) => {
            // A slow event-triggered read must not hold up polling recovery.
            snapshotRevision += 1;
            return apply(snapshot);
          },
        });
      })().catch(() => {
        // Connection errors are recoverable; do not turn a server-running task
        // into a failed generation. The next summary refresh will reconnect.
      }).finally(() => {
        // Failed streams finish their terminal read; other closed subscriptions
        // must stop pending receipt polling before a later reconnect takes over.
        if (!recoveringTerminal) controller.abort();
        if (connections.current.get(runId) === controller) connections.current.delete(runId);
      });
    }
  }, [input.initialized, input.repository, input.runs]);
}
