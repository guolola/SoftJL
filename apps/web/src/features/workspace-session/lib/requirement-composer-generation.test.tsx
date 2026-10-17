// Verifies engineering composer inputs, atomic source adoption, and cancellation ownership.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StandardAttachment } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { createRule, createRunSnapshot, createWorkspaceRecord, withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { useWorkspaceSession } from "../state";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const attachment: StandardAttachment = {
  id: "source-1", name: "requirements.md", type: "document", contentType: "text/markdown", text: "用户可以提交订单。",
};

function createRepository(overrides: Partial<WorkspaceRepository> = {}): WorkspaceRepository {
  const snapshot = createRunSnapshot({ runId: "rules-from-composer", requirementText: "来自附件的规范需求", rules: [createRule()] });
  return {
    loadWorkspace: vi.fn(async () => createWorkspaceRecord({ requirementText: "" })),
    updateRequirementText: vi.fn(async () => {}),
    startRun: vi.fn(async () => ({ runId: snapshot.runId })),
    subscribeToRun: vi.fn(async (_runId, onEvent) => { onEvent({ type: "completed", snapshot }); }),
    getRunSnapshot: vi.fn(async () => snapshot),
    cancelRun: vi.fn(async () => {}),
    renderPlantUml: vi.fn(), testProviderSettings: vi.fn(),
    saveRunHistory: vi.fn(async () => ({ id: snapshot.runId, createdAt: "2026-10-17T00:00:00.000Z", title: "需求", snapshot, providerModel: "model-1" })),
    listRunHistory: vi.fn(async () => []), deleteRunHistory: vi.fn(async () => []), clearRunHistory: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.setItem("uml-lab-settings", JSON.stringify({ providerConfigId: "provider-1", defaultModel: "model-1", providerModelOptions: ["model-1"] }));
});
afterEach(() => localStorage.clear());

describe("engineering composer generation", () => {
  it("passes attachment-only input and reasoning, then adopts the normalized saved source", async () => {
    const repository = createRepository();
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));

    let success = false;
    await act(async () => { success = await result.current.generateRules({ attachments: [attachment], reasoning: true }); });

    expect(success).toBe(true);
    expect(repository.startRun).toHaveBeenCalledWith(expect.objectContaining({ requirementText: "", selectedDiagrams: [], attachments: [attachment], reasoning: true }));
    expect(result.current.requirementText).toBe("来自附件的规范需求");
    expect(result.current.hasUncommittedRequirementDraft).toBe(false);
    expect(result.current.isRulesStale).toBe(false);
    expect(result.current.requirementGenerationRunId).toBeNull();
  });

  it("preserves a newer draft while the server atomically commits the submitted attachment source", async () => {
    const sync = deferred<void>();
    const repository = createRepository({ saveRunHistory: vi.fn(async () => { await sync.promise; return {} as never; }) });
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    let generation!: Promise<boolean>;
    act(() => { generation = result.current.generateRules({ attachments: [attachment] }); });
    await waitFor(() => expect(repository.saveRunHistory).toHaveBeenCalled());
    act(() => result.current.setRequirementText("运行期间的新草稿"));
    await act(async () => { sync.resolve(); expect(await generation).toBe(true); });
    expect(result.current.requirementText).toBe("运行期间的新草稿");
    expect(result.current.hasUncommittedRequirementDraft).toBe(true);
    expect(result.current.isRulesStale).toBe(true);
  });

  it("returns false and keeps the draft when the atomic server sync fails", async () => {
    const repository = createRepository({ saveRunHistory: vi.fn(async () => { throw new Error("同步失败"); }) });
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    act(() => result.current.setRequirementText("尚未保存的需求"));
    await act(async () => { expect(await result.current.generateRules({ attachments: [attachment] })).toBe(false); });
    expect(result.current.requirementText).toBe("尚未保存的需求");
    expect(result.current.hasUncommittedRequirementDraft).toBe(true);
    expect(result.current.rules).toEqual([]);
    expect(result.current.requirementGenerationRunId).toBeNull();
  });

  it("does not cancel pending requests, then cancels only the locally submitted rules run", async () => {
    const start = deferred<{ runId: string }>();
    const finish = deferred<void>();
    const cancelled = createRunSnapshot({ runId: "owned-rules", requirementText: "", status: "cancelled" });
    const repository = createRepository({
      startRun: vi.fn(async () => start.promise),
      subscribeToRun: vi.fn(async (_runId, onEvent) => { await finish.promise; onEvent({ type: "cancelled", stage: "extract_rules", message: "任务已取消" }); }),
      getRunSnapshot: vi.fn(async () => cancelled),
      cancelRun: vi.fn(async () => { finish.resolve(); }),
    });
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    let generation!: Promise<boolean>;
    act(() => { generation = result.current.generateRules({ attachments: [attachment] }); });
    await waitFor(() => expect(repository.startRun).toHaveBeenCalled());
    await act(async () => { expect(await result.current.generateRules({ attachments: [attachment] })).toBe(false); });
    expect(repository.startRun).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.cancelRequirementGeneration(); });
    expect(repository.cancelRun).not.toHaveBeenCalled();
    await act(async () => { start.resolve({ runId: "owned-rules" }); });
    await waitFor(() => expect(result.current.requirementGenerationRunId).toBe("owned-rules"));
    await act(async () => { await result.current.cancelRequirementGeneration(); expect(await generation).toBe(false); });
    expect(repository.cancelRun).toHaveBeenCalledExactlyOnceWith("owned-rules");
    expect(result.current.requirementText).toBe("");
    expect(result.current.requirementGenerationRunId).toBeNull();
    expect(result.current.generating).toBe(false);
    await act(async () => { await result.current.cancelRequirementGeneration(); });
    expect(repository.cancelRun).toHaveBeenCalledTimes(1);
  });

  it("does not stop another active project task through the requirement composer", async () => {
    const repository = createRepository({ subscribeToRun: vi.fn(async () => new Promise<void>(() => {})) });
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    act(() => result.current.reconcileGenerationTasksWithProjectRuns([{ runId: "remote-task", runKind: "requirements", status: "running", selectedDiagrams: [] }]));
    await act(async () => { await result.current.cancelRequirementGeneration(); });
    expect(result.current.requirementGenerationRunId).toBeNull();
    expect(repository.cancelRun).not.toHaveBeenCalled();
  });
});
