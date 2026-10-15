// Verifies sidebar navigation, diagram status trees, queued task visibility, and workspace tab interactions.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { floatingAlert as toast } from "../../../shared/ui/floating-alert";
import { feasibilityImplementationPlanSchema } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRequirementBaseline,
  createBusinessFlowArtifact,
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { useWorkspaceSession } from "../../workspace-session/state";
import { useWorkspaceShell } from "../state";
import { SidebarMenu } from "./sidebar-menu";
import { useSidebar } from "../../../shared/ui/sidebar";

function ProjectNavigationHarness({ onOpen }: { onOpen: (section: string) => void }) {
  const { setOpen, setOpenMobile, openMobile } = useSidebar();
  return <>
    <button onClick={() => setOpen(false)}>折叠侧栏</button>
    <button onClick={() => setOpenMobile(true)}>打开手机侧栏</button>
    <output data-testid="mobile-open">{String(openMobile)}</output>
    <SidebarMenu activeProjectSection="settings" onOpenProjectSection={onOpen} />
  </>;
}

function TabsProbe() {
  const { openTabs, closeWorkspaceTab } = useWorkspaceShell();
  return (
    <div>
      {openTabs.map((tab) => (
        <button key={tab.id} type="button" onClick={() => closeWorkspaceTab(tab.id)}>
          关闭 {tab.label}
        </button>
      ))}
    </div>
  );
}

function BusinessFlowMenuHarness() {
  const { syncFeasibilityArtifacts } = useWorkspaceSession();
  return <><SidebarMenu /><button onClick={() => syncFeasibilityArtifacts(createWorkspaceRecord({
    rules: [createRule()], feasibilityBusinessFlow: createBusinessFlowArtifact(),
  }))}>保存流程图</button></>;
}

function BusinessFlowNavigationProbe() {
  const { selection, openTabs } = useWorkspaceShell();
  return <><SidebarMenu /><output data-testid="flow-selection">{JSON.stringify(selection)}</output>
    <output data-testid="flow-tabs">{openTabs.map((tab) => tab.id).join(",")}</output></>;
}

const { toastMessage } = vi.hoisted(() => ({
  toastMessage: vi.fn(),
}));

vi.mock("../../../shared/ui/floating-alert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/ui/floating-alert")>();
  return { ...actual, floatingAlert: {
    ...actual.floatingAlert,
    message: toastMessage,
    success: vi.fn(),
    error: vi.fn(),
  } };
});

function SidebarDesignGenerationHarness() {
  const { generateDesignDiagrams } = useWorkspaceSession();
  return (
    <>
      <SidebarMenu />
      <TabsProbe />
      <button type="button" onClick={() => void generateDesignDiagrams(["class"])}>
        生成设计类图
      </button>
    </>
  );
}

function storeManagedUserSettings() {
  localStorage.setItem(
    "uml-lab-settings",
    JSON.stringify({
      providerConfigId: "provider-config-1",
      defaultModel: "gpt-5.5",
      providerModelOptions: ["gpt-5.5"],
      imageModel: "nano-banana-pro",
      fontSize: "md",
      autoGenerate: false,
      showStaleBanner: true,
    }),
  );
}

async function confirmGenerationIfPresent(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen
    .findByRole("dialog", { name: /确认生成/u }, { timeout: 250 })
    .catch(() => null);
  if (!dialog) return;
  await user.click(within(dialog).getByRole("button", { name: "确认生成" }));
}

function createSidebarRepository(
  workspace = createWorkspaceRecord(),
): WorkspaceRepository {
  return {
    loadWorkspace: vi.fn(async () => workspace),
    updateRequirementText: vi.fn(async () => {}),
    startRun: vi.fn(),
    subscribeToRun: vi.fn(),
    getRunSnapshot: vi.fn(),
    renderPlantUml: vi.fn(),
    testProviderSettings: vi.fn(),
    saveRunHistory: vi.fn(),
    listRunHistory: vi.fn(async () => []),
    restoreRunHistory: vi.fn(async () => null),
    deleteRunHistory: vi.fn(async () => []),
    clearRunHistory: vi.fn(async () => {}),
  };
}

function SidebarSequenceGenerationHarness() {
  const { generateDesignDiagrams } = useWorkspaceSession();
  return (
    <>
      <SidebarMenu />
      <TabsProbe />
      <button type="button" onClick={() => void generateDesignDiagrams(["sequence"])}>
        生成用例实现设计
      </button>
    </>
  );
}

