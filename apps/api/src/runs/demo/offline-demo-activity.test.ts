// Validates timed demo events, parallel attribution, recovery and cancellation without provider calls.
import assert from "node:assert/strict";
import test from "node:test";
import { runEventSchema, startRunRequestSchema, type RunActivityEvent } from "@uml-platform/contracts";
import { createEmptySnapshot, createEmptyDocumentSnapshot } from "../records/snapshots.js";
import { createRunRecordStore, emitEvent, serializeRunRecordStore, type RunRecord } from "../records/run-record-store.js";
import { emitOfflineDemoActivity } from "./offline-demo-activity.js";
import { completeOfflineDemoDesignRun, completeOfflineDemoRequirementRun, createOfflineDemoDocumentInput } from "./offline-demo-runs.js";
import { fallbackDocumentSections } from "../../documents/context/document-context.js";
import { startDocumentRunRequestSchema } from "@uml-platform/contracts";

function record(): RunRecord {
  return { snapshot: createEmptySnapshot("demo-test", "演示需求", ["usecase", "activity"]), events: [], listeners: new Set(), terminal: false };
}
function activities(run: RunRecord) { return run.events.filter((e): e is RunActivityEvent => e.type === "run_activity"); }

test("demo generation preserves ordinary output and labels fixture reasoning for visual checks", async (t) => {
  const previous = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = "0";
  t.after(() => { if (previous === undefined) delete process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS; else process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = previous; });
  const run = record();
  await completeOfflineDemoRequirementRun(run, startRunRequestSchema.parse({ requirementText: "演示需求", selectedDiagrams: ["usecase", "activity"] }));
  const events = activities(run);
  assert.ok(events.every((event) => runEventSchema.safeParse(event).success));
  assert.equal(new Set(events.map((e) => e.eventId)).size, events.length);
  const models = events.filter((e) => e.stage === "generate_models");
  assert.ok(new Set(models.map((e) => e.subtaskId)).size >= 2);
  assert.equal(models[0].phase, "started");
  assert.equal(models[1].phase, "started");
  for (const id of new Set(events.map((e) => e.callId))) {
    const call = events.filter((e) => e.callId === id);
    assert.equal(call[0].phase, "started");
    assert.ok(call.filter((e) => e.phase === "output").length > 1);
    if (call[0].stage === "verify_diagram_visual") {
      assert.ok(call.filter((event) => event.phase === "reasoning").map((event) => event.text).join("").startsWith("演示推理片段："));
    } else assert.ok(call.every((event) => !["thinking", "reasoning", "summary"].includes(event.phase)));
    assert.equal(call.at(-1)?.phase, "completed");
  }
  const store = createRunRecordStore(); store.set(run.snapshot.runId, run);
  assert.deepEqual(createRunRecordStore(serializeRunRecordStore(store)).get(run.snapshot.runId)?.events, run.events);
  if (!("visualReviews" in run.snapshot)) throw new Error("fixture");
  const review = run.snapshot.visualReviews.activity;
  assert.equal(review.attempts, 2); assert.equal(review.repairAttempts, 1);
  assert.equal(review.repairHistory?.[0].status, "accepted");
  const checks = events.filter((event) => event.modelId === "activity" && event.operation === "visual_check" && event.phase === "started");
  assert.equal(checks.length, 2); assert.notEqual(checks[0].inputImages?.[0].url, checks[1].inputImages?.[0].url);
  assert.equal(review.repairHistory?.[0].callId, events.find((event) => event.operation === "render_repair" && event.phase === "started")?.callId);
  assert.equal(run.snapshot.visualReviews.usecase.checkOutcome, "differences");
  assert.equal(run.snapshot.visualReviews.usecase.repairAttempts, 1);
  assert.equal(run.snapshot.visualReviews.usecase.repairHistory?.[0].status, "rejected");
  assert.deepEqual(run.snapshot.visualReviews.usecase.findings?.map((finding) => finding.category), ["model_structure", "business_constraint", "render_mismatch"]);
  assert.match(run.snapshot.visualReviews.usecase.stopReason!, /证据不足/);
});

