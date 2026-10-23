// Verifies the current paired stage lifecycle and replayable run activity envelopes.
import assert from "node:assert/strict";
import test from "node:test";
import { runEventSchema } from "./runs.js";

test("stage boundaries use a start and explicit terminal status", () => {
  const start = { type: "stage_started", stage: "generate_models", eventId: "stage-start", createdAt: "2026-09-23T00:00:00.000Z" };
  assert.deepEqual(runEventSchema.parse(start), start);
  for (const status of ["completed", "failed", "cancelled", "pending_review"]) {
    const event = { type: "stage_finished", stage: "generate_models", status, eventId: "stage-boundary", createdAt: "2026-09-23T00:00:00.000Z" };
    assert.deepEqual(runEventSchema.parse(event), event);
  }
  assert.equal(runEventSchema.safeParse({ type: "stage_finished", stage: "generate_models", status: "running" }).success, false);
});

test("recorded events require their original identity and timestamp", () => {
  const event = { type: "queued", eventId: "queued-1", createdAt: "2026-09-23T00:00:00.000Z" };
  assert.deepEqual(runEventSchema.parse(event), event);
  for (const field of ["eventId", "createdAt"]) {
    const obsolete: Record<string, unknown> = { ...event };
    delete obsolete[field];
    assert.equal(runEventSchema.safeParse(obsolete).success, false);
    assert.equal(Object.hasOwn(obsolete, field), false);
  }
  for (const invalid of [{ eventId: "" }, { createdAt: "invalid" }, { createdAt: "2026-09-23" }]) {
    assert.equal(runEventSchema.safeParse({ ...event, ...invalid }).success, false);
  }
});

test("run activity supports reasoning content and thinking markers", () => {
  const base = { type: "run_activity", eventId: "event-1", createdAt: "2026-09-23T00:00:00.000Z", runId: "run-1", stage: "generate_models", callId: "call-1", format: "technical" };
  const reasoning = { ...base, phase: "reasoning", text: "先核对条件" };
  const thinking = { ...base, phase: "thinking" };
  assert.deepEqual(runEventSchema.parse(reasoning), reasoning);
  assert.deepEqual(runEventSchema.parse(thinking), thinking);
});
