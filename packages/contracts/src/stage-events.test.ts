// Protects legacy event parsing and durable stage boundaries across replay and SSE.
import assert from "node:assert/strict";
import test from "node:test";
import { runEventSchema } from "./runs.js";

test("stage completion is additive and preserves the existing event envelope", () => {
  const oldStart = { type: "stage_started", stage: "generate_models" };
  assert.deepEqual(runEventSchema.parse(oldStart), oldStart);
  const trackedStart = { ...oldStart, tracksCompletion: true };
  assert.deepEqual(runEventSchema.parse(trackedStart), trackedStart);
  for (const status of ["completed", "failed", "cancelled", "pending_review"]) {
    const event = { type: "stage_finished", stage: "generate_models", status, eventId: "stage-boundary", createdAt: "2026-09-23T00:00:00.000Z" };
    assert.deepEqual(runEventSchema.parse(event), event);
  }
  assert.equal(runEventSchema.safeParse({ type: "stage_finished", stage: "generate_models", status: "running" }).success, false);
});

test("run activity accepts replayable reasoning text without changing older events", () => {
  const base = { type: "run_activity", eventId: "event-1", createdAt: "2026-09-23T00:00:00.000Z", runId: "run-1", stage: "generate_models", callId: "call-1", format: "technical" };
  const reasoning = { ...base, phase: "reasoning", text: "先核对条件" };
  const historical = { ...base, phase: "thinking" };
  assert.deepEqual(runEventSchema.parse(reasoning), reasoning);
  assert.deepEqual(runEventSchema.parse(historical), historical);
});
