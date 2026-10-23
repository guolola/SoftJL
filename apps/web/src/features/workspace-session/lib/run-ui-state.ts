// Tracks the session status; task messages and progress live on generation tasks.
import type { RunEventInput } from "@uml-platform/contracts";
import type { RunStatus } from "../../../entities/workspace/model";
import { statusFromRunEvent } from "./run-events";

export function createEmptyRunUiState() { return { runStatus: "idle" as RunStatus }; }
export type RunUiState = ReturnType<typeof createEmptyRunUiState>;
export function deriveRunUiStateFromEvent(event: RunEventInput): RunUiState {
  return { runStatus: statusFromRunEvent(event) };
}
export function cancelledRunUiState(): RunUiState { return { runStatus: "cancelled" }; }
export function failedRunUiState(): RunUiState { return { runStatus: "failed" }; }
export function completedRunUiState(): RunUiState { return { runStatus: "completed" }; }
