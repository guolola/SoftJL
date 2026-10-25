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
  const compilation = { ...base, operation: "model_compile", phase: "failed" };
  assert.deepEqual(runEventSchema.parse(compilation), compilation);
});

test("tool receipts carry typed lifecycle and parent identity without argument contents", () => {
  const event = { type: "run_tool", eventId: "tool-event", createdAt: "2026-10-25T00:00:00Z", runId: "run", stage: "generate_models",
    callId: "provider-call", toolCallId: "tool-call", toolName: "validate_model", phase: "failed", errorCount: 2 };
  assert.deepEqual(runEventSchema.parse(event), event);
  for (const invalid of [{ toolName: "arbitrary_tool" }, { callId: "" }, { errorCount: -1 }]) {
    assert.equal(runEventSchema.safeParse({ ...event, ...invalid }).success, false);
  }
  assert.deepEqual(runEventSchema.parse({ ...event, arguments: "private-model", result: "private-errors" }), event);
  for (const toolName of ["get_upstream_artifact", "validate_model", "validate_requirement_rules", "submit_requirement_rules"]) {
    assert.equal(runEventSchema.safeParse({ ...event, toolName }).success, true);
  }
  const source = { sourceType: "requirement_source", sourceId: "requirements:source", label: "需求原文与附件转录" };
  assert.deepEqual(runEventSchema.parse({ ...event, source, warningCount: 1 }), { ...event, source, warningCount: 1 });
});