test("design demo shows FK structure correction with independently attributed calls and counters", async (t) => {
  const previous = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = "0";
  t.after(() => { if (previous === undefined) delete process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS; else process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = previous; });
  const run = record();
  await completeOfflineDemoDesignRun(run, { selectedDiagrams: ["table", "sequence"] } as Parameters<typeof completeOfflineDemoDesignRun>[1]);
  if (!("visualReviews" in run.snapshot)) throw new Error("fixture");
  const review = run.snapshot.visualReviews["table:seat-reservation-db"];
  assert.equal(review.status, "passed"); assert.equal(review.structureAttempts, 2); assert.equal(review.attempts, 1);
  assert.equal(review.repairAttempts, 1); assert.match(review.repairHistory?.[0].changes.join("") ?? "", /外键标记/);
  const events = activities(run).filter((event) => event.modelId === "table:seat-reservation-db" && event.phase === "started");
  assert.deepEqual(events.map((event) => event.operation), ["structure_check", "model_repair", "structure_check", "visual_check"]);
  assert.equal(new Set(events.map((event) => event.callId)).size, 4);
  assert.ok(run.events.every((event) => runEventSchema.safeParse(event).success));
  const incomplete = run.snapshot.visualReviews["sequence:uc-submit-reservation"];
  assert.equal(incomplete.checkOutcome, "not_completed");
  assert.deepEqual(incomplete.findings?.map((finding) => finding.category), ["check_execution", "other"]);
  assert.equal(incomplete.repairAttempts, 0);
});

test("demo rule and model snapshots retain the submitted requirement text", async (t) => {
  const previous = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = "0";
  t.after(() => { if (previous === undefined) delete process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS; else process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = previous; });

  for (const selectedDiagrams of [[], ["usecase"]] as const) {
    const run = record();
    const requirementText = `本次提交的需求 ${selectedDiagrams.length}`;
    await completeOfflineDemoRequirementRun(run, startRunRequestSchema.parse({ requirementText, selectedDiagrams: [...selectedDiagrams] }));
    assert.equal(run.snapshot.requirementText, requirementText);
    assert.equal(run.snapshot.status, "completed");
  }
});

test("default demo pacing waits before output and stops promptly when cancelled", async (t) => {
  const previous = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  delete process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  t.after(() => { if (previous !== undefined) process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = previous; });
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const run = record();
  const done = emitOfflineDemoActivity(run, "extract_rules");
  const rejected = assert.rejects(done, { name: "RunCancelledError" });
  assert.deepEqual(activities(run).map((e) => e.phase), ["started"]);
  for (let i = 0; i < 7; i++) { t.mock.timers.tick(100); await new Promise<void>((resolve) => setImmediate(resolve)); }
  assert.deepEqual(activities(run).map((e) => e.phase), ["started"]);
  emitEvent(run, { type: "cancelled", stage: "extract_rules", message: "已停止" });
  const count = run.events.length;
  t.mock.timers.tick(100);
  await rejected;
  assert.equal(run.events.length, count);
  assert.equal(run.events.at(-1)?.type, "cancelled");
});

test("demo document output comes from the prepared document sections", async (t) => {
  const previous = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = "0";
  t.after(() => { if (previous === undefined) delete process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS; else process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = previous; });
  const input = createOfflineDemoDocumentInput(startDocumentRunRequestSchema.parse({ documentKind: "requirementsSpec", requirementText: "演示需求" }));
  const snapshot = createEmptyDocumentSnapshot("demo-document", input);
  snapshot.sections = fallbackDocumentSections(input);
  const run: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
  await emitOfflineDemoActivity(run, "generate_document_text");
  const text = activities(run).filter((e) => e.phase === "output").map((e) => e.text).join("");
  assert.ok(text.includes(snapshot.sections[0].title));
  assert.ok(activities(run).every((e) => !["thinking", "reasoning", "summary"].includes(e.phase)));
});
