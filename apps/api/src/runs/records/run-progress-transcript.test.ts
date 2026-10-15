// Ensures progress responses remain small without changing saved transcripts or completed result metadata.
import test from "node:test";
import assert from "node:assert/strict";
import { runEventSchema, type RunEvent } from "@uml-platform/contracts";
import { createEmptySnapshot, createEmptyDocumentSnapshot } from "./snapshots.js";
import { projectRunProgressEvents } from "./run-progress-transcript.js";

test("a 30,000-chunk history transfers only lifecycle events while the full record remains intact", () => {
  const started: RunEvent = { type: "run_activity", runId: "run", callId: "call", eventId: "start", createdAt: "2026-10-12T00:00:00Z", stage: "generate_models", phase: "started", format: "technical", inputImages: [{ url: "data:image/png;base64," + "x".repeat(100000) }] };
  const snapshot = createEmptySnapshot("run", "需求正文".repeat(10000), ["usecase"]); snapshot.status = "completed";
  const content: RunEvent[] = Array.from({ length: 30000 }, (_, index) => ({ ...started, eventId: `chunk-${index}`, inputImages: undefined, phase: "reasoning", text: "思考正文".repeat(30) }));
  const events: RunEvent[] = [started, ...content, { ...started, eventId: "done", inputImages: undefined, phase: "completed" }, { type: "completed", eventId: "terminal", snapshot }];
  const projected = projectRunProgressEvents(events);
  assert.equal(projected.length, 3); assert.ok(JSON.stringify(projected).length < 5000);
  projected.forEach((event) => assert.equal(runEventSchema.safeParse(event).success, true));
  assert.equal(JSON.stringify(projected).includes("思考正文"), false); assert.equal(JSON.stringify(projected).includes("data:image"), false);
  assert.equal(content[0]?.type === "run_activity" && content[0].text?.includes("思考正文"), true);
  assert.ok(snapshot.requirementText.length > 10000);
});

test("document completion preserves download metadata without its body", () => {
  const snapshot = createEmptyDocumentSnapshot("doc", { documentKind: "requirementsSpec", requirementText: "完整需求" });
  snapshot.status = "completed"; snapshot.documentId = "document"; snapshot.byteLength = 123;
  snapshot.sections = [{ title: "正文", body: ["长正文".repeat(10000)] } as never];
  const [event] = projectRunProgressEvents([{ type: "completed", snapshot }]);
  assert.ok(event?.type === "completed" && "documentKind" in event.snapshot);
  assert.equal(event.snapshot.documentId, "document"); assert.equal(event.snapshot.byteLength, 123); assert.deepEqual(event.snapshot.sections, []);
  assert.equal(runEventSchema.safeParse(event).success, true); assert.equal(snapshot.sections.length, 1);
});
