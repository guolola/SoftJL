// Verifies workspace session feedback across repository and UI boundaries.

import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceRepository } from "../../src/services/workspace-repository/index";

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
import { createRule, storeManagedUserSettings, GenerateRulesHarness } from "../helpers/workspace-session-fixtures";

describe("WorkspaceSessionProvider", () => {
it("shows Figma-style generation result dialogs with a single confirm close action", async () => {
    toastMessage.mockClear();
    let runIndex = 0;
    const createSuccessSnapshot = () =>
      createRunSnapshot({
        runId: `run-success-dialog-${runIndex}`,
        requirementText: "订单系统需求",
        rules: [createRule()],
      });
    const successRepository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({ requirementText: "订单系统需求" }),
      ),

      startRun: vi.fn(async () => {
        runIndex += 1;
        return { runId: `run-success-dialog-${runIndex}` };
      }),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        const successSnapshot = createSuccessSnapshot();
        onEvent({ type: "completed", snapshot: successSnapshot });
      }),
      getRunSnapshot: vi.fn(async () => createSuccessSnapshot()),

      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const user = userEvent.setup();

    render(withWorkspaceProviders(<GenerateRulesHarness />, successRepository));
    await user.click(
      await screen.findByRole("button", { name: "生成需求规则" }),
    );

    const successDialog = await screen.findByRole("dialog", {
      name: "需求规则已生成",
    });
    expect(within(successDialog).getByText("生成完成。")).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.queryByRole("dialog", { name: "生成成功" }),
    ).not.toBeInTheDocument();
    expect(toastMessage).not.toHaveBeenCalled();
    expect(
      within(successDialog).queryByRole("button", { name: "取消" }),
    ).not.toBeInTheDocument();
    await user.click(
      within(successDialog).getByRole("button", { name: "我知道了" }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "需求规则已生成" }),
      ).not.toBeInTheDocument();
    });

    toastMessage.mockClear();
    await user.click(screen.getByRole("button", { name: "生成需求规则" }));
    const successDialogAgain = await screen.findByRole("dialog", {
      name: "需求规则已生成",
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.queryByRole("dialog", { name: "生成成功" }),
    ).not.toBeInTheDocument();
    expect(toastMessage).not.toHaveBeenCalled();
    await user.click(
      within(successDialogAgain).getByRole("button", { name: "我知道了" }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "需求规则已生成" }),
      ).not.toBeInTheDocument();
    });
  });

it("shows generation failures without raw technical details", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({ requirementText: "订单系统需求" }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-failed-dialog" })),
      subscribeToRun: vi.fn(async () => {
        throw new Error("Trusted chain traceability gate failed: runId=abc123");
      }),
      getRunSnapshot: vi.fn(),

      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const user = userEvent.setup();

    render(withWorkspaceProviders(<GenerateRulesHarness />, repository));
    await user.click(
      await screen.findByRole("button", { name: "生成需求规则" }),
    );

    const failedDialog = await screen.findByRole("dialog", {
      name: "任务遇到内部错误",
    });
    expect(
      within(failedDialog).getByText(
        "生成任务失败，请稍后重试。 任务或请求编号：run-failed-dialog。",
      ),
    ).toBeInTheDocument();
    expect(
      within(failedDialog).queryByRole("button", { name: "取消" }),
    ).not.toBeInTheDocument();
    expect(
      within(failedDialog).getByRole("button", { name: "我知道了" }),
    ).toBeInTheDocument();
    expect(within(failedDialog).queryByText("影响：")).not.toBeInTheDocument();
    expect(within(failedDialog).queryByText("技术详情")).not.toBeInTheDocument();
    expect(failedDialog).toHaveTextContent("run-failed-dialog");

    await user.click(within(failedDialog).getByRole("button", { name: "我知道了" }));
    await user.click(screen.getByRole("button", { name: "生成需求规则" }));
    expect(
      await screen.findByRole("dialog", { name: "任务遇到内部错误" }),
    ).toBeInTheDocument();
  });

it("does not show success when completed rule results cannot be saved", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({ requirementText: "订单系统需求" }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-completed-then-failed" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({
          type: "completed",
          snapshot: createRunSnapshot({
            runId: "run-completed-then-failed",
            requirementText: "订单系统需求",
            rules: [createRule()],
          }),
        });
      }),
      getRunSnapshot: vi.fn(),

      saveRunHistory: vi.fn(async () => { throw new Error("Project sync unavailable"); }),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const user = userEvent.setup();

    render(withWorkspaceProviders(<GenerateRulesHarness />, repository));
    await user.click(
      await screen.findByRole("button", { name: "生成需求规则" }),
    );

    const failedDialog = await screen.findByRole("dialog", {
      name: "任务遇到内部错误",
    });
    expect(
      screen.queryByRole("dialog", { name: "需求规则已生成" }),
    ).not.toBeInTheDocument();
    await user.click(
      within(failedDialog).getByRole("button", { name: "我知道了" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("dialog", { name: "需求规则已生成" }),
    ).not.toBeInTheDocument();
  });

it("keeps global generating true for active model runs", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单系统需求",
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-rules" })),
      subscribeToRun: vi.fn(async () => new Promise<void>(() => {})),
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
    act(() => {
      void result.current.generateRules();
    });

    await waitFor(() => {
      expect(result.current.generating).toBe(true);
    });
  });

it("retains streamed LLM output in the current task transcript", async () => {
    const longPrefix = "a".repeat(30_010);
    const snapshot = createRunSnapshot({
      runId: "run-long-stream",
      requirementText: "订单系统需求",
      rules: [createRule()],
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun: vi.fn(async () => ({ runId: "run-long-stream" })),
      subscribeToRun: vi.fn(
        async (
          _runId: string,
          onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1],
        ) => {
          onEvent({ type: "queued" });
          onEvent({
            type: "llm_chunk",
            stage: "extract_rules",
            chunk: longPrefix,
          });
          onEvent({ type: "llm_chunk", stage: "extract_rules", chunk: "TAIL" });
          onEvent({ type: "completed", snapshot });
        },
      ),
      getRunSnapshot: vi.fn(async () => snapshot),

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
    act(() => {
      result.current.setRequirementText("订单系统需求");
    });

    await act(async () => {
      await result.current.generateRules();
    });

    const chunks = result.current.currentRunDiagnostics.transcript?.filter(
      (event) => event.type === "llm_chunk",
    );
    expect(chunks?.map((event) => event.chunk)).toEqual([longPrefix, "TAIL"]);
  });
});
