// Verifies restoration, deduplication and task isolation at the subscription boundary.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunActivityEvent } from "@uml-platform/contracts";
import { readRunTranscript, streamRunTranscript } from "../../../services/workspace-repository/run-transcript";
import { useRunTranscript } from "./use-run-transcript";

vi.mock("../../../services/workspace-repository/run-transcript", () => ({ readRunTranscript: vi.fn(), streamRunTranscript: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
const event = (runId: string, eventId: string): RunActivityEvent => ({ type: "run_activity", runId, eventId, callId: "call", stage: "generate_models", phase: "started", createdAt: "2026-09-21T00:00:00.000Z", format: "technical" });

describe("restored task transcript", () => {
  it("merges persisted and live replay once", async () => {
    const first = event("a", "first");
    vi.mocked(readRunTranscript).mockResolvedValue({ events: [first], run: { status: "running", runKind: "requirements" } });
    vi.mocked(streamRunTranscript).mockImplementation(async (_project, _run, _kind, onEvent) => {
      onEvent(first); onEvent({ ...first, eventId: "output", phase: "output", text: "内容" });
      onEvent({ type: "cancelled", eventId: "end", message: "停止" });
    });
    const { result } = renderHook(() => useRunTranscript("project", "a", "requirements"));
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(JSON.stringify(result.current.events)).not.toContain("内容");
    expect(result.current.loading).toBe(false);
  });

  it("aborts the previous request and does not leak late responses across selected tasks", async () => {
    let resolveA!: (value: Awaited<ReturnType<typeof readRunTranscript>>) => void;
    let signalA!: AbortSignal;
    vi.mocked(readRunTranscript).mockImplementation(async (_project, runId, signal) => {
      if (runId === "a") { signalA = signal; return new Promise((resolve) => { resolveA = resolve; }); }
      return { events: [event("b", "b1")], run: { status: "completed", model: "deepseek-flash" } };
    });
    const { result, rerender } = renderHook(({ id }) => useRunTranscript("project", id, "requirements"), { initialProps: { id: "a" } });
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.events[0]?.eventId).toBe("b1"));
    await act(async () => resolveA({ events: [event("a", "a1")], run: { status: "completed", model: "old-model" } }));
    expect(signalA.aborted).toBe(true);
    expect(result.current.events.map((item) => item.eventId)).toEqual(["b1"]);
    expect(result.current.model).toBe("deepseek-flash");
  });

  it("reconnects after transport failure while retaining the existing conversation", async () => {
    vi.useFakeTimers();
    const first = event("a", "first");
    vi.mocked(readRunTranscript).mockResolvedValue({ events: [first], run: { status: "running", runKind: "requirements" } });
    vi.mocked(streamRunTranscript).mockRejectedValueOnce(new TypeError("network"))
      .mockImplementationOnce(async (_project, _run, _kind, onEvent) => { onEvent(first); onEvent({ type: "cancelled", eventId: "end", message: "停止" }); });
    const { result } = renderHook(() => useRunTranscript("project", "a", "requirements"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.disconnected).toBe(true);
    expect(result.current.events).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.events).toHaveLength(2);
    expect(result.current.disconnected).toBe(false);
  });
});
