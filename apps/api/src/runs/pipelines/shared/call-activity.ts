// Batches durable user-visible output and records the lifetime of one real model call.
import { randomUUID } from "node:crypto";
import type { RunActivityEvent, RunInputImage, RunStage } from "@uml-platform/contracts";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";

export function createCallActivity(input: {
  record: RunRecord;
  stage: RunStage;
  subtaskId?: string;
  subtaskLabel?: string;
  format?: "text" | "technical";
  modelId?: string;
  operation?: RunActivityEvent["operation"];
  round?: number;
}) {
  const callId = randomUUID();
  let started = false;
  let ended = false;
  let thinking = false;
  let pending = "";
  let pendingPhase: "output" | "reasoning" | "summary" | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const emit = (phase: RunActivityEvent["phase"], text?: string, inputImages?: RunInputImage[]) => {
    emitEvent(input.record, {
      type: "run_activity", eventId: randomUUID(), createdAt: new Date().toISOString(),
      runId: input.record.snapshot.runId, stage: input.stage, callId,
      modelId: input.modelId, operation: input.operation, round: input.round,
      subtaskId: input.subtaskId, subtaskLabel: input.subtaskLabel,
      format: input.format ?? "technical", phase, text,
      ...(inputImages?.length ? { inputImages } : {}),
    });
  };
  const start = (images?: RunInputImage[]) => {
    if (started || ended || input.record.terminal) return;
    started = true;
    emit("started", undefined, images?.map((image, index) => ({ ...image, caption: image.caption ?? `${input.subtaskLabel ?? "此阶段"}使用的图片 ${index + 1}` })));
  };
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (pending && pendingPhase) emit(pendingPhase, pending);
    pending = "";
    pendingPhase = null;
  };
  // Flush on phase switches so replay keeps the provider's reasoning, summary,
  // and answer fragments in the same order as the live stream.
  const append = (phase: "output" | "reasoning" | "summary", chunk: string) => {
    if (!chunk) return;
    if (pendingPhase && pendingPhase !== phase) flush();
    pendingPhase = phase;
    pending += chunk;
    schedule();
  };
  const schedule = () => {
    if (pending.length >= 4096) flush();
    else timer ??= setTimeout(flush, 100);
  };
  const finish = (phase: "completed" | "failed") => {
    if (ended) return;
    start();
    // Flush before the closing event so replay and live output have identical order.
    flush();
    ended = true;
    emit(phase);
    input.record.beforeTerminal?.delete(beforeTerminal);
  };
  const beforeTerminal = () => { flush(); ended = true; };
  (input.record.beforeTerminal ??= new Set()).add(beforeTerminal);
  return {
    callId,
    onStart: start,
    onChunk(chunk: string) {
      if (ended || input.record.terminal) return;
      start(); append("output", chunk);
    },
    onReasoningChunk(chunk: string) {
      if (ended || input.record.terminal || !chunk) return;
      start();
      if (!thinking) { thinking = true; emit("thinking"); }
      append("reasoning", chunk);
    },
    onReasoningSummary(chunk: string) {
      if (ended || input.record.terminal) return;
      start(); append("summary", chunk);
    },
    onComplete: () => finish("completed"),
    onError: () => finish("failed"),
  };
}
