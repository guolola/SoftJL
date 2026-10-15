// Verifies durable stream batching, parallel attribution, cancellation flush and public reasoning summaries.
import assert from "node:assert/strict";
import test from "node:test";
import { runEventSchema, type RunActivityEvent } from "@uml-platform/contracts";
import { createEmptySnapshot } from "../../records/snapshots.js";
import { createRunRecordStore, emitEvent, serializeRunRecordStore, type RunRecord } from "../../records/run-record-store.js";
import { createRunLlmChunkHandlers } from "./llm-chunk-events.js";
import { collectTextResult } from "./structured-output.js";

function record(): RunRecord {
  return { snapshot: createEmptySnapshot("run-activity", "需求", ["usecase"]), events: [], listeners: new Set(), terminal: false };
}
function activity(record: RunRecord) {
  return record.events.filter((event): event is RunActivityEvent => event.type === "run_activity");
}

test("parallel calls retain identities, batch output and replay exactly after serialization", () => {
  const run = record();
  const a = createRunLlmChunkHandlers({ record: run, stage: "generate_models", subtaskId: "usecase" });
  const b = createRunLlmChunkHandlers({ record: run, stage: "generate_models", subtaskId: "activity" });
  a.onStart?.(); b.onStart?.();
  a.onChunk("用例"); b.onChunk("活动"); a.onChunk("图");
  a.onComplete?.(); b.onComplete?.();
  const events = activity(run);
  assert.equal(events.filter((event) => event.phase === "output").length, 2);
  assert.equal(events.find((event) => event.phase === "output" && event.subtaskId === "usecase")?.text, "用例图");
  assert.equal(new Set(events.map((event) => event.callId)).size, 2);
  assert.equal(new Set(events.map((event) => event.eventId)).size, events.length);
  events.forEach((event) => assert.equal(runEventSchema.safeParse(event).success, true));
  const store = createRunRecordStore(); store.set(run.snapshot.runId, run);
  const restored = createRunRecordStore(serializeRunRecordStore(store)).get(run.snapshot.runId)!;
  assert.deepEqual(restored.events, run.events);
});

test("cancellation flushes pending text before terminal and rejects subsequent chunks", () => {
  const run = record();
  const sink = createRunLlmChunkHandlers({ record: run, stage: "generate_models" });
  sink.onChunk("已到达的内容");
  emitEvent(run, { type: "cancelled", stage: "generate_models", message: "已取消" });
  sink.onChunk("迟到内容"); sink.onComplete?.();
  assert.equal(activity(run).filter((event) => event.phase === "output").map((event) => event.text).join(""), "已到达的内容");
  assert.equal(run.events.at(-1)?.type, "cancelled");
});

test("transport reasoning, summaries, and answer text remain distinct and ordered", async () => {
  const run = record();
  const sink = createRunLlmChunkHandlers({ record: run, stage: "generate_document_text" });
  const content = await collectTextResult({ async *streamChatCompletion(input) {
    input.onReasoningChunk?.("先核对"); input.onReasoningChunk?.("来源。");
    input.onReasoningSummary?.("正在核对来源。");
    yield "正文";
  } }, { baseUrl: "https://example.com", apiKey: "test", model: "test" }, [], sink);
  assert.equal(content, "正文");
  assert.equal(activity(run).filter((event) => event.phase === "thinking").length, 1);
  assert.equal(activity(run).find((event) => event.phase === "reasoning")?.text, "先核对来源。");
  assert.equal(activity(run).find((event) => event.phase === "summary")?.text, "正在核对来源。");
  assert.deepEqual(activity(run).map((event) => event.phase), ["started", "thinking", "reasoning", "summary", "output", "completed"]);
  assert.equal(activity(run).at(-1)?.phase, "completed");
});

test("records input images once with the consuming call and restores the same images", async () => {
  const run = record();
  const url = "data:image/png;base64,cG5n";
  await collectTextResult({ async *streamChatCompletion() { yield "图面检查结果"; } },
    { apiBaseUrl: "https://example.com", apiKey: "test", model: "test" }, [
      { role: "user", content: [{ type: "text", text: "核对环境图" }, { type: "image_url", image_url: { url } }, { type: "image_url", image_url: { url } }] },
    ], createRunLlmChunkHandlers({ record: run, stage: "verify_diagram_visual", subtaskId: "context", subtaskLabel: "系统环境图" }));
  const events = activity(run);
  assert.deepEqual(events[0].inputImages, [{ url, caption: "系统环境图使用的图片 1" }]);
  assert.equal(events.filter((event) => event.inputImages?.length).length, 1);
  assert.equal(new Set(events.map((event) => event.callId)).size, 1);
  events.forEach((event) => assert.equal(runEventSchema.safeParse(event).success, true));
  const store = createRunRecordStore(); store.set(run.snapshot.runId, run);
  assert.deepEqual(createRunRecordStore(serializeRunRecordStore(store)).get(run.snapshot.runId)!.events, run.events);
});

test("interleaved parallel reasoning stays attached to each model call", () => {
  const run = record();
  const first = createRunLlmChunkHandlers({ record: run, stage: "generate_models", subtaskId: "usecase" });
  const second = createRunLlmChunkHandlers({ record: run, stage: "generate_models", subtaskId: "activity" });
  first.onReasoningChunk?.("分析用例");
  second.onReasoningChunk?.("分析活动");
  first.onChunk("用例答案");
  second.onChunk("活动答案");
  first.onComplete?.(); second.onComplete?.();
  const bySubtask = (id: string) => activity(run).filter((event) => event.subtaskId === id);
  for (const [id, thought, answer] of [["usecase", "分析用例", "用例答案"], ["activity", "分析活动", "活动答案"]]) {
    const events = bySubtask(id);
    assert.equal(new Set(events.map((event) => event.callId)).size, 1);
    assert.equal(events.find((event) => event.phase === "reasoning")?.text, thought);
    assert.equal(events.find((event) => event.phase === "output")?.text, answer);
  }
});

test("cancellation flushes reasoning before terminal and replay retains it", () => {
  const run = record();
  const sink = createRunLlmChunkHandlers({ record: run, stage: "generate_models" });
  sink.onReasoningChunk?.("正在比较两个模型");
  emitEvent(run, { type: "cancelled", stage: "generate_models", message: "已取消" });
  sink.onReasoningChunk?.("迟到的推理");
  assert.equal(activity(run).find((event) => event.phase === "reasoning")?.text, "正在比较两个模型");
  assert.equal(run.events.at(-1)?.type, "cancelled");
  const store = createRunRecordStore(); store.set(run.snapshot.runId, run);
  const restored = createRunRecordStore(serializeRunRecordStore(store)).get(run.snapshot.runId)!;
  assert.deepEqual(restored.events, run.events);
});

test("failed calls flush text and a retry uses a different identity", async () => {
  const run = record();
  await assert.rejects(() => collectTextResult({ async *streamChatCompletion(input) { input.onReasoningChunk?.("未完成的分析"); yield "部分结果"; throw new Error("offline"); } },
    { baseUrl: "https://example.com", apiKey: "test", model: "test" }, [], createRunLlmChunkHandlers({ record: run, stage: "generate_models" })));
  const retry = createRunLlmChunkHandlers({ record: run, stage: "generate_models" });
  retry.onStart?.(); retry.onComplete?.();
  assert.equal(new Set(activity(run).map((event) => event.callId)).size, 2);
  assert.equal(activity(run).find((event) => event.phase === "reasoning")?.text, "未完成的分析");
  assert.ok(activity(run).some((event) => event.phase === "failed"));
});
