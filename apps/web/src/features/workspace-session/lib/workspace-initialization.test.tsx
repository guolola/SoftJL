// Verifies resume throttling, request coalescing, and generation-safe workspace recovery.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import { createWorkspaceRecord } from "../../../../tests/helpers/workspace-test-utils";
import { useWorkspaceInitialization } from "./workspace-initialization";

afterEach(() => { vi.restoreAllMocks(); });

function setup(failInitialLoad = false) {
  const repository = createMockWorkspaceRepository();
  const workspace = createWorkspaceRecord();
  const load = vi.spyOn(repository, "loadWorkspace").mockResolvedValue(workspace);
  if (failInitialLoad) load.mockRejectedValueOnce(new Error("offline"));
  const history = vi.spyOn(repository, "listRunHistory").mockResolvedValue([]);
  const applyWorkspaceRecord = vi.fn();
  const getHasActiveGenerationTask = vi.fn(() => false);
  const setHistoryItems = vi.fn();
  const hook = renderHook(() => useWorkspaceInitialization({ repository, applyWorkspaceRecord, getHasActiveGenerationTask, setHistoryItems }));
  return { ...hook, repository, workspace, load, history, applyWorkspaceRecord, getHasActiveGenerationTask, setHistoryItems };
}

function resume() {
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
}

describe("workspace initialization recovery", () => {
  it("reuses a recent session during short tab switches and refreshes after 30 seconds", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const test = setup();
    await waitFor(() => expect(test.result.current).toBe(true));
    resume(); resume();
    expect(test.load).toHaveBeenCalledTimes(1);
    expect(test.history).toHaveBeenCalledTimes(1);
    now += 30_000;
    resume();
    await waitFor(() => expect(test.load).toHaveBeenCalledTimes(2));
    expect(test.applyWorkspaceRecord).toHaveBeenLastCalledWith(test.workspace, { preserveRequirementDraft: true });
    resume();
    expect(test.load).toHaveBeenCalledTimes(2);
  });

  it("coalesces resume and online events while a refresh is pending", async () => {
    const test = setup();
    await waitFor(() => expect(test.result.current).toBe(true));
    let finish!: (workspace: typeof test.workspace) => void;
    test.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => { window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("online")); });
    resume();
    expect(test.load).toHaveBeenCalledTimes(2);
    expect(test.history).toHaveBeenCalledTimes(2);
    await act(async () => { finish(test.workspace); });
    expect(test.applyWorkspaceRecord).toHaveBeenCalledTimes(2);
  });

  it("retries failed reads on the next visible event and skips hidden tabs", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const test = setup(true);
    await waitFor(() => expect(test.result.current).toBe(true));
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(test.load).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    resume();
    await waitFor(() => expect(test.load).toHaveBeenCalledTimes(2));
  });

  it("does not overwrite preview results when generation starts during a background read", async () => {
    const test = setup();
    await waitFor(() => expect(test.result.current).toBe(true));
    let finish!: (workspace: typeof test.workspace) => void;
    test.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => { window.dispatchEvent(new Event("online")); });
    test.getHasActiveGenerationTask.mockReturnValue(true);
    await act(async () => { finish(test.workspace); });
    expect(test.applyWorkspaceRecord).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(test.history).toHaveBeenCalledTimes(3));
    expect(test.load).toHaveBeenCalledTimes(2);
  });
});
