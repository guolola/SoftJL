// Verifies workspace session generation guards across repository and UI boundaries.

import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceRepository } from "../../src/services/workspace-repository/index";

import { createRunSnapshot, createWorkspaceRecord, withWorkspaceProviders } from "../helpers/workspace-test-utils";

import { useWorkspaceSession } from "../../src/features/workspace-session/state";
import { createMockWorkspaceRepository } from "../../src/services/workspace-repository/mock-repository";

const { toastMessage } = vi.hoisted(() => ({
  toastMessage: vi.fn(),
}));
vi.mock("../../src/shared/ui/floating-alert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/shared/ui/floating-alert")>();
  return { ...actual, floatingAlert: {
    ...actual.floatingAlert,
    message: toastMessage,
  } };
});

beforeEach(() => {
  storeManagedUserSettings();
  toastMessage.mockClear();
});

afterEach(() => {
  localStorage.clear();
});
import { createRule, storeManagedUserSettings, createBaselineRule, createRequirementBaseline } from "../helpers/workspace-session-fixtures";

describe("WorkspaceSessionProvider", () => {
it("blocks requirement model generation when rules need autofill but no requirement source exists", async () => {
    const startRun = vi.fn(async () => ({ runId: "run-should-not-start" }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "",
          rules: [],
        }),
      ),

      startRun,
      subscribeToRun: vi.fn(async () => {}),
      getRunSnapshot: vi.fn(),

      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
      expect(result.current.workspaceInitialized).toBe(true);
    });

    await act(async () => {
      await result.current.generateDiagrams(["usecase"]);
    });

    expect(startRun).not.toHaveBeenCalled();
    const warningDialog = await screen.findByRole("dialog", {
      name: "缺少对应需求规则",
    });
    expect(
      within(warningDialog).getByText(/请先抽取或添加规则/),
    ).toBeInTheDocument();
  });

it.each(["requirements", "design"] as const)("blocks %s generation with no rules instead of inventing mappings", async (stage) => {
    const repository = createMockWorkspaceRepository({ requirementText: "公开日历需求", rules: [], rulesVersion: 1 });
    repository.startRun = vi.fn();
    repository.startDesignRun = vi.fn();
    const updateRules = vi.spyOn(repository, "updateRequirementRules");
    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    await act(async () => {
      if (stage === "requirements") await result.current.generateDiagrams(["class"]);
      else await result.current.generateDesignDiagrams(["class"]);
    });
    const dialog = await screen.findByRole("dialog", { name: "缺少对应需求规则" });
    expect(dialog).toHaveTextContent("请先抽取或添加规则");
    expect(within(dialog).getByRole("button", { name: "前往系统需求" })).toBeVisible();
    expect(repository.startRun).not.toHaveBeenCalled();
    expect(repository.startDesignRun).not.toHaveBeenCalled();
    expect(updateRules).not.toHaveBeenCalled();
    expect(result.current.rules).toEqual([]);
  });

it("completes rules generation without a repair phase and never blocks downstream generation", async () => {
    const rule = createRule({
      id: "r1",
      text: "系统应允许用户提交订单。",

    });
    const beforeRequirement = createBaselineRule({ requirementId: "REQ-001", id: "r1" });
    const baseline = createRequirementBaseline([beforeRequirement]);
    const ruleSnapshot = createRunSnapshot({
      runId: "run-rules",
      requirementText: "订单需求",
      rules: [rule],
      requirementBaseline: baseline,
    });
    const diagramSnapshot = createRunSnapshot({
      runId: "run-usecase",
      requirementText: "订单需求",
      selectedDiagrams: ["usecase"],
      rules: [rule],
      models: [
        {
          diagramKind: "usecase",
          title: "用例模型",
          summary: "用户提交订单。",
          notes: [],
          actors: [],
          useCases: [],
          systemBoundaries: [],
          relationships: [],
        },
      ],
    });
    let startRunCount = 0;
    const startRun = vi.fn(async () => {
      startRunCount += 1;
      return { runId: startRunCount === 1 ? "run-rules" : "run-usecase" };
    });
    const snapshots = new Map([
      ["run-rules", ruleSnapshot],
      ["run-usecase", diagramSnapshot],
    ]);
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({ requirementText: "订单需求" }),
      ),

      startRun,
      subscribeToRun: vi.fn(async (runId, onEvent) => {
        const snapshot = snapshots.get(runId);
        if (!snapshot) throw new Error(`Missing ${runId}`);
        onEvent({ type: "completed", snapshot });
      }),
      getRunSnapshot: vi.fn(async (runId) => {
        const snapshot = snapshots.get(runId);
        if (!snapshot) throw new Error(`Missing ${runId}`);
        return snapshot;
      }),

      saveRunHistory: vi.fn(async (snapshot) => ({
        id: snapshot.runId,
        createdAt: "2026-05-27T00:00:00.000Z",
        title: "test",
        snapshot,
        providerModel: "gpt-5.5",
      })),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
      expect(result.current.workspaceInitialized).toBe(true);
    });

    await act(async () => {
      await result.current.generateRules();
    });

    // Extracted rules count as generated: no repair request, no repair subtask, no review gate.
    expect(
      result.current.generationTasks.find((task) => task.clientTaskId === result.current.selectedGenerationTaskId)?.subtasks.some(
        (subtask) => subtask.label === "修复需求规则",
      ),
    ).toBe(false);
    const completionDialog = await screen.findByRole("dialog", {
      name: "需求规则已生成",
    });
    await user.click(
      within(completionDialog).getByRole("button", { name: "我知道了" }),
    );
    startRun.mockClear();

    let allowedGeneration: Promise<void> | null = null;
    act(() => {
      allowedGeneration = result.current.generateDiagrams(["usecase"]);
    });
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await act(async () => {
      await allowedGeneration;
    });

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({ selectedDiagrams: ["usecase"] }),
    );
  });

it("generates diagrams from a baseline containing only saved requirement facts", async () => {
    const rule = createRule({
      id: "r1",
      text: "系统应允许用户提交订单。",

    });
    const requirement = createBaselineRule({ requirementId: "REQ-001", id: "r1" });
    const baseline = createRequirementBaseline([requirement]);
    const diagramSnapshot = createRunSnapshot({
      runId: "run-usecase",
      requirementText: "订单需求",
      selectedDiagrams: ["usecase"],
      rules: [rule],
      requirementBaseline: baseline,
      models: [
        {
          diagramKind: "usecase",
          title: "用例模型",
          summary: "用户提交订单。",
          notes: [],
          actors: [],
          useCases: [],
          systemBoundaries: [],
          relationships: [],
        },
      ],
    });
    const startRun = vi.fn(async () => ({ runId: "run-usecase" }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单需求",
          rules: [rule],
          requirementBaseline: baseline,
        }),
      ),

      startRun,
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "completed", snapshot: diagramSnapshot });
      }),
      getRunSnapshot: vi.fn(async () => diagramSnapshot),

      saveRunHistory: vi.fn(async (snapshot) => ({
        id: snapshot.runId,
        createdAt: "2026-05-27T00:00:00.000Z",
        title: "test",
        snapshot,
        providerModel: "gpt-5.5",
      })),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
      expect(result.current.workspaceInitialized).toBe(true);
    });
    expect(result.current.designGenerationBlockedReason).toBeNull();

    let generation: Promise<void> | null = null;
    act(() => {
      generation = result.current.generateDiagrams(["usecase"]);
    });
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await act(async () => {
      await generation;
    });

    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({ selectedDiagrams: ["usecase"] }),
    );
  });
});