describe("SidebarMenu", () => {
  it.each([1440, 390])("keeps project management accessible at viewport %s and closes mobile navigation", async width => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    try {
      const user = userEvent.setup();
      const onOpen = vi.fn();
      render(withWorkspaceProviders(<ProjectNavigationHarness onOpen={onOpen} />, createSidebarRepository()));
      const navigation = screen.getByRole("navigation", { name: "项目导航" });
      expect(screen.getByText("项目管理")).toBeInTheDocument();
      expect(within(navigation).getByRole("button", { name: "项目设置" })).toHaveAttribute("aria-current", "page");
      expect(within(navigation).getByRole("button", { name: "系统需求" })).not.toHaveAttribute("data-active");
      await user.click(screen.getByRole("button", { name: "折叠侧栏" }));
      await user.click(screen.getByRole("button", { name: "打开手机侧栏" }));
      expect(screen.getByTestId("mobile-open")).toHaveTextContent("true");
      await user.click(within(navigation).getByRole("button", { name: "运行历史" }));
      expect(onOpen).toHaveBeenCalledWith("history");
      expect(screen.getByTestId("mobile-open")).toHaveTextContent("false");
      expect(within(navigation).getByRole("button", { name: "文档中心" })).toBeInTheDocument();
      expect(within(navigation).getByRole("button", { name: "说明书" })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
    }
  });
  it("navigates business-flow traceability, element groups and relationships with their own tab identities", async () => {
    const user = userEvent.setup();
    const repository = createSidebarRepository(createWorkspaceRecord({ rules: [createRule()], feasibilityBusinessFlow: createBusinessFlowArtifact() }));
    render(withWorkspaceProviders(<BusinessFlowNavigationProbe />, repository));
    await user.click(await screen.findByRole("button", { name: "展开 可行性分析" }));
    await user.click(screen.getByRole("button", { name: "展开 业务流程图" }));
    await user.click(screen.getByRole("button", { name: "跟踪矩阵" }));
    expect(screen.getByTestId("flow-selection")).toHaveTextContent('"kind":"feasibility-business-flow-trace"');
    await user.click(screen.getByRole("button", { name: /^元素/ }));
    expect(screen.getByTestId("flow-selection")).toHaveTextContent('"kind":"feasibility-business-flow-elements"');
    await user.click(screen.getByRole("button", { name: "展开 元素" }));
    await user.click(screen.getByRole("button", { name: "展开 活动" }));
    await user.click(screen.getByRole("button", { name: "处理业务" }));
    expect(screen.getByTestId("flow-selection")).toHaveTextContent('"kind":"feasibility-business-flow-element"');
    expect(screen.getByTestId("flow-selection")).toHaveTextContent('"elementId":"process"');
    await user.click(screen.getByRole("button", { name: /^关系/ }));
    expect(screen.getByTestId("flow-selection")).toHaveTextContent('"kind":"feasibility-business-flow-relations"');
    await user.click(screen.getByRole("button", { name: "展开 关系" }));
    await user.click(screen.getByRole("button", { name: /开始.*处理业务/ }));
    expect(screen.getByTestId("flow-selection")).toHaveTextContent('"kind":"feasibility-business-flow-relationship"');
    expect(screen.getByTestId("flow-tabs")).toHaveTextContent("feasibility:business-flow");
    expect(screen.getByTestId("flow-tabs")).not.toHaveTextContent("requirements:");
  });

  beforeEach(() => {
    storeManagedUserSettings();
    vi.mocked(toast.message).mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders the project workspace navigation root", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
    render(
      withWorkspaceProviders(
        <SidebarMenu />,
        repository,
      ),
    );

    expect(await screen.findByRole("navigation", { name: "项目导航" })).toHaveClass("h-full", "w-full");
    expect(screen.getByText("项目导航")).toHaveAttribute("data-slot", "sidebar-group-label");
    expect(screen.queryByRole("button", { name: "项目首页" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "系统需求" })).toHaveAttribute("data-slot", "sidebar-menu-button");
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter(Boolean),
    ).toEqual(["系统需求", "可行性分析", "需求模型", "设计模型", "测试", "说明书"]);
    expect(screen.queryByRole("button", { name: "展开 可行性分析" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "业务流程图" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "系统环境图" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "实现方案" })).not.toBeInTheDocument();
  });

  it("shows business flow only after complete persistence, retains it on reload, and clears it on project switch", async () => {
    const user = userEvent.setup();
    const partial = createBusinessFlowArtifact();
    partial.svg.svg = "";
    const repository = createSidebarRepository(createWorkspaceRecord({ feasibilityBusinessFlow: partial }));
    const { rerender } = render(<div key="project-a">{withWorkspaceProviders(<BusinessFlowMenuHarness />, repository)}</div>);
    await screen.findByRole("navigation", { name: "项目导航" });
    expect(screen.queryByRole("button", { name: "展开 可行性分析" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存流程图" }));
    await user.click(await screen.findByRole("button", { name: "展开 可行性分析" }));
    expect(screen.getByRole("button", { name: "业务流程图" })).toBeInTheDocument();

    const persisted = createWorkspaceRecord({ rules: [createRule()], feasibilityBusinessFlow: createBusinessFlowArtifact() });
    persisted.feasibilityBusinessFlow!.fingerprint = "stale";
    rerender(<div key="project-a-reloaded">{withWorkspaceProviders(<SidebarMenu />, createSidebarRepository(persisted))}</div>);
    await user.click(await screen.findByRole("button", { name: "展开 可行性分析" }));
    expect(screen.getByRole("button", { name: /^业务流程图/u })).toHaveTextContent("已过时");

    rerender(<div key="project-b">{withWorkspaceProviders(<SidebarMenu />, createSidebarRepository())}</div>);
    await screen.findByRole("navigation", { name: "项目导航" });
    expect(screen.queryByRole("button", { name: /^业务流程图/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "展开 可行性分析" })).not.toBeInTheDocument();
  });

  it("keeps an existing flow visible with a failed regeneration status", async () => {
    const user = userEvent.setup();
    const repository = createSidebarRepository(createWorkspaceRecord({ rules: [createRule()], feasibilityBusinessFlow: createBusinessFlowArtifact() }));
    render(withWorkspaceProviders(<SidebarMenu projectRuns={[{
      runId: "failed-flow", runKind: "feasibility", status: "failed", stage: "render_business_flow", createdAt: "2026-09-23T00:00:00.000Z",
    }]} />, repository));
    await user.click(await screen.findByRole("button", { name: "展开 可行性分析" }));
    expect(screen.getByRole("button", { name: /^业务流程图/u })).toBeInTheDocument();
    expect(screen.getByLabelText(/业务流程图.*失败/u)).toBeInTheDocument();
  });

  it("reveals feasibility artifact menus only after the corresponding artifacts exist", async () => {
    const user = userEvent.setup();
    const implementationPlan = feasibilityImplementationPlanSchema.parse({
      overview: "采用模块化实现。",
      candidates: [
        { id: "candidate-1", name: "模块化方案", summary: "按模块实施。", estimatedCost: "待确认", estimatedSchedule: "待确认", sourceRequirementIds: ["R1"] },
        { id: "candidate-2", name: "服务化方案", summary: "按服务实施。", estimatedCost: "待确认", estimatedSchedule: "待确认", sourceRequirementIds: ["R1"] },
      ],
      recommendedCandidateId: "candidate-1",
      recommendationRationale: "满足当前规则。",
      architecture: { summary: "分层架构。", modules: [{ id: "module-1", name: "核心模块", responsibility: "实现核心规则。", sourceRequirementIds: ["R1"] }] },
      dataStrategy: { summary: "统一数据定义。", sourceRequirementIds: ["R1"] },
      deploymentAndOperations: { summary: "建立部署与回滚流程。", sourceRequirementIds: ["R1"] },
      securityAndCompliance: { summary: "执行最小权限。", sourceRequirementIds: ["R1"] },
      milestones: [{ id: "milestone-1", name: "首期交付", timeframe: "待确认", acceptanceCriteria: ["规则通过验收"], sourceRequirementIds: ["R1"] }],
      verdicts: [
        { category: "technical", verdict: "conditional", rationale: "待验证。" },
        { category: "operational", verdict: "conditional", rationale: "待验证。" },
        { category: "schedule", verdict: "unknown", rationale: "待确认。" },
        { category: "economic", verdict: "unknown", rationale: "待确认。" },
        { category: "legal", verdict: "unknown", rationale: "待确认。" },
      ],
      decision: "conditional-go",
    });
    const repository = createSidebarRepository(
      createWorkspaceRecord({
        feasibilityContextModel: {
          diagramKind: "context",
          modelId: "context",
          title: "系统环境图",
          summary: "系统边界",
          notes: [],
          system: { id: "system", name: "目标系统", sourceRequirementIds: [] },
          people: [{ id: "person-1", name: "用户", sourceRequirementIds: ["R1"] }],
          externalSystems: [],
          relationships: [{ id: "relationship-1", sourceId: "person-1", targetId: "system", direction: "directed", label: "使用", sourceRequirementIds: ["R1"] }],
        },
        feasibilityContextPlantUml: "@startuml\n@enduml",
        feasibilityContextSvg: "<svg></svg>",
        feasibilityImplementationPlan: implementationPlan,
      }),
    );

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    const feasibilityMenu = await screen.findByRole("button", { name: "可行性分析" });
    const feasibilityToggle = screen.getByRole("button", { name: "展开 可行性分析" });
    expect(feasibilityMenu).not.toHaveAttribute("aria-expanded");
    expect(feasibilityToggle).toHaveAttribute("aria-expanded", "false");
    await user.click(feasibilityMenu);
    expect(feasibilityMenu).toHaveAttribute("data-active");
    expect(feasibilityToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "系统环境图" })).not.toBeInTheDocument();

    await user.click(feasibilityToggle);
    expect(feasibilityToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "系统环境图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "实现方案" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "跟踪矩阵" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开 系统环境图" }));
    expect(screen.getByRole("button", { name: "跟踪矩阵" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "元素" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关系" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "系统边界" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开 元素" }));
    expect(screen.getByRole("button", { name: "系统边界" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "角色" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开 系统边界" }));
    expect(screen.getByRole("button", { name: "目标系统" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开 角色" }));
    const personNode = screen.getByRole("button", { name: "用户" });
    await user.click(personNode);
    expect(personNode).toHaveAttribute("data-active");

    await user.click(screen.getByRole("button", { name: "展开 关系" }));
    const relationshipNode = screen.getByRole("button", { name: "使用" });
    await user.click(relationshipNode);
    expect(relationshipNode).toHaveAttribute("data-active");

    await user.click(screen.getByRole("button", { name: "展开 实现方案" }));
    expect(screen.getByRole("button", { name: "模块化方案" })).toBeInTheDocument();
    const candidateNode = screen.getByRole("button", { name: "服务化方案" });
    await user.click(candidateNode);
    expect(candidateNode).toHaveAttribute("data-active");
  });

  it("projects active server requirement runs into sidebar status after reload", async () => {
    const user = userEvent.setup();
    const repository = createSidebarRepository();

    render(
      withWorkspaceProviders(
        <SidebarMenu
          projectRuns={[
            {
              runId: "server-requirements-active",
              status: "running",
              stage: "generate_models",
              runKind: "requirements",
              selectedDiagrams: ["usecase"],
            },
          ]}
        />,
        repository,
      ),
    );

    expect(await screen.findByLabelText("需求模型链路生成中")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开 需求模型" }));
    expect(screen.getByLabelText("用例模型生成中")).toBeInTheDocument();
  });

  it("nests database columns under their parent table in design navigation", async () => {
    const repository = createSidebarRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["table"],
        designModels: {
          table: {
            diagramKind: "table",
            title: "数据库设计",
            summary: "座位预约表结构",
            notes: [],
            tables: [
              {
                id: "tbl_user",
                name: "user",
                columns: [
                  {
                    id: "user_id",
                    name: "user_id",
                    dataType: "varchar(64)",
                    isPrimaryKey: true,
                    isForeignKey: false,
                    nullable: false,
                  },
                ],
              },
            ],
            relationships: [],
          },
        },
        designSvgArtifacts: {
          table: {
            diagramKind: "table",
            svg: "<svg><text>tbl_user</text><text>user_id : varchar(64)</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    const user = userEvent.setup();
    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await user.click(await screen.findByRole("button", { name: "展开 设计模型" }));
    await user.click(screen.getByRole("button", { name: "展开 数据库设计" }));
    await user.click(screen.getByRole("button", { name: "展开 元素" }));
    await user.click(screen.getByRole("button", { name: "展开 表" }));
    await user.click(screen.getByRole("button", { name: "展开 user" }));

    expect(screen.getByRole("button", { name: "user_id" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "字段" })).not.toBeInTheDocument();
  });

  it("hides orphan use-case scoped models and structured-only analysis entries", async () => {
    const repository = createSidebarRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase", "analysis"],
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例模型",
            summary: "当前只有一个用例",
            notes: [],
            actors: [],
            useCases: [
              {
                id: "uc-1",
                name: "查询座位",
                goal: "查询座位状态",
                preconditions: [],
                postconditions: [],
                supportingActorIds: [],
                eventFlows: [],
              },
            ],
            systemBoundaries: [],
            relationships: [],
          },
          "analysis:uc-1": {
            diagramKind: "analysis",
            modelId: "analysis:uc-1",
            sourceUseCaseId: "uc-1",
            sourceUseCaseName: "查询座位",
            title: "查询座位需求分析模型",
            summary: "结构化但未渲染",
            notes: [],
            participants: [],
            messages: [],
            fragments: [],
          },
          "analysis:uc-2": {
            diagramKind: "analysis",
            modelId: "analysis:uc-2",
            sourceUseCaseId: "uc-2",
            sourceUseCaseName: "预约座位",
            title: "预约座位需求分析模型",
            summary: "孤儿模型",
            notes: [],
            participants: [],
            messages: [],
            fragments: [],
          },
        },
        generatedDesignDiagramTypes: ["sequence"],
        designModels: {
          "sequence:uc-1": {
            diagramKind: "sequence",
            modelId: "sequence:uc-1",
            sourceUseCaseId: "uc-1",
            sourceUseCaseName: "查询座位",
            title: "查询座位用例实现设计",
            summary: "有效实现设计",
            notes: [],
            participants: [],
            messages: [],
            fragments: [],
          },
          "sequence:uc-2": {
            diagramKind: "sequence",
            modelId: "sequence:uc-2",
            sourceUseCaseId: "uc-2",
            sourceUseCaseName: "预约座位",
            title: "预约座位用例实现设计",
            summary: "孤儿实现设计",
            notes: [],
            participants: [],
            messages: [],
            fragments: [],
          },
        },
        designSvgArtifacts: {
          "sequence:uc-1": {
            diagramKind: "sequence",
            modelId: "sequence:uc-1",
            svg: "<svg><text>查询座位</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
          "sequence:uc-2": {
            diagramKind: "sequence",
            modelId: "sequence:uc-2",
            svg: "<svg><text>预约座位</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    const user = userEvent.setup();
    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await user.click(await screen.findByRole("button", { name: "展开 需求模型" }));
    expect(screen.queryByText("需求分析模型")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开 设计模型" }));
    expect(screen.getByText("查询座位")).toBeInTheDocument();
    expect(screen.queryByText("预约座位")).not.toBeInTheDocument();
  });

  it("marks failed diagrams in the navigation tree", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDiagramTypes: ["activity"],
          models: {
            activity: {
              diagramKind: "activity",
              title: "活动流程",
              summary: "失败图",
              notes: [],
              swimlanes: [],
              nodes: [],
              relationships: [],
            },
          },
          diagramErrors: {
            activity: {
              stage: "render_svg",
              error: {
                code: "RUN_RENDER_FAILED",
                message: "PlantUML repair failed for activity: Syntax Error?",
                category: "render",
                retryable: true,
              },
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "展开 需求模型" }));
    expect(await screen.findByText("总体业务流程")).toBeInTheDocument();
    expect(screen.getByLabelText("总体业务流程生成失败")).toBeInTheDocument();
    expect(screen.queryByText("历史快照")).not.toBeInTheDocument();
  });

  it("orders generated requirement diagrams by the configured requirement menu order", async () => {
    const repository = createSidebarRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: [
          "deployment",
          "usecase",
          "function",
          "prototype",
          "class",
          "analysis",
          "activity",
        ],
        models: {
          function: {
            diagramKind: "function",
            title: "功能结构图",
            summary: "功能分解",
            notes: [],
            nodes: [],
            relationships: [],
          },
          activity: {
            diagramKind: "activity",
            title: "总体业务流程",
            summary: "业务流程",
            notes: [],
            swimlanes: [],
            nodes: [],
            relationships: [],
          },
          usecase: {
            diagramKind: "usecase",
            title: "用例模型",
            summary: "系统边界",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "领域对象",
            notes: [],
            classes: [],
            interfaces: [],
            enums: [],
            relationships: [],
          },
          prototype: {
            diagramKind: "prototype",
            title: "原型界面关系",
            summary: "界面导航",
            notes: [],
            nodes: [],
            relationships: [],
          },
          deployment: {
            diagramKind: "deployment",
            title: "部署需求模型",
            summary: "部署约束",
            notes: [],
            nodes: [],
            databases: [],
            components: [],
            externalSystems: [],
            artifacts: [],
            relationships: [],
          },
          "analysis:uc": {
            diagramKind: "analysis",
            modelId: "analysis:uc",
            sourceUseCaseId: "uc",
            sourceUseCaseName: "生成模型",
            title: "生成模型需求分析模型",
            summary: "交互分析",
            notes: [],
            participants: [],
            messages: [],
            fragments: [],
          },
        },
        svgArtifacts: {
          "analysis:uc": {
            diagramKind: "analysis",
            modelId: "analysis:uc",
            svg: "<svg><text>analysis</text></svg>",
            renderMeta: { engine: "plantuml" },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "展开 需求模型" }));
    const nodeLabels = screen
      .getAllByRole("button")
      .map((button) => button.textContent?.trim())
      .filter(Boolean);

    expect(nodeLabels.indexOf("功能结构图")).toBeLessThan(nodeLabels.indexOf("总体业务流程"));
    expect(nodeLabels.indexOf("总体业务流程")).toBeLessThan(nodeLabels.indexOf("用例模型"));
    expect(nodeLabels.indexOf("用例模型")).toBeLessThan(nodeLabels.indexOf("领域概念模型"));
    expect(nodeLabels.indexOf("领域概念模型")).toBeLessThan(nodeLabels.indexOf("原型界面关系"));
    expect(nodeLabels.indexOf("原型界面关系")).toBeLessThan(nodeLabels.indexOf("部署需求模型"));
    expect(nodeLabels.indexOf("部署需求模型")).toBeLessThan(nodeLabels.indexOf("生成模型"));
  });

  it("keeps requirement rule provenance badges out of generated diagram entries", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDiagramTypes: ["usecase"],
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "用例图",
              summary: "核心用例",
              notes: [],
              actors: [],
              useCases: [],
              systemBoundaries: [],
              relationships: [],
            },
          },
          rules: [
            createRule({ id: "r1", relatedDiagrams: ["usecase"] }),
            createRule({ id: "r2", relatedDiagrams: ["usecase"] }),
            createRule({ id: "R3", relatedDiagrams: ["usecase"] }),
            createRule({ id: "r4", relatedDiagrams: ["usecase"] }),
            createRule({ id: "r5", relatedDiagrams: ["usecase"] }),
            createRule({ id: "r6", relatedDiagrams: ["usecase"] }),
            createRule({ id: "r7", relatedDiagrams: ["usecase"] }),
          ],
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await user.click(await screen.findByRole("button", { name: "展开 需求模型" }));

    expect(screen.getByText("用例模型")).toBeInTheDocument();
    expect(screen.queryByText("R1 R2 R3 +4")).not.toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps requirement page navigation separate from its disclosure control", async () => {
    const repository = createSidebarRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例模型",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
      }),
    );
    const user = userEvent.setup();

    render(
      withWorkspaceProviders(
        <>
          <SidebarMenu />
          <TabsProbe />
        </>,
        repository,
      ),
    );

    const requirementsMenu = await screen.findByRole("button", { name: "需求模型" });
    const requirementsToggle = screen.getByRole("button", { name: "展开 需求模型" });

    await user.click(requirementsMenu);

    expect(await screen.findByRole("button", { name: "关闭 需求模型" })).toBeInTheDocument();
    expect(requirementsMenu).toHaveAttribute("data-active");
    expect(requirementsToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "用例模型" })).not.toBeInTheDocument();

    await user.click(requirementsToggle);

    expect(requirementsToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "用例模型" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭 需求模型" })).toBeInTheDocument();
  });

  it("keeps design diagram upstream provenance badges out of design entries", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "用例实现设计",
              summary: "动态行为",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          },
          designSvgArtifacts: {
            sequence: {
              diagramKind: "sequence",
              svg: "<svg><text>用例实现设计</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "展开 设计模型" }));

    expect(screen.getByText("用例实现设计")).toBeInTheDocument();
    expect(screen.queryByText("用例模型")).not.toBeInTheDocument();
  });

  it("shows traceability matrix entries in requirement and design navigation", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDiagramTypes: ["usecase"],
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "用例实现设计",
              summary: "动态行为",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          },
          designSvgArtifacts: {
            sequence: {
              diagramKind: "sequence",
              svg: "<svg><text>用例实现设计</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(
      withWorkspaceProviders(
        <div>
          <SidebarMenu />
      <TabsProbe />
        </div>,
        repository,
      ),
    );

    const nav = await screen.findByRole("navigation", { name: "项目导航" });

    await userEvent.click(await within(nav).findByRole("button", { name: "展开 需求模型" }));
    expect(within(nav).queryByRole("button", { name: "需求跟踪矩阵" })).not.toBeInTheDocument();

    await userEvent.click(within(nav).getByRole("button", { name: "展开 设计模型" }));
    expect(within(nav).queryByRole("button", { name: "设计跟踪矩阵" })).not.toBeInTheDocument();
  });

  it("keeps upstream badges out of downstream design diagrams", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["class"],
          designModels: {
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "静态结构",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "展开 设计模型" }));

    expect(screen.getByRole("button", { name: "设计类图" })).toBeInTheDocument();
    expect(screen.queryByText("领域概念模型")).not.toBeInTheDocument();
    expect(screen.queryByText("用例实现设计")).not.toBeInTheDocument();
  });

  it("shows a toast when a generated design model has no SVG yet", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["class"],
          designModels: {
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "静态结构",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <div>
          <SidebarMenu />
      <TabsProbe />
        </div>,
        repository,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "展开 设计模型" }));
    expect(screen.queryByLabelText("设计类图已生成")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "设计类图" }));

    expect(toast.message).toHaveBeenCalledWith("当前只有结构化模型，SVG 尚未生成");
    expect(screen.queryByRole("button", { name: "关闭 设计类图" })).not.toBeInTheDocument();
  });

  it("does not show historical requirement models as running when only SVG is missing", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDiagramTypes: ["usecase", "class", "activity", "deployment", "prototype"],
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "用例模型",
              summary: "系统边界",
              notes: [],
              actors: [],
              useCases: [
                {
                  id: "uc_generate",
                  name: "生成模型",
                  goal: "生成设计模型",
                  preconditions: [],
                  postconditions: [],
                  supportingActorIds: [],
                },
              ],
              systemBoundaries: [],
              relationships: [],
            },
            class: {
              diagramKind: "class",
              title: "领域概念模型",
              summary: "核心实体",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
            activity: {
              diagramKind: "activity",
              title: "总体业务流程",
              summary: "业务流程",
              notes: [],
              swimlanes: [],
              nodes: [],
              relationships: [],
            },
            deployment: {
              diagramKind: "deployment",
              title: "部署需求模型",
              summary: "部署约束",
              notes: [],
              nodes: [],
              databases: [],
              components: [],
              externalSystems: [],
              artifacts: [],
              relationships: [],
            },
            prototype: {
              diagramKind: "prototype",
              title: "原型界面关系",
              summary: "界面导航",
              notes: [],
              nodes: [],
              relationships: [],
            },
          },
          svgArtifacts: {},
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "展开 需求模型" }));

    expect(screen.queryByLabelText("用例模型已生成")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("领域概念模型已生成")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("总体业务流程已生成")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("部署需求模型已生成")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("原型界面关系已生成")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("用例模型模型已生成，正在生成图像")).not.toBeInTheDocument();
  });

  it("uses the SVG-missing toast for historical completed design nodes without artifacts", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["class"],
          designModels: {},
          designSvgArtifacts: {},
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await user.click(await screen.findByRole("button", { name: "展开 设计模型" }));
    await user.click(screen.getByRole("button", { name: "设计类图" }));

    expect(toast.message).toHaveBeenCalledWith("当前只有结构化模型，SVG 尚未生成");
  });

  it("shows a warning dot on stale design diagram entries", async () => {
    const repository = createSidebarRepository(
      createWorkspaceRecord({
        requirementText: "订单需求",
        generatedDesignDiagramTypes: ["class"],
        designModels: {
          "design-class": {
            diagramKind: "class",
            modelId: "design-class",
            title: "设计类图",
            summary: "静态结构",
            notes: [],
            classes: [
              {
                id: "order-service",
                name: "OrderService",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [],
          },
        },
        designSvgArtifacts: {
          "design-class": {
            diagramKind: "class",
            modelId: "design-class",
            svg: "<svg />",
            renderMeta: {
              engine: "plantuml",
              generatedAt: "2026-06-17T00:00:00.000Z",
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
        designInputFingerprints: {
          "design-class": "design-input:v1:stale",
        },
      }),
    );

    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <>
          <SidebarMenu />
      <TabsProbe />
        </>,
        repository,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "展开 设计模型" }));

    expect(
      await screen.findByTitle("此设计模型需更新"),
    ).toHaveClass("bg-warning");
  });

  it("maps design-prefixed error keys back to design diagram entries", async () => {
    const repository = createSidebarRepository(
      createWorkspaceRecord({
        designDiagramErrors: {
          "design-component": {
            stage: "generate_design_models",
            error: {
              code: "RUN_STRUCTURED_OUTPUT_INVALID",
              message: "组件关系生成失败",
              category: "generation",
              retryable: true,
            },
          },
        },
      }),
    );

    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <>
          <SidebarMenu />
      <TabsProbe />
        </>,
        repository,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "展开 设计模型" }));

    expect(screen.getByRole("button", { name: "组件（构件）关系" })).toBeInTheDocument();
    expect(screen.getByTitle("此设计图生成失败")).toHaveClass("bg-destructive");
  });

  it("keeps successful design sequence subtasks clickable when a sibling failed", async () => {
    const repository = createSidebarRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["sequence"],
        designModels: {
          "sequence:uc_view": {
            diagramKind: "sequence",
            modelId: "sequence:uc_view",
            sourceUseCaseId: "uc_view",
            sourceUseCaseName: "查看动态",
            title: "查看动态用例实现设计",
            summary: "查看动态的对象交互。",
            notes: [],
            participants: [
              { id: "actor_user", name: "用户", participantType: "actor" },
            ],
            messages: [],
            fragments: [],
          },
        },
        designSvgArtifacts: {
          "sequence:uc_view": {
            diagramKind: "sequence",
            modelId: "sequence:uc_view",
            svg: "<svg data-model-id=\"sequence:uc_view\" />",
            renderMeta: {
              engine: "plantuml",
              generatedAt: "2026-06-18T00:00:00.000Z",
              sourceLength: 32,
              durationMs: 1,
            },
          },
        },
        designDiagramErrors: {
          "sequence:uc_report": {
            stage: "generate_design_sequence",
            error: {
              code: "PLATFORM_PROVIDER_TIMEOUT",
              message: "审核举报用例实现设计超时",
              category: "platform_provider",
              retryable: true,
            },
          },
        },
      }),
    );

    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <>
          <SidebarMenu />
      <TabsProbe />
        </>,
        repository,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "展开 设计模型" }));
    await user.click(screen.getByRole("button", { name: "展开 用例实现设计（2）" }));

    await user.click(screen.getByRole("button", { name: "查看动态" }));

    expect(
      await screen.findByRole("button", { name: "关闭 查看动态" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "uc_report" })).toBeInTheDocument();
    expect(screen.getByTitle("uc_report生成失败")).toBeInTheDocument();
  });

  it("shows a failure toast for failed design nodes without opening a tab", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["class"],
          designModels: {
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "静态结构",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
          },
          designDiagramErrors: {
            class: {
              stage: "render_svg",
              error: {
                code: "RUN_RENDER_FAILED",
                message: "PlantUML 渲染失败",
                category: "render",
                retryable: true,
              },
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(
      withWorkspaceProviders(
        <div>
          <SidebarMenu />
      <TabsProbe />
        </div>,
        repository,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "展开 设计模型" }));
    expect(screen.getByLabelText("设计类图生成失败")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "设计类图" }));

    expect(toast.message).toHaveBeenCalledWith("生成失败，请查看生成任务详情");
    expect(screen.queryByRole("button", { name: "关闭 设计类图" })).not.toBeInTheDocument();
  });

  it("keeps queued design subtasks aligned with the sidebar while existing diagrams stay openable", async () => {
    let releaseRun!: () => void;
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [createRule({ id: "r1", relatedDiagrams: ["class"] })],
          requirementBaseline: createRequirementBaseline(),
          models: {
            usecase: {
              diagramKind: "usecase",
              title: "用例模型",
              summary: "系统边界",
              notes: [],
              actors: [],
              useCases: [],
              systemBoundaries: [],
              relationships: [],
            },
            class: {
              diagramKind: "class",
              title: "领域概念模型",
              summary: "核心实体",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
            "analysis:uc_generate": {
              diagramKind: "analysis",
              modelId: "analysis:uc_generate",
              sourceUseCaseId: "uc_generate",
              sourceUseCaseName: "生成模型",
              title: "生成模型需求分析模型",
              summary: "需求分析上下文",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          },
          requirementModelTraceability: [
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "uc_generate",
                elementKind: "usecase",
                label: "生成模型",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "class",
                elementId: "manual-class-context",
                elementKind: "class",
                label: "已复核设计类图上游",
              },
            },
          ],
          manualModelEditStatus: {
            usecase: {
              status: "rerendered",
              warning: null,
              editedAt: "2026-06-06T00:00:00.000Z",
              rerenderedAt: "2026-06-06T00:00:00.000Z",
            },
            class: {
              status: "rerendered",
              warning: null,
              editedAt: "2026-06-06T00:00:00.000Z",
              rerenderedAt: "2026-06-06T00:00:00.000Z",
            },
          },
          generatedDesignDiagramTypes: ["class"],
          designModels: {
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "已有静态结构",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
          },
          designSvgArtifacts: {
            class: {
              diagramKind: "class",
              svg: "<svg><text>设计类图</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(async () => ({ runId: "design-run-queued" })),
      subscribeToDesignRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({
          type: "stage_progress",
          stage: "generate_design_models",
          progress: 25,
          subtaskId: "class",
          subtaskLabel: "设计类图",
          subtaskStatus: "queued",
          queueReason: "project",
          queueAhead: 1,
          waitMs: 4_000,
          estimatedWaitMs: 20_000,
          message: "正在排队：设计类图",
        });
        await new Promise<void>((resolve) => {
          releaseRun = resolve;
        });
      }),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<SidebarDesignGenerationHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "生成设计类图" }));
    await confirmGenerationIfPresent(user);
    const designToggle = await screen.findByRole("button", {
      name: /^(展开|折叠) 设计模型$/,
    });
    if (designToggle.getAttribute("aria-label") === "展开 设计模型") {
      await user.click(designToggle);
    }

    expect(await screen.findByRole("button", { name: "设计类图" })).toBeInTheDocument();
    expect(
      screen.getByLabelText("设计类图重新生成排队中，当前图仍可查看"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("设计类图生成中")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "设计类图" }));
    expect(await screen.findByRole("button", { name: "关闭 设计类图" })).toBeInTheDocument();
    expect(toast.message).not.toHaveBeenCalled();

    releaseRun();
  });

  it.each(["usecase", "custom-usecase"])("lists sequence subtasks from usecase stored under %s and opens only rendered ones", async (modelKey) => {
    let releaseRun!: () => void;
    let emitDesignEvent!: Parameters<NonNullable<WorkspaceRepository["subscribeToDesignRun"]>>[1];
    let currentSnapshot: Awaited<ReturnType<NonNullable<WorkspaceRepository["getDesignRunSnapshot"]>>> =
      null;
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [createRule({ id: "r1", relatedDiagrams: ["usecase"] })],
          requirementBaseline: createRequirementBaseline(),
          models: {
            [modelKey]: {
              diagramKind: "usecase",
              modelId: modelKey,
              title: "用例模型",
              summary: "系统边界",
              notes: [],
              actors: [],
              useCases: [
                {
                  id: "uc_view",
                  name: "查看活动",
                  goal: "查看活动列表",
                  preconditions: [],
                  postconditions: [],
                  supportingActorIds: [],
                },
                {
                  id: "uc_create",
                  name: "创建活动",
                  goal: "创建活动",
                  preconditions: [],
                  postconditions: [],
                  supportingActorIds: [],
                },
              ],
              systemBoundaries: [],
              relationships: [],
            },
            analysis: {
              diagramKind: "analysis",
              modelId: "analysis:uc_view",
              sourceUseCaseId: "uc_view",
              sourceUseCaseName: "查看活动",
              title: "查看活动需求分析模型",
              summary: "查看活动的需求层交互",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          },
          requirementModelTraceability: [
            {
              ruleId: "r1",
              target: {
                modelId: modelKey,
                diagramKind: "usecase",
                elementId: "uc_view",
                elementKind: "usecase",
                label: "查看活动",
              },
            },
            {
              ruleId: "r1",
              target: {
                modelId: modelKey,
                diagramKind: "usecase",
                elementId: "uc_create",
                elementKind: "usecase",
                label: "创建活动",
              },
            },
          ],
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(async () => ({ runId: "design-run-sequence" })),
      subscribeToDesignRun: vi.fn(async (_runId, onEvent) => {
        emitDesignEvent = onEvent;
        onEvent({ type: "queued" });
        onEvent({
          type: "stage_progress",
          stage: "generate_design_sequence",
          progress: 5,
          diagramKind: "sequence",
          modelId: "sequence:uc_view",
          subtaskId: "sequence:uc_view",
          subtaskLabel: "用例实现设计：查看活动",
          subtaskStatus: "queued",
          message: "正在排队：查看活动",
        });
        await new Promise<void>((resolve) => {
          releaseRun = resolve;
        });
      }),
      getDesignRunSnapshot: vi.fn(async () => currentSnapshot),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<SidebarSequenceGenerationHarness />, repository));

    await user.click(await screen.findByRole("button", { name: "生成用例实现设计" }));
    await confirmGenerationIfPresent(user);
    const designToggle = await screen.findByRole("button", {
      name: /^(展开|折叠) 设计模型$/,
    });
    if (designToggle.getAttribute("aria-label") === "展开 设计模型") {
      await user.click(designToggle);
    }
    await user.click(await screen.findByRole("button", { name: "展开 用例实现设计（2）" }));

    expect(screen.getByRole("button", { name: "查看活动" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建活动" })).toBeInTheDocument();
    expect(screen.getByLabelText("查看活动生成排队中")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看活动" }));
    expect(toast.message).toHaveBeenCalledWith("生成排队中，完成后可查看");
    expect(screen.queryByRole("button", { name: "关闭 查看活动" })).not.toBeInTheDocument();

    await act(async () => {
      emitDesignEvent({
        type: "stage_progress",
        stage: "generate_design_sequence",
        progress: 45,
        diagramKind: "sequence",
        modelId: "sequence:uc_view",
        subtaskId: "sequence:uc_view",
        subtaskLabel: "用例实现设计：查看活动",
        subtaskStatus: "running",
        message: "正在生成用例实现设计：查看活动",
      });
    });
    expect(await screen.findByLabelText("查看活动生成中")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看活动" }));
    expect(toast.message).toHaveBeenLastCalledWith("正在生成图像，渲染完成后可查看");
    expect(screen.queryByRole("button", { name: "关闭 查看活动" })).not.toBeInTheDocument();

    currentSnapshot = {
      runId: "design-run-sequence",
      requirementText: "生成 UML",
      selectedDiagrams: ["sequence"],
      requestedDiagrams: ["sequence"],
      rules: [],
      requirementModels: [],
      requirementModelTraceability: [],
      models: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_view",
          sourceUseCaseId: "uc_view",
          sourceUseCaseName: "查看活动",
          title: "查看活动用例实现设计",
          summary: "查看活动流程",
          notes: [],
          participants: [],
          messages: [],
          fragments: [],
        },
      ],
      designModelTraceability: [],
      plantUml: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_view",
          source: "@startuml\n@enduml",
        },
      ],
      svgArtifacts: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_view",
          svg: "<svg><text>查看活动</text></svg>",
          renderMeta: { engine: "plantuml" },
        },
      ],
      diagramErrors: {},
      coverageMatrix: null,
      traceabilityMatrix: null,
      designTrace: [],
      currentStage: "render_svg",
      status: "running",
      error: null,
    };
    await act(async () => {
      emitDesignEvent({
        type: "artifact_ready",
        stage: "render_svg",
        artifactKind: "svg",
        diagramKind: "sequence",
        modelId: "sequence:uc_view",
        subtaskId: "sequence:uc_view",
        subtaskStatus: "completed",
      });
    });

    expect(await screen.findByLabelText("查看活动用例实现设计已生成")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看活动" }));
    expect(await screen.findByRole("button", { name: "关闭 查看活动" })).toBeInTheDocument();

    releaseRun();
  });

  it("shows element and relationship counts without design provenance badges", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "用例实现设计",
              summary: "动态行为",
              notes: [],
              participants: [
                { id: "actor", name: "用户", participantType: "actor" },
              ],
              messages: [],
              fragments: [],
            },
          },
          designSvgArtifacts: {
            sequence: {
              diagramKind: "sequence",
              svg: "<svg><text>用例实现设计</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "展开 设计模型" }));
    await userEvent.click(screen.getByRole("button", { name: "展开 用例实现设计" }));

    expect(screen.queryByText("用例模型")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "元素" }).parentElement).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "关系" }).parentElement).toHaveTextContent("0");
  });

  it("shows primary workspace entries without default secondary pages", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: [
            "component",
            "class",
            "deployment",
            "architecture",
            "navigation",
            "sequence",
            "table",
          ],
          designModels: {
            architecture: {
              diagramKind: "architecture",
              title: "总体架构图",
              summary: "包图",
              notes: [],
              packages: [],
              components: [],
              relationships: [],
            },
            sequence: {
              diagramKind: "sequence",
              title: "用例实现设计",
              summary: "动态行为",
              notes: [],
              participants: [
                { id: "actor", name: "用户", participantType: "actor" },
              ],
              messages: [],
              fragments: [],
            },
            navigation: {
              diagramKind: "navigation",
              title: "页面导航模型",
              summary: "业务逻辑流转",
              notes: [],
              nodes: [],
              relationships: [],
            },
            deployment: {
              diagramKind: "deployment",
              title: "部署设计",
              summary: "物理部署",
              notes: [],
              nodes: [],
              databases: [],
              components: [],
              externalSystems: [],
              artifacts: [],
              relationships: [],
            },
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "静态结构",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
            table: {
              diagramKind: "table",
              title: "数据库设计",
              summary: "主外键关系",
              notes: [],
              tables: [
                {
                  id: "user",
                  name: "user",
                  columns: [
                    {
                      id: "id",
                      name: "id",
                      dataType: "INT",
                      isPrimaryKey: true,
                      isForeignKey: false,
                      nullable: false,
                    },
                  ],
                },
              ],
              relationships: [],
            },
            component: {
              diagramKind: "component",
              title: "组件（构件）关系",
              summary: "组件接口依赖",
              notes: [],
              components: [],
              interfaces: [],
              relationships: [],
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    expect(await screen.findByText("设计模型")).toBeInTheDocument();
    expect(screen.queryByText("代码")).not.toBeInTheDocument();
    expect(screen.queryByText("收起侧边栏")).not.toBeInTheDocument();
    expect(screen.queryByText("文本需求")).not.toBeInTheDocument();
    expect(screen.queryByText("生成设计模型")).not.toBeInTheDocument();
    expect(screen.queryByText("用例实现设计")).not.toBeInTheDocument();

    const designToggle = screen.getByRole("button", { name: "展开 设计模型" });
    expect(designToggle).toHaveAttribute("data-sidebar", "menu-action");
    expect(designToggle).toHaveClass("peer-data-[size=default]/menu-button:top-1.5");
    expect(designToggle).not.toHaveClass("top-0");
    await userEvent.click(designToggle);

    expect(screen.getByRole("button", { name: "总体架构图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "用例实现设计" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "组件（构件）关系" })).toBeInTheDocument();
    expect(screen.queryByText("参与对象")).not.toBeInTheDocument();
    expect(screen.queryByText("业务逻辑模型")).not.toBeInTheDocument();
    expect(screen.queryByText("静态结构模型")).not.toBeInTheDocument();
    expect(screen.queryByText("物理部署设计")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "领域概念模型" })).not.toBeInTheDocument();

    const nodeLabels = screen
      .getAllByRole("button")
      .map((button) => button.textContent?.trim())
      .filter(Boolean);
    expect(nodeLabels.indexOf("总体架构图")).toBeLessThan(nodeLabels.indexOf("用例实现设计"));
    expect(nodeLabels.indexOf("用例实现设计")).toBeLessThan(nodeLabels.indexOf("设计类图"));
    expect(nodeLabels.indexOf("设计类图")).toBeLessThan(nodeLabels.indexOf("页面导航模型"));
    expect(nodeLabels.indexOf("页面导航模型")).toBeLessThan(nodeLabels.indexOf("数据库设计"));
    expect(nodeLabels.indexOf("数据库设计")).toBeLessThan(nodeLabels.indexOf("组件（构件）关系"));
    expect(nodeLabels.indexOf("组件（构件）关系")).toBeLessThan(nodeLabels.indexOf("部署设计"));
  });

  it("expands design tree one level at a time", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "用例实现设计",
              summary: "动态行为",
              notes: [],
              participants: [
                { id: "actor", name: "用户", participantType: "actor" },
              ],
              messages: [],
              fragments: [],
            },
          },
          designSvgArtifacts: {
            sequence: {
              diagramKind: "sequence",
              svg: "<svg><text>用例实现设计</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<SidebarMenu />, repository));

    expect(await screen.findByText("设计模型")).toBeInTheDocument();
    expect(screen.queryByText("用例实现设计")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 设计模型" }));

    expect(screen.getByText("用例实现设计")).toBeInTheDocument();
    expect(screen.queryByText("参与对象")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 用例实现设计" }));

    expect(screen.getByText("元素")).toBeInTheDocument();
    expect(screen.queryByText("参与对象")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 元素" }));

    expect(screen.getByText("参与对象")).toBeInTheDocument();
    expect(screen.queryByText("用户")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开 参与对象" }));

    expect(screen.getByText("用户")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "折叠 设计模型" }));

    expect(screen.queryByText("用例实现设计")).not.toBeInTheDocument();
    expect(screen.queryByText("参与对象")).not.toBeInTheDocument();
    expect(screen.queryByText("用户")).not.toBeInTheDocument();
  });

  it("groups multiple use case sequence diagrams under the sequence node", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            "sequence:uc_view": {
              diagramKind: "sequence",
              modelId: "sequence:uc_view",
              sourceUseCaseId: "uc_view",
              sourceUseCaseName: "查看活动",
              title: "查看活动用例实现设计",
              summary: "查看活动流程",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
            "sequence:uc_create": {
              diagramKind: "sequence",
              modelId: "sequence:uc_create",
              sourceUseCaseId: "uc_create",
              sourceUseCaseName: "创建活动",
              title: "创建活动用例实现设计",
              summary: "创建活动流程",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          },
          designSvgArtifacts: {
            "sequence:uc_view": {
              diagramKind: "sequence",
              modelId: "sequence:uc_view",
              svg: "<svg><text>查看活动</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
            "sequence:uc_create": {
              diagramKind: "sequence",
              modelId: "sequence:uc_create",
              svg: "<svg><text>创建活动</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(
      withWorkspaceProviders(
        <>
          <SidebarMenu />
          <TabsProbe />
        </>,
        repository,
      ),
    );

    await userEvent.click(await screen.findByRole("button", { name: "展开 设计模型" }));

    const sequenceMenu = screen.getByRole("button", { name: "用例实现设计（2）" });
    const sequenceToggle = screen.getByRole("button", { name: "展开 用例实现设计（2）" });
    expect(sequenceMenu).not.toHaveAttribute("aria-expanded");
    expect(sequenceToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("查看活动")).not.toBeInTheDocument();

    await userEvent.click(sequenceMenu);
    expect(await screen.findByRole("button", { name: "关闭 用例实现设计" })).toBeInTheDocument();
    expect(sequenceMenu).toHaveAttribute("data-active");
    expect(sequenceToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("查看活动")).not.toBeInTheDocument();

    await userEvent.click(sequenceToggle);

    expect(screen.getByText("查看活动")).toBeInTheDocument();
    expect(screen.getByText("创建活动")).toBeInTheDocument();
  });

  it("opens and closes workspace tabs from sidebar selections", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            sequence: {
              diagramKind: "sequence",
              title: "用例实现设计",
              summary: "动态行为",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          },
          designSvgArtifacts: {
            sequence: {
              diagramKind: "sequence",
              svg: "<svg><text>用例实现设计</text></svg>",
              renderMeta: { engine: "plantuml" },
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(
      withWorkspaceProviders(
        <div>
          <SidebarMenu />
      <TabsProbe />
        </div>,
        repository,
      ),
    );

    await userEvent.click((await screen.findAllByRole("button", { name: "系统需求" }))[0]);
    await userEvent.click(screen.getByRole("button", { name: "设计模型" }));
    await userEvent.click(screen.getByRole("button", { name: "展开 设计模型" }));
    await userEvent.click(screen.getByRole("button", { name: "用例实现设计" }));
    await userEvent.click(screen.getByRole("button", { name: "说明书" }));

    expect(screen.getAllByText("系统需求").length).toBeGreaterThan(0);
    expect(screen.getAllByText("设计模型").length).toBeGreaterThan(0);
    expect(screen.getAllByText("用例实现设计").length).toBeGreaterThan(0);
    expect(screen.getAllByText("说明书").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "关闭 用例实现设计" }));
    expect(screen.queryByRole("button", { name: "关闭 用例实现设计" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "关闭 设计模型" }));
    await userEvent.click(screen.getByRole("button", { name: "关闭 说明书" }));
    await userEvent.click(screen.getByRole("button", { name: "关闭 系统需求" }));
    expect(screen.getByRole("button", { name: "关闭 系统需求" })).toBeInTheDocument();
  });
});
