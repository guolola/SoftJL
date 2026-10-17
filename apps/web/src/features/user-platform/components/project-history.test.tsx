// Verifies history categories, shared icon actions, and per-run output/error inspection.
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import type { PlatformRunSummary, PlatformRunTokenConsumption } from "../services/platform-api";
import { ProjectHistory } from "./project-history";

const mocks = vi.hoisted(() => ({
  deleteProjectRun: vi.fn(),
  deleteRunHistory: vi.fn(),
  getProjectRun: vi.fn(),
}));
vi.mock("../services/platform-api", () => ({
  platformApi: { deleteProjectRun: mocks.deleteProjectRun, getProjectRun: mocks.getProjectRun },
}));
vi.mock("../../workspace-session/state", () => ({
  useWorkspaceSession: () => ({ deleteRunHistory: mocks.deleteRunHistory }),
}));

const runs: PlatformRunSummary[] = [
  { runId: "running", status: "running", stage: "extract_rules", runKind: "requirements" },
  { runId: "failed", status: "failed", stage: "render_svg", runKind: "design",
    sourceRunId: "original-run", sourceAction: "retry", latestActionRunId: "retried-run", latestAction: "retry",
    error: { code: "RUN_INTERNAL_ERROR", message: "任务未完成", category: "internal", retryable: true } },
  { runId: "completed", status: "completed", stage: "generate_document_text",
    runKind: "document", documentKind: "requirementsSpec", snapshotAvailable: true,
    documentDownloadAvailable: true },
  { runId: "feasibility", status: "cancelled", stage: "generate_business_flow", runKind: "feasibility" },
  { runId: "models", status: "completed", stage: "verify_diagram_visual", runKind: "requirements", selectedDiagrams: ["usecase"] },
  { runId: "other", status: "completed", stage: "generate_tests", runKind: "test" },
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
  });

  it.each(["page", "drawer"] as const)("shows five operations and only view/delete icons in %s layout", async (layout) => {
    const user = userEvent.setup();
    render(<AppI18nProvider>
      <ProjectHistory projectId="project" initialRuns={runs} members={[]} layout={layout} />
    </AppI18nProvider>);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(6);
    expect(within(rows[1]!).getByRole("button", { name: "删除运行记录 running" })).toBeDisabled();
    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole("button")).toHaveLength(2);
      expect(within(row).getAllByRole("button").map((button) => button.textContent)).toEqual(["", ""]);
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
    expect(within(dialog).getByText("RUN_INTERNAL_ERROR：任务未完成")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: `查看运行记录 ${run.runId}` }));
    await waitFor(() => expect(screen.queryByText("正在加载运行详情…")).not.toBeInTheDocument());
    return within(screen.getByRole("dialog"));
  }

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
    expect(dialog.getByText(/PlantUML 第 8 行语法错误/)).toBeInTheDocument();
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
    expect(dialog.getByText("RUN_CANCELLED：用户取消生成实现方案")).toBeInTheDocument();
  });

  it("keeps the original errorMessage when there is no structured error", async () => {
    const dialog = await openDetail({ ...runs[1]!, error: null, errorMessage: "上游连接失败：request-123" });
    expect(dialog.getByText("上游连接失败：request-123")).toBeInTheDocument();
    expect(dialog.getByText("此记录未保存详细快照。")).toBeInTheDocument();
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
