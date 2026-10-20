// Verifies history categories, shared icon actions, and per-run output/error inspection.
import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import type { PlatformRunSummary, PlatformRunTokenConsumption } from "../services/platform-api";
import { ProjectHistory } from "./project-history";
import { createDesignRunSnapshot, createRunSnapshot } from "../../../test/contract-fixtures";

const mocks = vi.hoisted(() => ({
  deleteProjectRun: vi.fn(),
  deleteRunHistory: vi.fn(),
  getProjectRun: vi.fn(),
  listProjectRuns: vi.fn(),
  retryProjectRun: vi.fn(),
  showAlert: vi.fn(),
  canStartRuns: true,
}));
vi.mock("../services/platform-api", () => ({
  platformApi: { deleteProjectRun: mocks.deleteProjectRun, getProjectRun: mocks.getProjectRun, listProjectRuns: mocks.listProjectRuns, retryProjectRun: mocks.retryProjectRun },
}));
vi.mock("../../../shared/ui/floating-alert", () => ({
  useFloatingAlert: () => ({ showAlert: mocks.showAlert }),
}));
vi.mock("../../workspace-session/state", () => ({
  useWorkspaceSession: () => ({ deleteRunHistory: mocks.deleteRunHistory, canStartRuns: mocks.canStartRuns }),
}));

const runs: PlatformRunSummary[] = [
  { operationType: "requirement_extraction", runId: "running", status: "running", stage: "extract_rules", runKind: "requirements" },
  { operationType: "design_modeling", runId: "failed", status: "failed", stage: "render_svg", runKind: "design",
    sourceRunId: "original-run", sourceAction: "retry", latestActionRunId: "retried-run", latestAction: "retry",
    error: { code: "RUN_INTERNAL_ERROR", message: "任务未完成", category: "internal", retryable: true } },
  { operationType: "document_generation", runId: "completed", status: "completed", stage: "generate_document_text",
    runKind: "document", documentKind: "requirementsSpec", snapshotAvailable: true,
    documentDownloadAvailable: true },
  { operationType: "feasibility_analysis", runId: "feasibility", status: "cancelled", stage: "generate_business_flow", runKind: "feasibility" },
  { operationType: "requirement_modeling", runId: "models", status: "completed", stage: "verify_diagram_visual", runKind: "requirements", selectedDiagrams: ["usecase"] },
  { operationType: "unknown", runId: "other", status: "completed", stage: "generate_tests", runKind: "test" },
];

function tokenConsumption(overrides: Partial<PlatformRunTokenConsumption> = {}): PlatformRunTokenConsumption {
  return { totalTokens: 5700, inputTokens: 4000, outputTokens: 1700, cachedInputTokens: 500, reasoningTokens: 300, calls: 3, unreportedCalls: 0, ...overrides };
}

