// Regresses reasoning-only progress, genuine silence and the total runtime limit using deterministic time.
import test from "node:test";
import assert from "node:assert/strict";
import { createEmptySnapshot } from "../../records/snapshots.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { createRunLlmChunkHandlers } from "./llm-chunk-events.js";
import { withModelTaskTimeout } from "./model-task-timeout.js";

test("meaningful reasoning and summaries prevent false idle expiry while waiting for the final JSON", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"] });
  const record: RunRecord = { snapshot: createEmptySnapshot("reasoning", "需求", ["usecase"]), events: [], listeners: new Set(), terminal: false };
  let handlers!: ReturnType<typeof createRunLlmChunkHandlers>, finish!: (value: string) => void;
  const task = withModelTaskTimeout((active, blank) => {
    handlers = createRunLlmChunkHandlers({ record, stage: "verify_diagram_visual", onActivity: active, onBlankActivity: blank });
    return new Promise<string>((resolve) => { finish = resolve; });
  }, { label: "结构核对", idleTimeoutMs: 100, maxRuntimeMs: 1000 });
  await Promise.resolve();
  for (let i = 0; i < 6; i++) { t.mock.timers.tick(80); handlers.onReasoningChunk?.("持续核对来源"); }
  t.mock.timers.tick(80); handlers.onReasoningSummary?.("核对即将完成");
  t.mock.timers.tick(80); handlers.onChunk('{"passed":true}'); handlers.onComplete?.(); finish("done");
  assert.equal(await task, "done");
});

test("blank reasoning still expires and continuous meaningful reasoning cannot bypass maximum runtime", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"] });
  for (const meaningful of [false, true]) {
    const record: RunRecord = { snapshot: createEmptySnapshot(`limit-${meaningful}`, "需求", []), events: [], listeners: new Set(), terminal: false };
    let handlers!: ReturnType<typeof createRunLlmChunkHandlers>, signal!: AbortSignal;
    const task = withModelTaskTimeout((active, blank, abortSignal) => {
      signal = abortSignal; handlers = createRunLlmChunkHandlers({ record, stage: "verify_diagram_visual", onActivity: active, onBlankActivity: blank });
      return new Promise(() => {});
    }, { label: "结构核对", idleTimeoutMs: 100, maxRuntimeMs: 300 });
    const rejected = assert.rejects(task, meaningful ? /最大运行时长/ : /空白输出/);
    await Promise.resolve();
    for (let i = 0; i < 6; i++) { handlers.onReasoningChunk?.(meaningful ? "继续分析" : "   "); t.mock.timers.tick(50); }
    await rejected; assert.equal(signal.aborted, true); handlers.onError?.();
  }
});
