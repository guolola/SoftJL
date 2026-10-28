// Covers partial failure feedback, retained models, history refresh, and saved-scope retries together.
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createRequirementBaselineSnapshot } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import type { WorkspaceRepository } from "../../../services/workspace-repository/index";
import { createRunSnapshot } from "../../../../tests/fixtures/contract-fixtures";
import { createRule, createWorkspaceRecord, withWorkspaceProviders } from "../../../../tests/helpers/workspace-test-utils";
import { platformApi } from "../../user-platform/services/platform-api";
import { useWorkspaceSession } from "../state";

afterEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

it.each(["failed", "completed"] as const)("shows a warning with exact model outcomes when the server ends as %s", async (status) => {
  window.history.replaceState({}, "", "/projects/partial-project");
  localStorage.setItem("uml-lab-settings", JSON.stringify({ providerConfigId: "provider", defaultModel: "model", providerModelOptions: ["model"] }));
  const rules = [createRule()];
  const requirementText = rules[0]!.text;
  const requirementBaseline = createRequirementBaselineSnapshot({ runId: "baseline", requirementText, rules });
  const workspace = createWorkspaceRecord({ requirementText, rules, requirementBaseline });
  const error = { code: "RUN_RENDER_FAILED" as const, category: "render" as const, message: "render failed", retryable: true };
  const generated = modelFixture("requirements", "function");
  if (generated.diagramKind !== "function") throw new Error("Expected function fixture");
  const snapshot = createRunSnapshot({ runId: "partial-run", status, requirementText, rules, requirementBaseline,
    selectedDiagrams: ["function", "usecase"], models: [generated],
    diagramErrors: { usecase: { stage: "render_svg", error } } });
  const repository: WorkspaceRepository = {
    loadWorkspace: vi.fn(async () => workspace),
    startRun: vi.fn(async () => ({ runId: snapshot.runId })),
    subscribeToRun: vi.fn(async (_id, onEvent) => {
      if (status === "completed") onEvent({ type: "completed", snapshot });
      else {
        onEvent({ type: "failed", stage: "render_svg", error });
        throw Object.assign(new Error(error.message), { runError: error });
      }
    }),
    getRunSnapshot: vi.fn(async () => snapshot),
    saveRunHistory: vi.fn(), listRunHistory: vi.fn(async () => []), deleteRunHistory: vi.fn(async () => []),
  };
  const retry = vi.spyOn(platformApi, "retryProjectRun").mockResolvedValue({ runId: "retry-run" });
  const { result } = renderHook(() => useWorkspaceSession(), {
    wrapper: ({ children }) => withWorkspaceProviders(children, repository),
  });
  await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
  const initialHistoryReads = vi.mocked(repository.listRunHistory).mock.calls.length;
  let generation!: Promise<void>;
  act(() => { generation = result.current.generateDiagrams(["function", "usecase"]); });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "确认生成" }));
  await act(async () => { await generation; });
  const dialog = within(screen.getByRole("dialog", { name: "部分生成成功" }));
  expect(dialog.getByLabelText("需要处理")).toHaveAttribute("data-feedback-tone", "warning");
  expect(dialog.getByLabelText("需要处理")).toHaveClass("text-warning");
  expect(dialog.getByText(/生成成功：功能结构图。/)).toHaveTextContent("生成失败：用例模型。");
  expect(dialog.getByRole("button", { name: "确认" })).toBeInTheDocument();
  expect(result.current.models.function).toBeDefined();
  expect(repository.listRunHistory).toHaveBeenCalledTimes(initialHistoryReads + 1);
  await user.click(dialog.getByRole("button", { name: "重试失败模型" }));
  expect(retry).toHaveBeenCalledExactlyOnceWith("partial-project", "partial-run");
  expect(repository.startRun).toHaveBeenCalledOnce();
});
