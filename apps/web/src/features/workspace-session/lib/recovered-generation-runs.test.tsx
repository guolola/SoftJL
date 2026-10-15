// Verifies recovered subscriptions stop on navigation and reject late partial snapshots.
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RunEvent, RunSnapshot } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import type { RunSubscriptionOptions } from "../../../services/workspace-repository/types";
import { createRunSnapshot } from "../../../test/workspace-test-utils";
import { useRecoveredGenerationRuns } from "./recovered-generation-runs";
import { createGenerationTask } from "./generation-tasks";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function recoveryInput(repository: WorkspaceRepository) {
  return {
    initialized: true, repository,
    runs: [{ runId: "recovered-run", status: "running", runKind: "requirements" }],
    getTasks: () => [], recoverTask: vi.fn(() => "recovered:recovered-run"),
    onEvent: vi.fn(), onSnapshot: vi.fn(),
  };
}

describe("recovered generation runs", () => {
  it.each([undefined, createRunSnapshot({ runId: "different-run" })])("ignores unavailable or mismatched initial snapshots", async (snapshot) => {
    const subscribeToRun = vi.fn(async () => {});
    const input = recoveryInput({ getRunSnapshot: vi.fn(async () => snapshot), subscribeToRun } as unknown as WorkspaceRepository);
    const { unmount } = renderHook(() => useRecoveredGenerationRuns(input));
    await waitFor(() => expect(subscribeToRun).toHaveBeenCalledTimes(1));
    expect(input.onSnapshot).not.toHaveBeenCalled();
    unmount();
  });

  it("does not create another subscription for a locally observed run", () => {
    const subscribeToRun = vi.fn();
    const task = { ...createGenerationTask({ clientTaskId: "local-task", kind: "requirements", title: "需求生成",
      providerModel: null, startedAt: "2026-10-10T00:00:00.000Z", message: "运行中" }), runId: "recovered-run" };
    const input = { ...recoveryInput({ subscribeToRun } as unknown as WorkspaceRepository), getTasks: () => [task] };
    renderHook(() => useRecoveredGenerationRuns(input));
    expect(input.recoverTask).not.toHaveBeenCalled();
    expect(subscribeToRun).not.toHaveBeenCalled();
  });

  it("does not let an in-flight partial read replace the completed snapshot", async () => {
    const initial = createRunSnapshot({ runId: "recovered-run", status: "running" });
    const pending = deferred<RunSnapshot>();
    const completed = { ...initial, status: "completed" as const };
    const getRunSnapshot = vi.fn().mockResolvedValueOnce(initial).mockReturnValueOnce(pending.promise);
    let onEvent!: (event: RunEvent) => void;
    let signal: AbortSignal | undefined;
    const subscribeToRun = vi.fn(async (_runId: string, listener: (event: RunEvent) => void, options?: RunSubscriptionOptions<RunSnapshot>) => {
      onEvent = listener;
      signal = options?.signal;
      await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
    });
    const input = recoveryInput({ getRunSnapshot, subscribeToRun } as unknown as WorkspaceRepository);
    const { unmount } = renderHook(() => useRecoveredGenerationRuns(input));
    await waitFor(() => expect(subscribeToRun).toHaveBeenCalledTimes(1));
    act(() => onEvent({ type: "artifact_ready", stage: "render_svg", artifactKind: "svg", diagramKind: "usecase" }));
    await waitFor(() => expect(getRunSnapshot).toHaveBeenCalledTimes(2));
    act(() => onEvent({ type: "completed", snapshot: completed }));
    await act(async () => pending.resolve(initial));
    expect(input.onSnapshot.mock.calls.map((call) => call[1])).toEqual([initial, completed]);
    expect(signal?.aborted).toBe(true);
    unmount();
  });

  it("stops recovery if the page leaves before its first snapshot loads", async () => {
    const pending = deferred<RunSnapshot>();
    const subscribeToRun = vi.fn();
    const input = recoveryInput({ getRunSnapshot: vi.fn(() => pending.promise), subscribeToRun } as unknown as WorkspaceRepository);
    const { unmount } = renderHook(() => useRecoveredGenerationRuns(input));
    unmount();
    await act(async () => pending.resolve(createRunSnapshot()));
    expect(input.onSnapshot).not.toHaveBeenCalled();
    expect(subscribeToRun).not.toHaveBeenCalled();
  });

  it("applies a polling snapshot immediately even while an older event refresh is pending", async () => {
    const initial = createRunSnapshot({ runId: "recovered-run", status: "running" });
    const pending = deferred<RunSnapshot>();
    const newer = { ...initial, currentStage: "render_svg" as const };
    let listener!: (event: RunEvent) => void;
    let options!: RunSubscriptionOptions<RunSnapshot>;
    const repository = {
      getRunSnapshot: vi.fn().mockResolvedValueOnce(initial).mockReturnValueOnce(pending.promise),
      subscribeToRun: vi.fn(async (_runId: string, onEvent: (event: RunEvent) => void, subscriptionOptions: RunSubscriptionOptions<RunSnapshot>) => {
        listener = onEvent;
        options = subscriptionOptions;
        await new Promise<void>((resolve) => options.signal?.addEventListener("abort", () => resolve(), { once: true }));
      }),
    } as unknown as WorkspaceRepository;
    const input = recoveryInput(repository);
    const { unmount } = renderHook(() => useRecoveredGenerationRuns(input));
    await waitFor(() => expect(repository.subscribeToRun).toHaveBeenCalledTimes(1));
    act(() => listener({ type: "artifact_ready", stage: "render_svg", artifactKind: "svg", diagramKind: "usecase" }));
    await act(async () => { await options.onSnapshot?.(newer); });
    expect(input.onSnapshot.mock.calls.at(-1)?.[1]).toBe(newer);
    await act(async () => pending.resolve(initial));
    expect(input.onSnapshot.mock.calls.map((call) => call[1])).toEqual([initial, newer]);
    unmount();
  });
});
