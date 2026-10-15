// Covers run-event to diagnostics helpers outside the session Provider.
import { describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@uml-platform/contracts";
import {
  appendDiagnosticStream,
  createEmptyDiagnostics,
  deriveRunDiagnosticsFromEvent,
  getProgressFromEvent,
  isMeaningfulLlmChunkEvent,
  summarizeEvent,
} from "./diagnostics";

describe("workspace-session diagnostics helpers", () => {
  it("creates an empty diagnostics object for a new run", () => {
    expect(createEmptyDiagnostics()).toMatchObject({
      runKind: null,
      runId: null,
      streamText: "",
      chunkCount: 0,
      events: [],
    });
  });

  it("keeps only the newest diagnostic stream content", () => {
    const next = appendDiagnosticStream("x".repeat(29_999), "TAIL");
    expect(next).toHaveLength(30_000);
    expect(next.endsWith("TAIL")).toBe(true);
  });

  it("summarizes terminal and progress events with stable labels", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    const progress = summarizeEvent({
      type: "stage_progress",
      stage: "generate_models",
      progress: 65,
      message: "generate_models ready",
    });
    expect(progress.label).toBe("阶段进度");
    expect(progress.detail).toContain("生成需求模型");

    const failed = summarizeEvent({
      type: "failed",
      error: {
        code: "RUN_INTERNAL_ERROR",
        message: "boom",
        category: "internal",
        retryable: false,
      },
    } satisfies RunEvent);
    expect(failed.label).toBe("任务失败");

    const cancelled = summarizeEvent({
      type: "cancelled",
      message: "任务已取消",
    } satisfies RunEvent);
    expect(cancelled.label).toBe("任务已取消");
    expect(cancelled.detail).toBe("任务已取消");
  });

  it("does not label blank model stream chunks as regular model output", () => {
    const blankEvent = {
      type: "llm_chunk",
      stage: "generate_models",
      chunk: "   \n",
    } satisfies RunEvent;

    expect(isMeaningfulLlmChunkEvent(blankEvent)).toBe(false);
    const summary = summarizeEvent(blankEvent);

    expect(summary.label).toBe("收到空白片段");
    expect(summary.detail).toContain("等待有效模型输出");
  });

  it("keeps model stream chunks out of recent diagnostic events", () => {
    const diagnostics = createEmptyDiagnostics();
    const chunkEvent = {
      type: "llm_chunk",
      stage: "extract_rules",
      chunk: "正在分析需求文本",
    } satisfies RunEvent;
    const progressEvent = {
      type: "stage_progress",
      stage: "extract_rules",
      progress: 20,
      message: "正在抽取需求规则",
    } satisfies RunEvent;

    const afterChunk = deriveRunDiagnosticsFromEvent(
      diagnostics,
      chunkEvent,
      summarizeEvent(chunkEvent),
    );
    const afterProgress = deriveRunDiagnosticsFromEvent(
      afterChunk,
      progressEvent,
      summarizeEvent(progressEvent),
    );

    expect(afterChunk.streamText).toBe("正在分析需求文本");
    expect(afterChunk.chunkCount).toBe(1);
    expect(afterChunk.events).toEqual([]);
    expect(afterProgress.events.at(-1)?.label).toBe("阶段进度");
  });

  it("retains stage boundaries for replay without duplicate diagnostic notices or progress resets", () => {
    const event: RunEvent = { type: "stage_finished", stage: "generate_models", status: "completed", eventId: "stage-end", createdAt: "2026-09-23T00:00:00.000Z" };
    const next = deriveRunDiagnosticsFromEvent(createEmptyDiagnostics(), event, summarizeEvent(event));
    expect(next.transcript).toEqual([event]);
    expect(next.events).toEqual([]);
    expect(getProgressFromEvent(event)).toBeNull();
    expect(next.finishedAt).toBeNull();
  });

  it("maps run event progress without changing SSE event shape", () => {
    expect(getProgressFromEvent({ type: "queued" })).toBe(5);
    expect(
      getProgressFromEvent({
        type: "stage_started",
        stage: "generate_models",
      }),
    ).toBe(65);
    expect(
      getProgressFromEvent({
        type: "stage_progress",
        stage: "generate_models",
        progress: 81,
      }),
    ).toBe(81);
    expect(getProgressFromEvent({ type: "completed", snapshot: {} as never })).toBe(100);
    expect(getProgressFromEvent({ type: "cancelled", message: "任务已取消" })).toBe(100);
  });
});