describe("ProjectHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.deleteProjectRun.mockResolvedValue({});
    mocks.deleteRunHistory.mockResolvedValue([]);
    mocks.getProjectRun.mockImplementation(async (_projectId, runId) => ({ run: runs.find((run) => run.runId === runId) }));
    mocks.listProjectRuns.mockResolvedValue({ projectId: "project", runs });
    mocks.retryProjectRun.mockResolvedValue({ runId: "retry-new", status: "queued" });
    mocks.canStartRuns = true;
  });

  it("shows quick turns and only their accepted outputs without offering an engineering retry", async () => {
    const quick: PlatformRunSummary = { runId: "quick", operationType: "quick_modeling", status: "failed" };
    mocks.getProjectRun.mockResolvedValue({ run: quick, snapshot: createRunSnapshot({
      operationType: "quick_modeling",
      outputManifest: [{ kind: "model", id: "own" }],
      standardRun: { operation: "chat", model: "test-model", providerConfigId: "provider", baseline: {}, artifacts: [
        { id: "own", title: "本轮订单模型", type: "毕设图表", previewAvailable: false },
        { id: "old", title: "沿用历史模型", type: "毕设图表", previewAvailable: false },
      ] },
    }) });
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={[quick]} members={[]} /></AppI18nProvider>);
    expect(screen.getByText("快速建模")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /重试运行/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看运行记录 quick" }));
    expect(await screen.findByText("本轮订单模型")).toBeInTheDocument();
    expect(screen.queryByText("沿用历史模型")).not.toBeInTheDocument();
    expect(mocks.retryProjectRun).not.toHaveBeenCalled();
  });

  it.each(["page", "drawer"] as const)("refreshes %s history while keeping search and preventing duplicate requests", async (layout) => {
    const initialRuns = Array.from({ length: 12 }, (_, index) => ({
      ...runs[4]!, runId: `old-${index}`, model: "history-model",
    }));
    let finishRefresh!: (response: { projectId: string; runs: PlatformRunSummary[] }) => void;
    mocks.listProjectRuns.mockReturnValueOnce(new Promise((resolve) => { finishRefresh = resolve; }));
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={initialRuns} members={[]} layout={layout} /></AppI18nProvider>);
    const search = screen.getByRole("textbox", { name: "筛选操作者" });
    await user.type(search, "history-model");
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByRole("button", { name: "查看运行记录 old-10" })).toBeInTheDocument();
    const refresh = screen.getByRole("button", { name: "刷新历史" });
    await user.click(refresh);
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveAttribute("aria-busy", "true");
    await user.click(refresh);
    expect(mocks.listProjectRuns).toHaveBeenCalledTimes(1);
    expect(mocks.listProjectRuns).toHaveBeenCalledWith("project");
    await act(async () => finishRefresh({ projectId: "project", runs: [
      { ...runs[4]!, runId: "latest", model: "history-model" },
      { ...runs[4]!, runId: "hidden", model: "another-model" },
    ] }));
    expect(refresh).toBeEnabled();
    expect(search).toHaveValue("history-model");
    expect(screen.getByRole("button", { name: "查看运行记录 latest" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看运行记录 hidden" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看运行记录 old-10" })).not.toBeInTheDocument();
    expect(mocks.showAlert).toHaveBeenCalledWith(expect.objectContaining({ title: "运行历史已刷新。", tone: "success" }));
  });

  it("preserves records after a refresh failure and allows retrying", async () => {
    mocks.listProjectRuns.mockRejectedValueOnce(new Error("unavailable"));
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={runs} members={[]} /></AppI18nProvider>);
    const refresh = screen.getByRole("button", { name: "刷新历史" });
    await user.click(refresh);
    await waitFor(() => expect(mocks.showAlert).toHaveBeenCalledWith(expect.objectContaining({ title: "刷新运行历史失败。", tone: "destructive" })));
    expect(refresh).toBeEnabled();
    expect(screen.getByRole("button", { name: "查看运行记录 models" })).toBeInTheDocument();
    await user.click(refresh);
    await waitFor(() => expect(mocks.showAlert).toHaveBeenCalledWith(expect.objectContaining({ tone: "success" })));
    expect(mocks.listProjectRuns).toHaveBeenCalledTimes(2);
  });

  it.each(["page", "drawer"] as const)("shows five operations with retry icons only on failed records in %s layout", async (layout) => {
    const user = userEvent.setup();
    render(<AppI18nProvider>
      <ProjectHistory projectId="project" initialRuns={runs} members={[]} layout={layout} />
    </AppI18nProvider>);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(6);
    expect(within(rows[1]!).getByRole("button", { name: "删除运行记录 running" })).toBeDisabled();
    for (const row of rows.slice(1)) {
      const count = within(row).queryByRole("button", { name: "重试运行记录 failed" }) ? 3 : 2;
      expect(within(row).getAllByRole("button")).toHaveLength(count);
      expect(within(row).getAllByRole("button").every((button) => button.textContent === "")).toBe(true);
    }
    for (const name of ["提取需求规则", "生成设计模型", "生成说明书", "生成可行性分析", "生成需求模型"]) {
      expect(within(screen.getByRole("table")).getByText(name)).toBeInTheDocument();
    }
    expect(screen.queryByText("verify_diagram_visual")).not.toBeInTheDocument();
    expect(screen.queryByText("generate_business_flow")).not.toBeInTheDocument();
    expect(screen.queryByText(/重试自|已重试为|original-run|retried-run/)).not.toBeInTheDocument();
    for (const name of ["重新运行", "恢复快照", "重试", "取消任务", "重新下载"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    await user.click(within(rows[2]!).getByRole("button", { name: "查看运行记录 failed" }));
    const dialog = await screen.findByRole("dialog", { name: "运行详情" });
    expect(within(dialog).queryByText(/任务编号/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText("生成设计模型 · 失败")).not.toBeInTheDocument();
    expect(within(dialog).getByText("生成任务失败，请稍后重试。")).toBeInTheDocument();
    expect(within(dialog).queryByText(/RUN_INTERNAL_ERROR|render_svg/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(mocks.deleteProjectRun).not.toHaveBeenCalled();
    await user.click(within(rows[2]!).getByRole("button", { name: "删除运行记录 failed" }));
    await waitFor(() => expect(rows[2]).not.toBeInTheDocument());
    expect(mocks.deleteProjectRun).toHaveBeenCalledWith("project", "failed");
    expect(mocks.deleteRunHistory).toHaveBeenCalledWith("failed");
    expect(screen.queryByText("任务编号：failed")).not.toBeInTheDocument();
  });

  async function openDetail(run: PlatformRunSummary, snapshot?: object) {
    mocks.getProjectRun.mockResolvedValue({ run, snapshot });
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={[run]} members={[]} /></AppI18nProvider>);
    await user.click(await screen.findByRole("button", { name: (name) => name === `查看运行记录 ${run.runId}` || name === `View run record ${run.runId}` }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    return within(screen.getByRole("dialog"));
  }

  it("confirms only failed models and submits a single retry before refreshing history", async () => {
    const run = { ...runs[1]!, selectedDiagrams: ["class", "navigation"] as const };
    const source = { ...run, selectedDiagrams: [...run.selectedDiagrams] };
    const snapshot = createDesignRunSnapshot({ selectedDiagrams: ["class", "navigation"], status: "failed", diagramErrors: {
      navigation: { stage: "render_svg", error: { code: "RUN_RENDER_FAILED", category: "render", message: "render failed", retryable: true } },
    } });
    mocks.getProjectRun.mockResolvedValue({ run: source, snapshot });
    let finishRetry!: (value: object) => void;
    mocks.retryProjectRun.mockReturnValueOnce(new Promise((resolve) => { finishRetry = resolve; }));
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={[source]} members={[]} /></AppI18nProvider>);
    await user.click(screen.getByRole("button", { name: "重试运行记录 failed" }));
    const dialog = within(await screen.findByRole("dialog", { name: "确认重试失败项" }));
    expect(await dialog.findByRole("list")).toHaveTextContent("页面导航模型");
    expect(dialog.queryByText("设计类图")).not.toBeInTheDocument();
    expect(mocks.retryProjectRun).not.toHaveBeenCalled();
    const confirm = dialog.getByRole("button", { name: "确认重试" });
    await user.click(confirm);
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(mocks.retryProjectRun).toHaveBeenCalledExactlyOnceWith("project", "failed");
    await act(async () => finishRetry({ runId: "retry-new", status: "queued" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.listProjectRuns).toHaveBeenCalledWith("project");
    expect(mocks.showAlert).toHaveBeenCalledWith(expect.objectContaining({ title: "已提交失败项重试。", tone: "success" }));
  });

  it("shows completed batches with retryable model failures and cancels without submitting", async () => {
    const run = { ...runs[4]!, diagramErrorSummary: [{ diagramId: "class", message: "failed", error: {
      code: "RUN_RENDER_FAILED" as const, category: "render" as const, message: "failed", retryable: true,
    } }] };
    mocks.getProjectRun.mockResolvedValue({ run, snapshot: createDesignRunSnapshot({ selectedDiagrams: ["class"], diagramErrors: {
      class: { stage: "render_svg", error: run.diagramErrorSummary[0]!.error },
    } }) });
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={[run]} members={[]} /></AppI18nProvider>);
    await user.click(screen.getByRole("button", { name: "重试运行记录 models" }));
    const dialog = within(await screen.findByRole("dialog", { name: "确认重试失败项" }));
    await dialog.findByRole("list");
    await user.click(dialog.getByRole("button", { name: "取消" }));
    expect(mocks.retryProjectRun).not.toHaveBeenCalled();
  });

  it("blocks confirmation without a snapshot and permits reloading failed details", async () => {
    mocks.getProjectRun.mockRejectedValueOnce(new Error("unavailable"));
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={runs} members={[]} /></AppI18nProvider>);
    await user.click(screen.getByRole("button", { name: "重试运行记录 failed" }));
    const dialog = within(await screen.findByRole("dialog", { name: "确认重试失败项" }));
    expect(dialog.getByRole("button", { name: "确认重试" })).toBeDisabled();
    await user.click(await dialog.findByRole("button", { name: "重新加载详情" }));
    expect(await dialog.findByText("没有可确认的失败项，请刷新历史或从当前工作区重新生成。")).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "确认重试" }));
    expect(mocks.retryProjectRun).not.toHaveBeenCalled();
    expect(mocks.getProjectRun).toHaveBeenCalledTimes(2);
  });

  it("keeps retry errors in the confirmation dialog and allows another attempt", async () => {
    mocks.getProjectRun.mockResolvedValue({ run: runs[1], snapshot: createDesignRunSnapshot({ selectedDiagrams: ["class"], status: "failed" }) });
    mocks.retryProjectRun.mockRejectedValueOnce(new Error("unavailable"));
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={runs} members={[]} /></AppI18nProvider>);
    await user.click(screen.getByRole("button", { name: "重试运行记录 failed" }));
    const dialog = within(await screen.findByRole("dialog", { name: "确认重试失败项" }));
    await dialog.findByRole("list");
    await user.click(dialog.getByRole("button", { name: "确认重试" }));
    expect(await dialog.findByText("提交重试失败，请稍后重试。")).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "确认重试" })).toBeEnabled();
    await user.click(dialog.getByRole("button", { name: "确认重试" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.retryProjectRun).toHaveBeenCalledTimes(2);
  });

  it("disables retry for a member without run permissions", async () => {
    mocks.canStartRuns = false;
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={runs} members={[]} /></AppI18nProvider>);
    const retry = screen.getByRole("button", { name: "重试运行记录 failed" });
    expect(retry).toBeDisabled();
    await user.click(retry);
    expect(mocks.getProjectRun).not.toHaveBeenCalled();
    expect(mocks.retryProjectRun).not.toHaveBeenCalled();
  });

  it("localizes the failed model retry confirmation in English", async () => {
    localStorage.setItem("uml-lab-locale-preference", "en");
    mocks.getProjectRun.mockResolvedValue({ run: runs[1], snapshot: createDesignRunSnapshot({ selectedDiagrams: ["class"], status: "failed" }) });
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={runs} members={[]} /></AppI18nProvider>);
    await user.click(screen.getByRole("button", { name: "Retry run record failed" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Confirm retry of failed items" }));
    expect(await dialog.findByRole("list")).toHaveTextContent("Design Class Diagram");
    expect(dialog.getByRole("button", { name: "Confirm retry" })).toBeEnabled();
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(mocks.retryProjectRun).not.toHaveBeenCalled();
  });

  it("filters rule extraction separately from requirement model generation", async () => {
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={runs} members={[]} /></AppI18nProvider>);
    await user.click(screen.getByRole("combobox", { name: "筛选阶段" }));
    await user.click(await screen.findByRole("option", { name: "生成需求模型" }));
    const table = within(screen.getByRole("table"));
    expect(table.getAllByRole("row")).toHaveLength(2);
    expect(table.getByText("生成需求模型")).toBeInTheDocument();
    expect(table.queryByText("提取需求规则")).not.toBeInTheDocument();
  });

  it("shows fixed-k run totals, partial reports, and unreported history in its own column", () => {
    const historyRuns = [
      { ...runs[0]!, tokenConsumption: tokenConsumption({ totalTokens: 250 }) },
      { ...runs[1]!, tokenConsumption: tokenConsumption({ unreportedCalls: 1 }) },
      { ...runs[2]!, tokenConsumption: tokenConsumption({ totalTokens: 1_000_000 }) },
      runs[3]!,
    ];
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={historyRuns} members={[]} /></AppI18nProvider>);
    expect(screen.getByRole("columnheader", { name: "Token 消耗" })).toBeInTheDocument();
    const row = (id: string) => within(screen.getByRole("button", { name: `查看运行记录 ${id}` }).closest("tr")!);
    expect(row("running").getByText("0.25k")).toBeInTheDocument();
    expect(row("failed").getByText("5.7k")).toBeInTheDocument();
    expect(row("failed").getByText("部分用量")).toBeInTheDocument();
    expect(row("completed").getByText("1000k")).toBeInTheDocument();
    expect(row("feasibility").getByText("未报告")).toBeInTheDocument();
    expect(row("feasibility").queryByText("0k")).not.toBeInTheDocument();
  });

  it("loads this run's latest consumption and marks incomplete totals and dimensions", async () => {
    const run = { ...runs[4]!, tokenConsumption: tokenConsumption({ totalTokens: 250 }) };
    mocks.getProjectRun.mockResolvedValue({ run: { ...run, tokenConsumption: tokenConsumption({ unreportedCalls: 1 }) } });
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={[run]} members={[]} /></AppI18nProvider>);
    await user.click(screen.getByRole("button", { name: `查看运行记录 ${run.runId}` }));
    const dialog = within(await screen.findByRole("dialog", { name: "运行详情" }));
    const tokens = within(dialog.getByRole("region", { name: "Token 消耗" }));
    await waitFor(() => expect(tokens.getByText("总消耗").parentElement).toHaveTextContent("5.7k"));
    expect(tokens.getByText("输入").parentElement).toHaveTextContent("4k");
    expect(tokens.getByText("输出").parentElement).toHaveTextContent("1.7k");
    expect(tokens.getByText("缓存输入").parentElement).toHaveTextContent("0.5k");
    expect(tokens.getByText("推理").parentElement).toHaveTextContent("0.3k");
    expect(tokens.getByText("部分用量")).toBeInTheDocument();
    expect(tokens.getByText("模型调用：3 次")).toBeInTheDocument();
    expect(tokens.getByText(/有 1 次模型调用未完整报告用量/)).toBeInTheDocument();
    expect(tokens.getByText("1k = 1000 Token。")).toBeInTheDocument();
  });

  it("keeps legacy run consumption explicitly unreported in details", async () => {
    const dialog = await openDetail(runs[4]!);
    const tokens = within(dialog.getByRole("region", { name: "Token 消耗" }));
    expect(tokens.getAllByText("未报告")).toHaveLength(5);
    expect(tokens.queryByText("0k")).not.toBeInTheDocument();
    expect(tokens.queryByText("部分用量")).not.toBeInTheDocument();
  });

  it("localizes usage labels and incomplete reports while retaining the fixed k unit", async () => {
    localStorage.setItem("uml-lab-locale-preference", "en");
    const run = { ...runs[4]!, tokenConsumption: tokenConsumption({ totalTokens: 1_000_000, outputTokens: null, calls: 1, unreportedCalls: 1 }) };
    mocks.getProjectRun.mockResolvedValue({ run });
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={[run]} members={[]} /></AppI18nProvider>);
    expect(await screen.findByRole("columnheader", { name: "Token consumption" })).toBeInTheDocument();
    expect(screen.getByText("1000k")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `View run record ${run.runId}` }));
    const dialog = within(await screen.findByRole("dialog", { name: "Run details" }));
    const tokens = within(dialog.getByRole("region", { name: "Token consumption" }));
    expect(tokens.getByText("Total").parentElement).toHaveTextContent("1000k");
    expect(tokens.getByText("Output").parentElement).toHaveTextContent("Not reported");
    expect(tokens.getByText("Partial usage")).toBeInTheDocument();
    expect(tokens.getByText(/Calls with incomplete usage reports: 1/)).toBeInTheDocument();
  });

  it("does not delete an active run and preserves a record when deletion fails", async () => {
    mocks.deleteProjectRun.mockRejectedValue(new Error("删除失败"));
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={runs} members={[]} /></AppI18nProvider>);
    await user.click(screen.getByRole("button", { name: "删除运行记录 running" }));
    expect(mocks.deleteProjectRun).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "删除运行记录 failed" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "删除运行记录 failed" })).toBeEnabled());
    expect(mocks.deleteRunHistory).not.toHaveBeenCalled();
  });

  it("shows accepted model titles and diagram errors, excluding inherited inputs", async () => {
    const dialog = await openDetail(runs[4]!, {
      selectedDiagrams: ["usecase"],
      outputManifest: [{ kind: "model", id: "usecase-booking" }],
      models: [{ diagramKind: "usecase", modelId: "usecase-booking", title: "预约用例" }, { diagramKind: "class", title: "旧领域模型" }],
      diagramErrors: { usecase: { stage: "render_svg", error: { code: "RUN_RENDER_FAILED", message: "PlantUML 第 8 行语法错误" } } },
    });
    expect(dialog.getByText("用例模型 · 预约用例")).toBeInTheDocument();
    expect(dialog.queryByText(/usecase-booking/)).not.toBeInTheDocument();
    expect(dialog.queryByText(/旧领域模型/)).not.toBeInTheDocument();
    expect(dialog.getByText("用例模型 · 图形渲染失败，请检查模型结果后重试。")).toBeInTheDocument();
    expect(dialog.queryByText(/render_svg|RUN_RENDER_FAILED|PlantUML 第 8 行/)).not.toBeInTheDocument();
  });

  it("shows business use-case names and localized failures instead of internal design diagnostics", async () => {
    const error = { code: "PLATFORM_PROVIDER_UNAVAILABLE", message: "private provider response", category: "platform_provider", retryable: true };
    const dialog = await openDetail({ ...runs[1]!, error, errorMessage: "PLATFORM_PROVIDER_UNAVAILABLE: private provider response" } as PlatformRunSummary, {
      selectedDiagrams: ["sequence"], error,
      requirementModels: [{ diagramKind: "usecase", useCases: [{ id: "UC-DIAL", name: "拨号" }, { id: "UC-ALARM-PHONE", name: "电话报警" }] }],
      models: [], outputManifest: [],
      diagramErrors: {
        "sequence:UC-DIAL": { stage: "generate_design_sequence", error },
        "sequence:UC-ALARM-PHONE": { stage: "generate_design_sequence", error },
      },
    });
    expect(dialog.getByText("当前模型服务暂不可用，请稍后重试。")).toBeInTheDocument();
    expect(dialog.getByText("用例实现设计：拨号 · 当前模型服务暂不可用，请稍后重试。")).toBeInTheDocument();
    expect(dialog.getByText("用例实现设计：电话报警 · 当前模型服务暂不可用，请稍后重试。")).toBeInTheDocument();
    expect(dialog.queryByText(/PLATFORM_PROVIDER_UNAVAILABLE|generate_design_sequence|sequence:UC-|private provider/)).not.toBeInTheDocument();
  });

  it("keeps current structured failures readable without requiring a snapshot", async () => {
    const dialog = await openDetail({ ...runs[1]!, error: { code: "PLATFORM_PROVIDER_UNAVAILABLE", category: "platform_provider", retryable: true, message: "private provider response" },
      errorMessage: null,
      diagramErrorSummary: [
        { diagramId: "sequence:UC-DIAL", stage: "generate_design_sequence", error: { code: "PLATFORM_PROVIDER_UNAVAILABLE", category: "platform_provider", retryable: true, message: "private provider response" }, message: "private provider response" },
        { diagramId: "old-model-identifier", stage: "unknown_internal_stage", message: "SQL stack trace" },
      ],
    });
    expect(dialog.getByText("当前模型服务暂不可用，请稍后重试。")).toBeInTheDocument();
    expect(dialog.getByText("用例实现设计 · 当前模型服务暂不可用，请稍后重试。")).toBeInTheDocument();
    expect(dialog.getByText("项目生成任务 · 生成任务失败，请稍后重试。")).toBeInTheDocument();
    expect(dialog.queryByText(/PLATFORM_PROVIDER_UNAVAILABLE|generate_design_sequence|sequence:UC-|private provider|old-model-identifier|unknown_internal_stage|SQL stack/)).not.toBeInTheDocument();
  });

  it("shows generated rules without inherited rules", async () => {
    const dialog = await openDetail({ ...runs[0]!, status: "completed" }, {
      rules: [{ id: "R1", text: "用户可以预约" }, { id: "R0", text: "旧规则" }],
      outputManifest: [{ kind: "rule", id: "R1" }],
    });
    expect(dialog.getByText("R1 · 用户可以预约")).toBeInTheDocument();
    expect(dialog.queryByText(/旧规则/)).not.toBeInTheDocument();
    expect(dialog.getByText("未记录错误。")).toBeInTheDocument();
  });

  it("shows document kind, generated filename, sections and missing artifacts", async () => {
    const dialog = await openDetail(runs[2]!, {
      documentKind: "requirementsSpec", fileName: "预约系统需求规格说明书.docx",
      sections: [{ title: "功能需求" }], missingArtifacts: ["用例模型"],
      outputManifest: [{ kind: "document", id: "doc-1" }],
    });
    expect(dialog.getByText("需求规格说明书")).toBeInTheDocument();
    expect(dialog.getByText("预约系统需求规格说明书.docx")).toBeInTheDocument();
    expect(dialog.getByText("功能需求")).toBeInTheDocument();
    expect(dialog.getByText("缺失产物：用例模型")).toBeInTheDocument();
  });

  it("shows feasibility targets and only accepted results", async () => {
    const dialog = await openDetail(runs[3]!, {
      selectedArtifacts: ["context", "implementation"], contextModel: {}, implementationPlan: {},
      outputManifest: [{ kind: "context", id: "context" }],
      error: { code: "RUN_CANCELLED", message: "用户取消生成实现方案" },
    });
    expect(dialog.getByText("系统环境图、实现方案")).toBeInTheDocument();
    expect(dialog.getByRole("list")).toHaveTextContent("系统环境图");
    expect(dialog.getByRole("list")).not.toHaveTextContent("实现方案");
    expect(dialog.getByText("任务已取消。")).toBeInTheDocument();
    expect(dialog.queryByText(/RUN_CANCELLED/)).not.toBeInTheDocument();
  });

  it("uses safe guidance for legacy errors without a recognizable code", async () => {
    const dialog = await openDetail({ ...runs[1]!, error: null, errorMessage: "上游连接失败：request-123" });
    expect(dialog.getByText("生成任务失败，请稍后重试。")).toBeInTheDocument();
    expect(dialog.queryByText(/上游连接失败|request-123/)).not.toBeInTheDocument();
    expect(dialog.getByText("此记录未保存详细快照。")).toBeInTheDocument();
  });

  it("translates history failures when English is selected", async () => {
    localStorage.setItem("uml-lab-locale-preference", "en");
    const dialog = await openDetail({ ...runs[1]!, error: { code: "PLATFORM_PROVIDER_UNAVAILABLE",
      message: "当前模型服务暂不可用，请稍后重试。", category: "platform_provider", retryable: true },
      diagramErrorSummary: [{ diagramId: "sequence:UC-DIAL", stage: "generate_design_sequence", message: "PLATFORM_PROVIDER_UNAVAILABLE: private response" }],
    });
    expect(dialog.getByText("The model service is temporarily unavailable. Try again later.")).toBeInTheDocument();
    expect(dialog.queryByText(/PLATFORM_PROVIDER_UNAVAILABLE|generate_design_sequence|sequence:UC-DIAL|当前模型服务/)).not.toBeInTheDocument();
  });

  it("allows retrying a failed detail request without running generation", async () => {
    mocks.getProjectRun.mockRejectedValueOnce(new Error("详情服务不可用"));
    const user = userEvent.setup();
    render(<AppI18nProvider><ProjectHistory projectId="project" initialRuns={[runs[2]!]} members={[]} /></AppI18nProvider>);
    await user.click(screen.getByRole("button", { name: "查看运行记录 completed" }));
    await user.click(await screen.findByRole("button", { name: "重新加载详情" }));
    await waitFor(() => expect(screen.getByText("此记录未保存详细快照。")).toBeInTheDocument());
    expect(mocks.getProjectRun).toHaveBeenCalledTimes(2);
    expect(mocks.deleteProjectRun).not.toHaveBeenCalled();
  });
});
