// Regresses large replay deduplication, terminal boundaries and progress-only local task projection.
import { expect, it } from "vitest";
import type { RunEventInput, RunActivityEvent } from "@uml-platform/contracts";
import { mergeTranscriptEvents, progressTranscriptEvents, createProgressTranscriptAccumulator } from "./run-transcript";

it("merges a large replay once, keeps input immutable and stops at its terminal event", () => {
  const events: RunEventInput[] = [{ type: "stage_started", eventId: "start", stage: "generate_models" }];
  const incoming: RunEventInput[] = Array.from({ length: 30000 }, (_, index) => ({ type: "stage_progress", eventId: `progress-${index}`, stage: "generate_models", progress: 0 }));
  const merged = mergeTranscriptEvents(events, [...events, ...incoming, ...incoming, { type: "cancelled", eventId: "end", message: "停止" }, { type: "stage_started", eventId: "late", stage: "render_svg" }]);
  expect(merged).toHaveLength(30002); expect(events).toHaveLength(1);
  expect(merged.at(-1)?.eventId).toBe("end"); expect(mergeTranscriptEvents(merged, incoming)).toBe(merged);
});

it("keeps local progress without provider text or input-image bodies", () => {
  const call: RunActivityEvent = { type: "run_activity", eventId: "started", runId: "run", callId: "call", stage: "generate_models", createdAt: "2026-10-12T00:00:00Z", format: "technical", phase: "started", inputImages: [{ url: "data:image/png;base64,xxx" }] };
  const events: RunEventInput[] = [call, { ...call, phase: "reasoning", text: "长思考" }, { ...call, phase: "output", text: "正文" }, { ...call, phase: "completed" }];
  expect(progressTranscriptEvents(events)).toHaveLength(2);
  expect(JSON.stringify(progressTranscriptEvents(events))).not.toMatch(/data:image|长思考|正文/);
  expect(call.inputImages).toHaveLength(1);
});

it("incrementally restores 30,000 text events without retaining bodies or replaying known progress", () => {
  const append = createProgressTranscriptAccumulator();
  const call: RunActivityEvent = { type: "run_activity", eventId: "start", runId: "run", callId: "call", stage: "generate_models", createdAt: "2026-10-12T00:00:00Z", format: "technical", phase: "started" };
  expect(append([call])).toHaveLength(1);
  for (let index = 0; index < 30000; index += 100) {
    expect(append(Array.from({ length: 100 }, (_, offset) => ({ ...call, eventId: `body-${index + offset}`, phase: "output", text: "正文".repeat(500) })))).toBeNull();
  }
  expect(append([call])).toBeNull();
  expect(append([{ type: "cancelled", eventId: "done", message: "已取消" }])).toHaveLength(2);
  expect(append([{ ...call, eventId: "late" }])).toBeNull();
});
