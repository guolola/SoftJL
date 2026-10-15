// Verifies stage boundaries across parallel work, retry passes and terminal stream flushing.
import assert from "node:assert/strict";
import test from "node:test";
import { runEventSchema } from "@uml-platform/contracts";
import { createEmptySnapshot } from "../../records/snapshots.js";
import { emitEvent, type RunRecord } from "../../records/run-record-store.js";
import { createRunLlmChunkHandlers } from "./llm-chunk-events.js";
import { createStageLifecycle } from "./stage-lifecycle.js";

const record = (): RunRecord => ({ snapshot: createEmptySnapshot("stage-test", "需求", ["usecase"]), events: [], listeners: new Set(), terminal: false });

test("parallel calls and retries do not close a stage; the pipeline closes it once", () => {
  const run = record();
  const lifecycle = createStageLifecycle(run);
  lifecycle.advance("generate_models");
  emitEvent(run, { type: "stage_started", stage: "generate_models", tracksCompletion: true });
  const a = createRunLlmChunkHandlers({ record: run, stage: "generate_models", subtaskId: "usecase" });
  const b = createRunLlmChunkHandlers({ record: run, stage: "generate_models", subtaskId: "activity" });
  a.onStart?.(); b.onStart?.(); a.onComplete?.();
  emitEvent(run, { type: "stage_progress", stage: "generate_models", progress: 50, subtaskId: "usecase", subtaskStatus: "failed" });
  emitEvent(run, { type: "stage_progress", stage: "generate_models", progress: 50, subtaskId: "usecase", subtaskStatus: "repairing" });
  b.onComplete?.();
  assert.equal(run.events.some((event) => event.type === "stage_finished"), false);
  lifecycle.finish("generate_models"); lifecycle.finish("generate_models");
  // A late informational artifact cannot reopen an already settled stage.
  emitEvent(run, { type: "artifact_ready", stage: "generate_models", artifactKind: "model" });
  emitEvent(run, { type: "completed", snapshot: run.snapshot });
  const finished = run.events.filter((event) => event.type === "stage_finished");
  assert.equal(finished.length, 1);
  assert.equal(finished[0].status, "completed");
  assert.ok(finished[0].eventId && finished[0].createdAt);
  assert.ok(runEventSchema.safeParse(finished[0]).success);
});

test("advancing closes the prior pass and preserves partial failure and review outcomes", () => {
  const run = record();
  const lifecycle = createStageLifecycle(run);
  for (const [stage, status] of [["generate_models", "failed"], ["generate_plantuml", "completed"], ["render_svg", "pending_review"]] as const) {
    lifecycle.advance(stage);
    emitEvent(run, { type: "stage_started", stage, tracksCompletion: true });
    emitEvent(run, { type: "stage_progress", stage, progress: 80, subtaskId: "audit", subtaskStatus: status });
  }
  emitEvent(run, { type: "completed", snapshot: run.snapshot });
  assert.deepEqual(run.events.filter((event) => event.type === "stage_finished").map((event) => [event.stage, event.status]), [
    ["generate_models", "failed"], ["generate_plantuml", "completed"], ["render_svg", "pending_review"],
  ]);
});

for (const type of ["cancelled", "failed"] as const) test(`${type} flushes buffered output before stage boundaries and SSE terminal`, () => {
  const run = record();
  createStageLifecycle(run);
  const sink = createRunLlmChunkHandlers({ record: run, stage: "generate_document_text" });
  sink.onChunk("已经收到的正文");
  emitEvent(run, type === "cancelled" ? { type, message: "停止" } : { type, error: { code: "RUN_LEGACY_FAILURE", message: "失败", retryable: false } });
  assert.deepEqual(run.events.slice(-3).map((event) => event.type), ["run_activity", "stage_finished", type]);
  const stage = run.events.at(-2);
  assert.equal(stage?.type === "stage_finished" && stage.status, type);
  sink.onChunk("迟到内容"); sink.onComplete?.();
  assert.equal(run.events.at(-1)?.type, type);
  assert.equal(run.listeners.size, 0);
});
