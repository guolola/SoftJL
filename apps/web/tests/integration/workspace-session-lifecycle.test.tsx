// Verifies workspace session lifecycle across repository and UI boundaries.

import { createRenderMeta } from "@test/fixtures/contract-fixtures";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceRepository } from "../../src/services/workspace-repository/index";
import type { RunHistoryItem } from "../../src/entities/run-history/index";
import { createRunSnapshot, createWorkspaceRecord, withWorkspaceProviders } from "../helpers/workspace-test-utils";

import { useWorkspaceSession } from "../../src/features/workspace-session/state";

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
import { createRule, storeManagedUserSettings } from "../helpers/workspace-session-fixtures";

describe("WorkspaceSessionProvider", () => {
it("records failed requirement tasks without fabricating generated models", async () => {
    const rule = createRule({
      id: "r1",
      type: "functional" as const,
      text: "用户可以浏览活动页面。",

    });
    const failedSnapshot = createRunSnapshot({
      runId: "run-prototype-failed",
      requirementText: "公开日历需求",
      selectedDiagrams: ["prototype"],
      rules: [rule],
      diagramErrors: {
        prototype: {
          stage: "generate_models",
          error: {
            code: "RUN_DEPENDENCY_MISSING",
            message: "原型界面关系生成失败",
            category: "generation",
            retryable: false,
          },
        },
      },
      currentStage: "generate_models",
      status: "failed",
      error: {
        code: "RUN_DEPENDENCY_MISSING",
        message: "原型界面关系生成失败",
        category: "generation",
        retryable: false,
      },
    });
    const saveRunHistory = vi.fn();
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "公开日历需求",
          rules: [rule],
          rulesVersion: 1,
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-prototype-failed" })),
      subscribeToRun: vi.fn(async () => {
        throw new Error("原型界面关系生成失败");
      }),
      getRunSnapshot: vi.fn(async () => failedSnapshot),

      saveRunHistory,
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

    let generation: Promise<void> | null = null;
    act(() => {
      generation = result.current.generateDiagrams(["prototype"]);
    });
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await act(async () => {
      await generation;
    });

    expect(result.current.generatedDiagrams).not.toContain("prototype");
    expect(result.current.models.prototype).toBeUndefined();
    expect(saveRunHistory).toHaveBeenCalledExactlyOnceWith(failedSnapshot, expect.objectContaining({ providerModel: expect.any(String) }));
    expect(
      await screen.findByRole("dialog", { name: "任务遇到内部错误" }),
    ).toBeInTheDocument();
  });

it("labels completed requirement snapshots with diagram errors as partially generated", async () => {
    const activityRule = createRule({
      id: "r-activity",
      text: "系统在活动开始前发送提醒。",

    });
    const deploymentRule = createRule({
      id: "r-deployment",
      type: "quality" as const,
      text: "系统记录关键操作审计日志。",

    });
    const partialSnapshot = createRunSnapshot({
      runId: "run-partial-requirements",
      requirementText: "活动日历需求",
      selectedDiagrams: ["activity", "deployment"],
      rules: [activityRule, deploymentRule],
      models: [
        {
          diagramKind: "deployment",
          title: "部署需求模型",
          summary: "审计日志部署约束。",
          notes: [],
          nodes: [],
          databases: [],
          components: [],
          externalSystems: [],
          artifacts: [],
          relationships: [],
        },
      ] as never,
      plantUml: [{ diagramKind: "deployment", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "deployment",
          svg: "<svg><text>deployment</text></svg>",
          renderMeta: createRenderMeta({ generatedAt: "2026-06-08T00:00:00.000Z" }),
        },
      ],
      diagramErrors: {
        activity: {
          stage: "generate_models",
          error: {
            code: "PLATFORM_PROVIDER_TIMEOUT",
            message: "当前模型服务响应超时，请稍后重试。",
            category: "platform_provider",
            retryable: true,
          },
        },
      },
      currentStage: "render_svg",
      status: "completed",
      error: null,
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "活动日历需求",
          rules: [activityRule, deploymentRule],
          rulesVersion: 1,
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-partial-requirements" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "completed", snapshot: partialSnapshot });
      }),
      getRunSnapshot: vi.fn(async () => partialSnapshot),

      saveRunHistory: vi.fn(),
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

    let generation: Promise<void> | null = null;
    act(() => {
      generation = result.current.generateDiagrams(["activity", "deployment"]);
    });
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await act(async () => {
      await generation;
    });

    const dialog = await screen.findByRole("dialog", {
      name: "部分生成成功",
    });
    expect(dialog).toHaveTextContent("生成成功：部署需求模型。");
    expect(dialog).toHaveTextContent("生成失败：总体业务流程。");
    expect(result.current.models.deployment).toBeDefined();
    expect(result.current.models.activity).toBeUndefined();
    expect(
      screen.queryByRole("dialog", { name: "需求模型已生成" }),
    ).not.toBeInTheDocument();
  });

it("applies partial requirement artifacts and records history for cancelled snapshots", async () => {
    const activityRule = createRule({
      id: "r-activity",
      text: "系统在活动开始前发送提醒。",

    });
    const deploymentRule = createRule({
      id: "r-deployment",
      type: "quality" as const,
      text: "系统记录关键操作审计日志。",

    });
    const cancelledSnapshot = createRunSnapshot({
      runId: "run-cancelled-requirements",
      requirementText: "活动日历需求",
      selectedDiagrams: ["activity", "deployment"],
      rules: [activityRule, deploymentRule],
      models: [
        {
          diagramKind: "deployment",
          title: "部署需求模型",
          summary: "审计日志部署约束。",
          notes: [],
          nodes: [],
          databases: [],
          components: [],
          externalSystems: [],
          artifacts: [],
          relationships: [],
        },
      ] as never,
      plantUml: [{ diagramKind: "deployment", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "deployment",
          svg: "<svg><text>deployment</text></svg>",
          renderMeta: createRenderMeta({ generatedAt: "2026-06-08T00:00:00.000Z" }),
        },
      ],
      diagramErrors: {
        activity: {
          stage: "generate_models",
          error: {
            code: "PLATFORM_PROVIDER_TIMEOUT",
            message: "当前模型服务响应超时，请稍后重试。",
            category: "platform_provider",
            retryable: true,
          },
        },
      },
      currentStage: "generate_models",
      status: "cancelled",
      error: null,
    });
    let historyItems: RunHistoryItem[] = [];
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "活动日历需求",
          rules: [activityRule, deploymentRule],
          rulesVersion: 1,
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-cancelled-requirements" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({
          type: "cancelled",
          stage: "generate_models",
          message: "任务已取消",
        });
      }),
      getRunSnapshot: vi.fn(async () => cancelledSnapshot),

      saveRunHistory: vi.fn(async (snapshot) => {
        const item: RunHistoryItem = {
          id: snapshot.runId,
          createdAt: "2026-06-20T00:00:00.000Z",
          title: "已取消的需求模型生成",
          snapshot,
          providerModel: "local-test",
          status: snapshot.status,
        };
        historyItems = [item];
        return item;
      }),
      listRunHistory: vi.fn(async () => historyItems),
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

    let generation: Promise<void> | null = null;
    act(() => {
      generation = result.current.generateDiagrams(["activity", "deployment"]);
    });
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await act(async () => {
      await generation;
    });

    expect(result.current.runStatus).toBe("cancelled");
    expect(result.current.generatedDiagrams).toEqual(["deployment"]);
    expect(result.current.models.deployment?.diagramKind).toBe("deployment");
    expect(result.current.diagramErrors.activity?.error.message).toBe(
      "当前模型服务响应超时，请稍后重试。",
    );
    expect(repository.saveRunHistory).toHaveBeenCalledWith(
      cancelledSnapshot,
      expect.any(Object),
    );
    expect(result.current.historyItems).toHaveLength(1);
    expect(result.current.historyItems[0]?.status).toBe("cancelled");
    expect(
      await screen.findByRole("dialog", { name: "任务已取消" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "生成失败" }),
    ).not.toBeInTheDocument();
  });
});
