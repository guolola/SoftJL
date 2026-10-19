// Projects rendered snapshot artifacts into per-model progress during connection recovery.
import type { DesignRunSnapshot, FeasibilityRunSnapshot, RunEventInput, RunSnapshot } from "@uml-platform/contracts";
import { completedFeasibilityArtifacts, feasibilityArtifactLabels } from "../../feasibility/lib/feasibility-run-progress";
import type { GenerationTask } from "../model/session-state";
import { updateTaskFromEvent } from "./generation-tasks";

export function snapshotArtifactEvents(snapshot: RunSnapshot | DesignRunSnapshot | FeasibilityRunSnapshot): RunEventInput[] {
  if ("selectedArtifacts" in snapshot) return completedFeasibilityArtifacts(snapshot).map((kind) => ({
    type: "artifact_ready",
    stage: kind === "context" ? "render_context" : kind === "business-flow" ? "render_business_flow" : "generate_implementation",
    artifactKind: kind === "context" ? "feasibilityContext" : kind === "business-flow" ? "feasibilityBusinessFlow" : "feasibilityImplementation",
    subtaskId: kind, subtaskLabel: feasibilityArtifactLabels[kind], subtaskStatus: "completed",
  }));
  const selected = new Set<string>(snapshot.selectedDiagrams);
  return snapshot.svgArtifacts
    .filter((artifact) => selected.has(artifact.diagramKind) &&
      !snapshot.diagramErrors[artifact.diagramKind] &&
      !snapshot.diagramErrors[artifact.modelId ?? artifact.diagramKind])
    .map((artifact) => ({
      type: "artifact_ready",
      stage: "render_svg",
      artifactKind: "svg",
      diagramKind: artifact.diagramKind,
      modelId: artifact.modelId ?? artifact.diagramKind,
      subtaskId: artifact.modelId ?? artifact.diagramKind,
      subtaskLabel: snapshot.models.find((model) =>
        (model.modelId ?? model.diagramKind) === (artifact.modelId ?? artifact.diagramKind))?.title,
      subtaskStatus: "completed",
    }));
}

export function updateTaskFromSnapshotArtifacts(task: GenerationTask, snapshot: RunSnapshot | DesignRunSnapshot | FeasibilityRunSnapshot) {
  const next = snapshotArtifactEvents(snapshot).reduce((current, event) => {
    if (event.type !== "artifact_ready") return current;
    if (current.subtasks.some((subtask) =>
      subtask.id === ("selectedArtifacts" in snapshot ? event.subtaskId : `render_svg:${event.subtaskId}`) && subtask.status === "completed")) return current;
    return updateTaskFromEvent(current, event, { queued: "任务已进入队列", completed: "生成完成" });
  }, task);
  if (next === task) return task;
  return task.status === "queued" || task.status === "running" ? next : {
    ...next, status: task.status, progress: task.progress, message: task.message,
    messageCode: task.messageCode, finishedAt: task.finishedAt,
  };
}
