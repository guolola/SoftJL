// Verifies the drawer requests progress-only HTTP and SSE views before any content is downloaded.
import { expect, it, vi } from "vitest";
import { requestJson } from "../api-client";
import { streamProjectRunEvents } from "./run-subscriptions";
import { readRunTranscript, streamRunTranscript } from "./run-transcript";

vi.mock("../api-client", () => ({ requestJson: vi.fn() }));
vi.mock("./run-subscriptions", () => ({ streamProjectRunEvents: vi.fn() }));

it("uses the lightweight view for both restored and live task progress", async () => {
  const signal = new AbortController().signal;
  vi.mocked(requestJson).mockResolvedValue({ run: { status: "completed" }, events: [] });
  await readRunTranscript("project", "run", signal);
  expect(requestJson).toHaveBeenCalledWith("/api/projects/project/runs/run?includeEvents=true&view=progress", { signal });
  const onEvent = vi.fn();
  await streamRunTranscript("project", "run", "requirements", onEvent, signal);
  expect(streamProjectRunEvents).toHaveBeenCalledWith("/api/runs/run/events?view=progress", "project", onEvent, signal);
});

it.each([
  { type: "queued" },
  { type: "queued", eventId: "old-event" },
  { type: "queued", eventId: "old-event", createdAt: "invalid" },
  { type: "retired_event", eventId: "old-event", createdAt: "2026-10-18T00:00:00.000Z" },
])("rejects malformed recorded events without silently dropping them: %j", async event => {
  vi.mocked(requestJson).mockResolvedValue({ run: { status: "completed" }, events: [event] });
  await expect(readRunTranscript("project", "run", new AbortController().signal)).rejects.toThrow();
});
