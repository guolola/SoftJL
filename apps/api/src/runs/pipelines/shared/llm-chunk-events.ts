// Centralizes user-visible LLM stream events so blank provider chunks do not look like real output.
import {
  llmChunkRunEventSchema,
  stageProgressRunEventSchema,
  type RunStage,
  type RunActivityEvent,
} from "@uml-platform/contracts";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";
import { stageProgressValue } from "./pipeline-events.js";
import type { ModelTaskActivity } from "./model-task-timeout.js";
import type { LlmChunkHandlers } from "./structured-output.js";
import { createCallActivity } from "./call-activity.js";

const BLANK_CHUNK_NOTICE_COUNT = 40;
const BLANK_CHUNK_NOTICE_INTERVAL_MS = 10_000;
const NO_VISIBLE_CHUNK_HEARTBEAT_INITIAL_DELAY_MS = 10_000;
const NO_VISIBLE_CHUNK_HEARTBEAT_INTERVAL_MS = 10_000;
const NO_VISIBLE_CHUNK_HEARTBEAT_MESSAGE =
  "模型正在生成，当前供应商暂未返回可见流式内容";

export interface RunLlmChunkHandlerOptions {
  record: RunRecord;
  stage: RunStage;
  onActivity?: ModelTaskActivity;
  onBlankActivity?: ModelTaskActivity;
  progress?: number;
  diagramKind?: string;
  modelId?: string;
  operation?: RunActivityEvent["operation"];
  round?: number;
  subtaskId?: string;
  subtaskLabel?: string;
  maxVisibleChunks?: number;
  maxVisibleChars?: number;
  truncationMessage?: string;
  noVisibleChunkHeartbeatInitialDelayMs?: number;
  noVisibleChunkHeartbeatIntervalMs?: number;
  noVisibleChunkHeartbeatMessage?: string;
}

export function createRunLlmChunkHandlers({
  record,
  stage,
  onActivity,
  onBlankActivity,
  progress = stageProgressValue(stage),
  diagramKind,
  modelId,
  operation,
  round,
  subtaskId,
  subtaskLabel,
  maxVisibleChunks = Number.POSITIVE_INFINITY,
  maxVisibleChars = Number.POSITIVE_INFINITY,
  truncationMessage = "模型流式输出较长，技术日志已折叠，后台继续解析完整结果",
  noVisibleChunkHeartbeatInitialDelayMs = NO_VISIBLE_CHUNK_HEARTBEAT_INITIAL_DELAY_MS,
  noVisibleChunkHeartbeatIntervalMs = NO_VISIBLE_CHUNK_HEARTBEAT_INTERVAL_MS,
  noVisibleChunkHeartbeatMessage = NO_VISIBLE_CHUNK_HEARTBEAT_MESSAGE,
}: RunLlmChunkHandlerOptions): LlmChunkHandlers {
  const activity = createCallActivity({ record, stage, subtaskId: subtaskId ?? modelId ?? diagramKind, subtaskLabel, modelId, operation, round });
  let emittedChunks = 0;
  let emittedChars = 0;
  let blankChunksSinceContent = 0;
  let lastBlankNoticeAt = 0;
  let truncationNotified = false;

  const emitProgress = (message: string) => {
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress,
        message,
        diagramKind,
        modelId,
        subtaskId,
        subtaskLabel,
        subtaskStatus: "running",
      }),
    );
  };

  const handlers: LlmChunkHandlers = {
    ...activity,
    runContext: { stage, diagramKind, subtaskId: subtaskId ?? modelId ?? diagramKind, subtaskLabel, operation, round },
    // Reasoning is real provider activity even when the final JSON has not started streaming.
    onReasoningChunk(chunk) {
      activity.onReasoningChunk(chunk);
      if (chunk.trim()) onActivity?.();
      else if (chunk) onBlankActivity?.();
    },
    onReasoningSummary(chunk) {
      activity.onReasoningSummary(chunk);
      if (chunk.trim()) onActivity?.();
      else if (chunk) onBlankActivity?.();
    },
    onChunk(chunk) {
      activity.onChunk(chunk);
      blankChunksSinceContent = 0;
      onActivity?.();
      if (emittedChunks >= maxVisibleChunks || emittedChars >= maxVisibleChars) {
        if (!truncationNotified) {
          truncationNotified = true;
          emitProgress(truncationMessage);
        }
        return;
      }
      emittedChunks += 1;
      emittedChars += chunk.length;
      emitEvent(
        record,
        llmChunkRunEventSchema.parse({
          type: "llm_chunk",
          stage,
          chunk,
        }),
      );
    },
    onBlankChunk(chunk) {
      // Whitespace may belong inside a streamed JSON string; retain it in durable output.
      activity.onChunk(chunk);
      onBlankActivity?.();
      blankChunksSinceContent += 1;
      const now = Date.now();
      if (
        blankChunksSinceContent < BLANK_CHUNK_NOTICE_COUNT ||
        now - lastBlankNoticeAt < BLANK_CHUNK_NOTICE_INTERVAL_MS
      ) {
        return;
      }
      lastBlankNoticeAt = now;
      emitProgress("模型持续返回空白片段，等待有效内容");
    },
    startNoVisibleChunkHeartbeat() {
      let stopped = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const clearHeartbeat = () => {
        if (timeout) clearTimeout(timeout);
        timeout = undefined;
      };
      const schedule = (delayMs: number) => {
        clearHeartbeat();
        timeout = setTimeout(() => {
          if (stopped || emittedChunks > 0) return;
          emitProgress(noVisibleChunkHeartbeatMessage);
          schedule(noVisibleChunkHeartbeatIntervalMs);
        }, delayMs);
      };

      schedule(noVisibleChunkHeartbeatInitialDelayMs);

      return () => {
        stopped = true;
        clearHeartbeat();
      };
    },
  };

  return handlers;
}
