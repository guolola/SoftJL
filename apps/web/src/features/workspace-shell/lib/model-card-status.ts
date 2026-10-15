// Resolves compact card states without letting retained artifacts hide a retry or failure.
import { designDiagramKindFromRecordKey } from "@uml-platform/contracts";
import type { GenerationStatus } from "../../../shared/ui/generation-status-icon";
import type { GenerationTask } from "../../workspace-session/model/session-state";
import { sidebarStatusFromSubtaskStatus } from "./sidebar-menu-model";

export function generationCardStatus({ active, failed, stale, exists }: {
  active?: "queued" | "running";
  failed?: boolean;
  stale?: boolean;
  exists: boolean;
}): GenerationStatus {
  if (active) return active;
  if (failed) return "failed";
  if (stale) return "stale";
  return exists ? "completed" : "missing";
}

export function modelTargetMatches(id: string, diagram: string, kind: "requirements" | "design") {
  const modelId = id.replace(/^(?:generate_models|generate_design_models|generate_design_sequence|generate_plantuml|render_svg|verify_diagram_visual):/, "");
  return modelId === diagram || modelId.startsWith(`${diagram}:`) ||
    (kind === "design" && designDiagramKindFromRecordKey(modelId) === diagram);
}

export function modelCardTaskStatus(tasks: GenerationTask[], kind: "requirements" | "design", diagram: string) {
  // Only active runs contribute transient state; persisted diagram errors own terminal failures.
  const subtasks = tasks.filter(task => task.kind === kind && (task.status === "running" || task.status === "queued"))
    .flatMap(task => task.subtasks.filter(subtask => modelTargetMatches(subtask.id, diagram, kind)));
  const statuses = subtasks.map(subtask => sidebarStatusFromSubtaskStatus(subtask.status));
  if (statuses.includes("running")) return "running";
  if (statuses.includes("queued")) return "queued";
  if (statuses.includes("failed")) return "failed";
  // A rendered SVG remains in progress until its visual review settles.
  const awaitingVisual = subtasks.some(subtask => {
    if (!/^(generate_models|generate_design_models|generate_design_sequence|generate_plantuml):/.test(subtask.id)) return false;
    const modelId = subtask.id.slice(subtask.id.indexOf(":") + 1);
    return !subtasks.some(item => item.id === `verify_diagram_visual:${modelId}` && ["completed", "pending_review"].includes(item.status));
  });
  if (awaitingVisual) return "running";
  return undefined;
}
