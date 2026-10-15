// Publishes settled pipeline boundaries while preserving parallel calls and repair attempts.
import type { RunEvent, RunStage } from "@uml-platform/contracts";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";

type FinishedStatus = Extract<RunEvent, { type: "stage_finished" }>["status"];

export function createStageLifecycle(record: RunRecord) {
  const open = new Set<RunStage>();
  const settled = new Set<RunStage>();
  const outcomes = new Map<RunStage, Map<string, FinishedStatus>>();
  let sequentialStage: RunStage | undefined;
  const observe = (event: RunEvent) => {
    if (!("stage" in event) || !event.stage) return;
    if (event.type === "stage_finished") { open.delete(event.stage); settled.add(event.stage); return; }
    if (!["stage_started", "stage_progress", "run_activity", "artifact_ready"].includes(event.type)) return;
    if (event.type === "stage_started") settled.delete(event.stage);
    if (settled.has(event.stage)) return;
    open.add(event.stage);
    if (event.type === "stage_progress" || event.type === "artifact_ready") {
      const id = event.subtaskId ?? event.modelId ?? event.diagramKind;
      if (id && event.subtaskStatus) {
        const results = outcomes.get(event.stage) ?? new Map<string, FinishedStatus>();
        outcomes.set(event.stage, results);
        if (["failed", "pending_review", "completed"].includes(event.subtaskStatus)) {
          results.set(id, event.subtaskStatus as FinishedStatus);
        } else results.delete(id); // A retry supersedes the previous failed attempt.
      }
    }
  };
  const finish = (stage: RunStage, status?: FinishedStatus) => {
    if (!open.has(stage) || record.terminal) return;
    const results = [...(outcomes.get(stage)?.values() ?? [])];
    emitEvent(record, { type: "stage_finished", stage, status: status
      ?? (results.includes("failed") ? "failed" : results.includes("pending_review") ? "pending_review" : "completed") });
  };
  record.listeners.add(observe);
  // Flush stages before the terminal event closes SSE. No started stage is left spinning.
  const close = (event: RunEvent) => {
    const status = event.type;
    for (const stage of [...open]) finish(stage, status === "cancelled" ? "cancelled" : status === "failed" ? "failed" : undefined);
    record.listeners.delete(observe);
  };
  (record.beforeTerminalStages ??= new Set()).add(close);
  return {
    advance(stage: RunStage) {
      if (sequentialStage && sequentialStage !== stage) finish(sequentialStage);
      if (sequentialStage !== stage) outcomes.delete(stage);
      sequentialStage = stage;
    },
    finish,
  };
}
