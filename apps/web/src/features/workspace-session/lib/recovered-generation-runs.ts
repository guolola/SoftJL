// Restores active model runs after navigation without starting another generation job.
import { useEffect, useRef } from "react";
import type { DesignRunSnapshot, RunEvent, RunSnapshot } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import type { GenerationTask, GenerationTaskRunSummary } from "../model/session-state";
import { shouldRefreshRunSnapshotFromEvent } from "./run-events";

interface RecoveredGenerationRunsInput {
  initialized: boolean;
  repository: WorkspaceRepository;
  runs: GenerationTaskRunSummary[];
  getTasks: () => GenerationTask[];
  recoverTask: (run: GenerationTaskRunSummary) => string;
  onEvent: (taskId: string, event: RunEvent) => void;
  onSnapshot: (taskId: string, snapshot: RunSnapshot | DesignRunSnapshot) => void;
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
        (run.runKind !== "requirements" && run.runKind !== "design") || connections.current.has(runId)) continue;
      const existing = latest.current.getTasks().find((task) => task.runId === runId);
      // Locally started runs already own a subscription. Recovered runs may retry
      // a temporary network failure on the next server summary refresh.
      if (existing && (!existing.clientTaskId.startsWith("recovered:") ||
        (existing.status !== "queued" && existing.status !== "running"))) continue;
      const repository = input.repository;
      const read = run.runKind === "design" ? repository.getDesignRunSnapshot?.bind(repository) : repository.getRunSnapshot.bind(repository);
      const subscribe = run.runKind === "design" ? repository.subscribeToDesignRun?.bind(repository) : repository.subscribeToRun.bind(repository);
      if (!read || !subscribe) continue;
      const taskId = latest.current.recoverTask(run);
      const controller = new AbortController();
      connections.current.set(runId, controller);
      const apply = (snapshot: RunSnapshot | DesignRunSnapshot) => {
        // Missing or mismatched snapshots cannot restore this run's workspace.
        if (snapshot?.runId === runId && !controller.signal.aborted) latest.current.onSnapshot(taskId, snapshot);
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
              const snapshot = await read(runId);
              if (revision === snapshotRevision) apply(snapshot);
            }
          })().finally(() => { refreshing = null; });
        }
        return refreshing;
      };
      void (async () => {
        await refresh().catch(() => {});
        if (controller.signal.aborted) return;
        await subscribe(runId, (event: RunEvent) => {
          if (controller.signal.aborted) return;
          latest.current.onEvent(taskId, event);
          if (event.type === "completed") {
            // Invalidate in-flight reads before applying the terminal snapshot.
            controller.abort();
            if (event.snapshot?.runId === runId) latest.current.onSnapshot(taskId, event.snapshot as RunSnapshot | DesignRunSnapshot);
          } else if (shouldRefreshRunSnapshotFromEvent(event)) {
            void refresh().catch(() => {});
          }
        }, {
          signal: controller.signal,
          onSnapshot: (snapshot: RunSnapshot | DesignRunSnapshot) => {
            // A slow event-triggered read must not hold up polling recovery.
            snapshotRevision += 1;
            apply(snapshot);
          },
        });
      })().catch(() => {
        // Connection errors are recoverable; do not turn a server-running task
        // into a failed generation. The next summary refresh will reconnect.
      }).finally(() => {
        if (connections.current.get(runId) === controller) connections.current.delete(runId);
      });
    }
  }, [input.initialized, input.repository, input.runs]);
}
