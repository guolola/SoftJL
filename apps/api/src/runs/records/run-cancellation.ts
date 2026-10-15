// Centralizes cooperative cancellation checks used by long-running pipelines.
import type { RunRecord } from "./run-record-store.js";

export class RunCancelledError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} was cancelled`);
    this.name = "RunCancelledError";
  }
}

export function isRunCancelled(record: RunRecord) {
  return record.terminal || record.snapshot.status === "cancelled";
}

export function throwIfRunCancelled(record: RunRecord) {
  if (!isRunCancelled(record)) return;
  throw new RunCancelledError(record.snapshot.runId);
}

export function isRunCancelledError(error: unknown): error is RunCancelledError {
  return error instanceof RunCancelledError;
}
