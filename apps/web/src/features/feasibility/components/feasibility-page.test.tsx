// Verifies feasibility overview status and persistence of user-supplied research facts.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import { createRule, createBusinessFlowArtifact, withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { i18n } from "../../../shared/i18n/i18n";
import { LOCALE_PREFERENCE_STORAGE_KEY } from "../../../shared/i18n/types";
import { FeasibilityPage } from "./feasibility-page";
import { snapshotInputFingerprint, feasibilityImplementationPlanSchema } from "@uml-platform/contracts";
import { USER_SETTINGS_STORAGE_KEY, patchUserSettings } from "../../../shared/lib/user-settings";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { feasibilityArtifactState } from "../lib/feasibility-freshness";

afterEach(() => localStorage.removeItem(USER_SETTINGS_STORAGE_KEY));

function DependencyNavigationHarness() {
  const { selection } = useWorkspaceShell();
  return <FeasibilityPage view={selection.kind === "feasibility-home" ? "overview" : "implementation"}
    initialSelectedArtifacts={selection.kind === "feasibility-home" ? selection.initialSelectedArtifacts : undefined} />;
}

function configureProviderModel() {
  localStorage.setItem(
    USER_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      providerConfigId: "provider-test",
      providerLabel: "测试供应商",
      providerModelOptions: ["model-test"],
      defaultModel: "model-test",
    }),
  );
}

function createContextWorkspace() {
  return {
    rules: [createRule()],
    feasibilityContextModel: {
      diagramKind: "context" as const,
      modelId: "context",
      title: "登录系统上下文",
      summary: "系统边界",
      notes: [],
      system: { id: "system", name: "登录系统", sourceRequirementIds: [] },
      people: [{ id: "user", name: "用户", sourceRequirementIds: ["r1"] }],
      externalSystems: [{ id: "identity", name: "身份平台", sourceRequirementIds: ["r1"] }],
      relationships: [{ id: "login", sourceId: "user", targetId: "system", direction: "directed" as const, label: "登录", sourceRequirementIds: ["r1"] }],
    },
    feasibilityContextPlantUml: "@startuml\n@enduml",
    feasibilityContextSvg: "<svg><text>登录系统</text></svg>",
  };
}

function createImplementationWorkspace() {
  const baseImplementation = {
    architecture: { summary: "以模块化单体承载核心业务。", modules: [
      { id: "orders", name: "预约工单", responsibility: "创建和管理维修工单", sourceRequirementIds: ["r1"] },
      { id: "inventory", name: "库存协同", responsibility: "检查零件并准备物料", sourceRequirementIds: ["r1"] },
    ] },
    dataStrategy: { summary: "使用关系数据库保存工单和库存快照。", sourceRequirementIds: ["r1"] },
    integrations: [{ id: "stock", name: "库存管理系统", responsibility: "查询与扣减库存", sourceRequirementIds: ["r1"] }],
    deploymentAndOperations: { summary: "容器化部署并接入监控。", sourceRequirementIds: ["r1"] },
    securityAndCompliance: { summary: "最小权限与审计日志。", sourceRequirementIds: ["r1"] },
    milestones: [{ id: "m1", name: "核心开发", timeframe: "第1-4周", deliverables: ["工单模块"], roles: ["开发"], dependencies: ["测试环境"], acceptanceCriteria: ["核心流程通过"], sourceRequirementIds: ["r1"] }],
    oneTimeCosts: ["开发投入"], recurringCosts: ["云资源"], quantitativeBenefits: ["减少人工工时"], qualitativeBenefits: ["提升客户体验"],
    risks: [{ id: "risk-1", risk: "库存接口延期", probability: "medium" as const, impact: "high" as const, mitigation: "准备 Mock 服务", owner: "项目经理", sourceRequirementIds: ["r1"] }],
    verdicts: [
      { category: "technical" as const, verdict: "feasible" as const, rationale: "技术栈成熟" },
      { category: "operational" as const, verdict: "feasible" as const, rationale: "流程可落地" },
      { category: "schedule" as const, verdict: "conditional" as const, rationale: "需要预留联调时间" },
      { category: "economic" as const, verdict: "unknown" as const, rationale: "等待金额资料" },
      { category: "legal" as const, verdict: "feasible" as const, rationale: "符合当前约束" },
    ],
    decision: "conditional-go" as const, preconditions: ["确认库存接口"],
  };
  return {
    ...createContextWorkspace(),
    feasibilityInputs: {
      projectName: "汽车维修系统", school: "示例大学", college: "软件学院", groupNumber: "1组", members: "张三 001", gradeClass: "2024级1班", submissionDate: "2026-07-20",
      proposedBy: "课程组", developedBy: "项目小组", expectedUsers: "维修门店", targetEnvironment: "Web", deadline: "8周", expectedLifetimeYears: 5,
      budgetLimit: 300000, teamSize: 5, teamSkills: "React、Node.js", availableResources: "测试环境", legalConstraints: "个人信息保护", references: "需求基线",
      costItems: [], benefitItems: [], analysisYears: 3,
    },
    feasibilityImplementationPlan: {
      overview: "采用模块化单体逐步实施。",
      candidates: [
        { id: "option-a", name: "模块化单体", summary: "分层模块化实现", advantages: ["部署简单"], disadvantages: ["扩展需规划"], estimatedCost: "150000", estimatedSchedule: "8周", sourceRequirementIds: ["r1"], implementation: baseImplementation },
        { id: "option-b", name: "服务化方案", summary: "按领域拆分服务", advantages: ["扩展性强"], disadvantages: ["运维复杂"], estimatedCost: "300000", estimatedSchedule: "16周", sourceRequirementIds: ["r1"], implementation: {
          ...structuredClone(baseImplementation),
          architecture: { ...structuredClone(baseImplementation.architecture), summary: "按领域拆分独立服务。", modules: [{ id: "service-orders", name: "工单服务", responsibility: "独立管理维修工单", sourceRequirementIds: ["r1"] }] },
          milestones: [{ ...structuredClone(baseImplementation.milestones[0]!), id: "service-m1", name: "服务契约验证", timeframe: "第1-6周" }],
          risks: [{ ...structuredClone(baseImplementation.risks[0]!), id: "service-risk-1", risk: "分布式运维复杂度", probability: "high" as const }],
          verdicts: baseImplementation.verdicts.map((verdict) => verdict.category === "technical" ? { ...verdict, verdict: "conditional" as const, rationale: "需要验证分布式能力" } : verdict),
          preconditions: ["确认服务治理能力"],
        } },
      ],
      reducedCandidateReason: "", recommendedCandidateId: "option-a", recommendationRationale: "满足当前规模并降低初期复杂度。",
    },
  };
}

function stubCompactViewport(matches: boolean) {
  const originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  });
  return () => Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
}

describe("FeasibilityPage", () => {
  it("generates business flow directly from rules without selecting context or implementation", async () => {
    configureProviderModel();
    const repository = createMockWorkspaceRepository({ rules: [createRule()] });
    repository.startFeasibilityRun = vi.fn(async () => ({ runId: "flow-run" }));
    repository.getFeasibilityRunSnapshot = vi.fn();
    repository.subscribeToFeasibilityRun = vi.fn(async (_id, onEvent) => {
      onEvent({ type: "completed", snapshot: {} as never });
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<FeasibilityPage view="overview" />, repository));
    await user.click(await screen.findByRole("button", { name: "选择业务与系统流程图" }));
    expect(screen.getByRole("checkbox", { name: "选择系统环境图" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择实现方案" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "生成可行性分析" }));
    await screen.findByRole("dialog", { name: "可行性分析已生成" });
    expect(repository.startFeasibilityRun).toHaveBeenCalledWith(expect.objectContaining({ selectedArtifacts: ["business-flow"] }));
  });

  it("shows inline prerequisites for an empty business flow", async () => {
    const repository = createMockWorkspaceRepository({ rules: [] });
    repository.startFeasibilityRun = vi.fn();
    render(withWorkspaceProviders(<FeasibilityPage view="business-flow" />, repository));
    await screen.findByRole("heading", { name: "业务流程图" });
    expect(screen.getByText("请先在系统需求页确认需求规则")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
    expect(repository.startFeasibilityRun).not.toHaveBeenCalled();
  });

  it("loads a saved business flow with shared element and relation lists, exports and an outdated notice", async () => {
    const repository = createMockWorkspaceRepository({
      rules: [createRule()],
      feasibilityBusinessFlow: {
        model: { diagramKind: "activity", modelId: "feasibility-business-flow", title: "业务与系统流程图", summary: "登录处理", notes: ["仅覆盖登录流程"],
          swimlanes: [{ id: "system", name: "系统" }], nodes: [{ id: "start", type: "start" }, { id: "process", type: "activity", name: "处理登录", actorOrLane: "system", input: [], output: [] }, { id: "end", type: "end" }],
          relationships: [{ id: "first", type: "control_flow", sourceId: "start", targetId: "process" }, { id: "last", type: "control_flow", sourceId: "process", targetId: "end" }] },
        traceability: [{ requirementId: "r1", targetKind: "node", targetId: "process" }],
        plantUml: { modelId: "feasibility-business-flow", diagramKind: "activity", source: "@startuml\nstart\n:处理登录;\nstop\n@enduml" },
        svg: { modelId: "feasibility-business-flow", diagramKind: "activity", svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text>登录流程</text></svg>',
          renderMeta: { engine: "plantuml", generatedAt: "2026-07-19T00:00:00.000Z", sourceLength: 60, durationMs: 1 } },
        fingerprint: "outdated",
      },
    });
    render(withWorkspaceProviders(<FeasibilityPage view="business-flow" />, repository));
    await screen.findByRole("heading", { name: "业务与系统流程图" });
    expect(screen.getByRole("button", { name: "定位元素：处理登录" })).toBeInTheDocument();
    expect(screen.getByText("仅覆盖登录流程")).toBeInTheDocument();
    expect(screen.queryByText("此图基于旧规则生成，可能已过时。")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /提示（\d+）/ }));
    const notice = await screen.findByRole("dialog", { name: "模型提示" });
    expect(within(notice).getByText("此图基于旧规则生成，可能已过时。")).toBeInTheDocument();
    await userEvent.click(within(notice).getByRole("button", { name: "知道了" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "下载" }));
    expect(await screen.findByRole("menuitem", { name: "PlantUML" })).not.toHaveAttribute("aria-disabled", "true");
    expect(await screen.findByRole("menuitem", { name: "SVG" })).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.setup().keyboard("{Escape}");
  });

  it("shows context and implementation as ordered overview artifacts", async () => {
    const user = userEvent.setup();
    const repository = createMockWorkspaceRepository({ rules: [createRule()] });
    repository.getProjectAccess = async () => ({ capabilities: ["update_project", "start_runs"], generationExecutionMode: "provider" });
    render(withWorkspaceProviders(<FeasibilityPage view="overview" />, repository));
    expect(await screen.findByRole("heading", { name: "可行性分析" })).toBeInTheDocument();
    expect(screen.getByText("系统环境图")).toBeInTheDocument();
    expect(screen.getByText("实现方案")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /：未生成$/ })).toHaveLength(3);
    expect(screen.queryByText("未生成")).not.toBeInTheDocument();
    const card = screen.getByRole("button", { name: "选择系统环境图" });
    expect(card).toHaveClass("h-[212px]", "sm:h-[236px]");
    expect(card.parentElement).toHaveAttribute("data-mobile-card-density", "model-targets");
    expect(card.parentElement?.className).toContain("min-[1900px]:grid-cols-6");
    expect(screen.getByText("0/3")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "选择系统环境图" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择实现方案" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "生成可行性分析" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "有 1 项需要处理" }));
    const dialog = screen.getByRole("dialog", {
      name: "可行性分析暂时无法生成",
    });
    expect(dialog).toHaveTextContent("未选择模型供应商");
    expect(within(dialog).queryByRole("button", { name: /前往/ })).not.toBeInTheDocument();
  });

  it("shows a success dialog after a user-requested generation completes", async () => {
    configureProviderModel();
    const repository = createMockWorkspaceRepository({ rules: [createRule()] });
    repository.startFeasibilityRun = vi.fn(async () => ({ runId: "feasibility-success" }));
    repository.getFeasibilityRunSnapshot = vi.fn();
    repository.subscribeToFeasibilityRun = vi.fn(async (_runId, onEvent) => {
      onEvent({ type: "completed", snapshot: {} as never });
    });
    const user = userEvent.setup();

    render(
      withWorkspaceProviders(
        <FeasibilityPage view="overview" initialSelectedArtifacts={["context"]} />,
        repository,
      ),
    );
    const generateButton = await screen.findByRole("button", { name: "生成可行性分析" });
    await waitFor(() => expect(generateButton).toBeEnabled());
    await user.click(generateButton);

    expect(
      await screen.findByRole("dialog", { name: "可行性分析已生成" }),
    ).toHaveTextContent("已完成 1 项所选产物");
  });

  it("shows the same failure dialog after every user retry", async () => {
    configureProviderModel();
    const repository = createMockWorkspaceRepository({ rules: [createRule()] });
    repository.startFeasibilityRun = vi.fn(async () => {
      throw new Error("provider failed");
    });
    repository.getFeasibilityRunSnapshot = vi.fn();
    const user = userEvent.setup();

    render(
      withWorkspaceProviders(
        <FeasibilityPage view="overview" initialSelectedArtifacts={["context"]} />,
        repository,
      ),
    );
    const generateButton = await screen.findByRole("button", { name: "生成可行性分析" });
    await waitFor(() => expect(generateButton).toBeEnabled());

    await user.click(generateButton);
    const first = await screen.findByRole("dialog", { name: "生成失败" });
    expect(first).not.toHaveTextContent("provider failed");
    await user.click(within(first).getByRole("button", { name: "我知道了" }));

    await user.click(generateButton);
    expect(await screen.findByRole("dialog", { name: "生成失败" })).toBeInTheDocument();
    expect(repository.startFeasibilityRun).toHaveBeenCalledTimes(2);
  });

  it("applies artifact selections supplied by workspace navigation", async () => {
    const repository = createMockWorkspaceRepository({ rules: [createRule()] });

    render(
      withWorkspaceProviders(
        <FeasibilityPage
          view="overview"
          initialSelectedArtifacts={["context", "implementation"]}
        />,
        repository,
      ),
    );

    await screen.findByRole("heading", { name: "可行性分析" });
    expect(screen.getByRole("checkbox", { name: "选择系统环境图" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择实现方案" })).toBeChecked();
    expect(screen.getByText("3/3")).toBeInTheDocument();
  });

  it("selecting implementation links context while no current context exists", async () => {
    const repository = createMockWorkspaceRepository({ rules: [createRule()] });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<FeasibilityPage view="overview" />, repository));
    await screen.findByRole("heading", { name: "可行性分析" });
    await user.click(screen.getByRole("button", { name: "选择实现方案" }));
    expect(screen.getByRole("checkbox", { name: "选择系统环境图" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择实现方案" })).toBeChecked();
    expect(screen.getByText("3/3")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "选择业务与系统流程图" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "取消选择系统环境图" }));
    expect(screen.getByRole("checkbox", { name: "选择系统环境图" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择实现方案" })).not.toBeChecked();
  });

  it("allows implementation-only selection when a current context exists", async () => {
    const context = createContextWorkspace();
    const repository = createMockWorkspaceRepository({
      ...context,
      feasibilityBusinessFlow: createBusinessFlowArtifact(context.rules),
      feasibilityContextFingerprint: snapshotInputFingerprint({
        rules: context.rules,
        requirementBaseline: null,
      }),
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<FeasibilityPage view="overview" />, repository));
    await screen.findByRole("heading", { name: "可行性分析" });
    await user.click(screen.getByRole("button", { name: "选择实现方案" }));
    expect(screen.getByRole("checkbox", { name: "选择系统环境图" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择实现方案" })).toBeChecked();
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("opens the overview with missing dependencies when the detail page is reused", async () => {
    const repository = createMockWorkspaceRepository({ rules: [createRule()], ...createImplementationWorkspace() });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<DependencyNavigationHarness />, repository));
    await user.click(await screen.findByRole("button", { name: "补齐依赖" }));
    expect(await screen.findByRole("heading", { name: "可行性分析" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "选择实现方案" })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "选择业务与系统流程图" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择系统环境图" })).toBeChecked();
  });

  it("manual plan edits cannot make a legacy plan current without a new generation", async () => {
    const workspace = createImplementationWorkspace();
    const plan = feasibilityImplementationPlanSchema.parse(workspace.feasibilityImplementationPlan);
    for (const candidate of plan.candidates) {
      const implementation = candidate.implementation!;
      implementation.analysisPeriodAssumption = { years: 3, basis: "人工确认", provenance: "user-confirmed" };
      implementation.costEstimates = [{ id: "cost", name: "开发", category: "other-one-time", frequency: "one-time",
        range: { minimum: 1, maximum: 2, currency: "CNY", basis: "人工确认", confidence: "medium" },
        sourceRequirementIds: ["r1"], assumption: "", note: "", provenance: "user-edited" }];
      implementation.benefitEstimates = [{ id: "benefit", name: "效率提升", category: "intangible", frequency: "annual", range: null,
        outcome: "流程提效", sourceRequirementIds: ["r1"], assumption: "", provenance: "user-edited" }];
      implementation.risks = [0, 1, 2].map((index) => ({ ...implementation.risks[0]!, id: `risk-${index}` }));
    }
    const repository = createMockWorkspaceRepository({ ...workspace, feasibilityImplementationPlan: plan, feasibilityImplementationFingerprint: "legacy-inputs" });
    const updateFeasibility = vi.spyOn(repository, "updateFeasibility");
    const user = userEvent.setup();
    render(withWorkspaceProviders(<FeasibilityPage view="implementation" />, repository));
    await user.click(await screen.findByRole("button", { name: "编辑 概览" }));
    await user.type(screen.getByLabelText("选择依据"), "人工更新方案说明");
    await user.click(screen.getByRole("button", { name: "应用" }));
    await user.click(screen.getByRole("button", { name: "保存方案" }));
    await waitFor(() => expect(updateFeasibility).toHaveBeenCalled());
    expect(updateFeasibility.mock.calls[0]![0]).not.toHaveProperty("implementationFingerprint");
    const saved = await repository.loadWorkspace();
    expect(saved.feasibilityImplementationPlan!.recommendationRationale).toContain("人工更新方案说明");
    expect(saved.feasibilityImplementationFingerprint).toBe("legacy-inputs");
    expect(feasibilityArtifactState(saved).implementationStatus).toBe("stale");
  });

  it("persists editable cost and benefit facts without inventing amounts", async () => {
    const repository = createMockWorkspaceRepository({ rules: [createRule()], ...createImplementationWorkspace() });
    const updateFeasibility = vi.spyOn(repository, "updateFeasibility");
    const user = userEvent.setup();
    render(withWorkspaceProviders(<FeasibilityPage view="implementation" />, repository));
    expect(await screen.findByRole("heading", { name: "实现方案" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /编辑 成本与收益/u }));
    await user.click(screen.getByRole("button", { name: "新增成本条目" }));
    await user.type(screen.getByLabelText("成本明细条目名称"), "开发成本");
    expect(screen.getByLabelText("成本明细金额")).toHaveValue(null);
    await user.click(screen.getByRole("button", { name: "应用" }));
    await user.click(screen.getByRole("button", { name: "保存方案" }));
    await waitFor(() => expect(updateFeasibility).toHaveBeenCalledWith(expect.objectContaining({
      inputs: expect.objectContaining({ costItems: [expect.objectContaining({ name: "开发成本", amount: null })] }),
    })));
  });

  it("renders the complete Figma-aligned implementation workspace", async () => {
    const repository = createMockWorkspaceRepository({ rules: [createRule()], ...createImplementationWorkspace() });
    render(withWorkspaceProviders(<FeasibilityPage view="implementation" />, repository));

    expect(await screen.findByRole("heading", { name: "实现方案" })).toBeInTheDocument();
    expect(screen.getByTestId("implementation-plan-dashboard")).toHaveClass(
      "w-[calc(100%-2rem)]",
      "max-w-7xl",
      "lg:w-[calc(100%-3rem)]",
    );
    expect(screen.getByText("候选方案比较")).toBeInTheDocument();
    const candidateDetails = screen.getByRole("region", { name: "方案具体内容：模块化单体" });
    expect(candidateDetails).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /技术方案/u })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /实施计划/u })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /成本与收益/u })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /风险管理/u })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /五类可行性结论/u })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "可行性补充资料" })).toBeInTheDocument();
    expect(screen.getByTestId("implementation-module-topology")).toBeInTheDocument();
    expect(screen.getByTestId("risk-matrix")).toBeInTheDocument();
    expect(screen.getByText("库存接口延期")).toBeInTheDocument();
    expect(within(candidateDetails).getByText("以下技术、实施、成本收益、风险和结论均属于当前选中的方案。")).toBeInTheDocument();
  });

  it("switches every implementation section without changing the recommended option", async () => {
    const repository = createMockWorkspaceRepository({ rules: [createRule()], ...createImplementationWorkspace() });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<FeasibilityPage view="implementation" />, repository));

    expect(await screen.findByText("以模块化单体承载核心业务。")).toBeInTheDocument();
    expect(screen.getByText("库存接口延期")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /服务化方案/u }));

    expect(screen.getByRole("region", { name: "方案具体内容：服务化方案" })).toBeInTheDocument();
    expect(screen.getByText("按领域拆分独立服务。")).toBeInTheDocument();
    expect(screen.getByText("服务契约验证")).toBeInTheDocument();
    expect(screen.getByText("分布式运维复杂度")).toBeInTheDocument();
    expect(screen.getByText("需要验证分布式能力")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "模块化单体" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: /服务化方案/u })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "保存方案" })).toBeDisabled();
  });

  it("opens the requested implementation candidate from workspace navigation", async () => {
    const repository = createMockWorkspaceRepository({
      rules: [createRule()],
      ...createImplementationWorkspace(),
    });

    render(
      withWorkspaceProviders(
        <FeasibilityPage
          view="implementation"
          initialCandidateId="option-b"
        />,
        repository,
      ),
    );

    expect(await screen.findByText("按领域拆分独立服务。")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /服务化方案/u })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("translates static implementation UI without translating generated content", async () => {
    localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, "en");
    try {
      const repository = createMockWorkspaceRepository({ rules: [createRule()], ...createImplementationWorkspace() });
      render(withWorkspaceProviders(<FeasibilityPage view="implementation" />, repository));
      expect(await screen.findByRole("heading", { name: "Technical Proposed Solution" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Candidate options" })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Option details: 模块化单体" })).toBeInTheDocument();
      expect(screen.getByText("分层模块化实现")).toBeInTheDocument();
      expect(screen.getByText("技术栈成熟")).toBeInTheDocument();
    } finally {
      localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
      await i18n.changeLanguage("zh-CN");
    }
  });

  it("renders context through the complete shared model detail workspace", async () => {
    const repository = createMockWorkspaceRepository(createContextWorkspace());
    render(withWorkspaceProviders(<FeasibilityPage view="context" />, repository));

    await waitFor(() => expect(screen.getByRole("heading", { name: "登录系统上下文", level: 1 })).toBeInTheDocument());
    expect(screen.queryByLabelText("模型标题")).not.toBeInTheDocument();
    expect(screen.getByTestId("diagram-preview-section")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开模型概览" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "下载" }));
    expect(await screen.findByRole("menuitem", { name: "SVG" })).toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: "PlantUML" })).toBeInTheDocument();
    await userEvent.setup().keyboard("{Escape}");
    expect(screen.getByText("元素清单")).toBeInTheDocument();
    expect(screen.getByText("关系说明")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加关系" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "上下文元素" })).not.toBeInTheDocument();
  });

  it("opens and highlights a requested context relationship", async () => {
    const repository = createMockWorkspaceRepository(createContextWorkspace());

    render(
      withWorkspaceProviders(
        <FeasibilityPage
          view="relations"
          highlightedRelationshipId="login"
        />,
        repository,
      ),
    );

    expect(await screen.findByRole("tab", { name: "关系" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("article", { name: "登录" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("uses the same detail page and focuses the requested desktop section", async () => {
    const repository = createMockWorkspaceRepository(createContextWorkspace());
    const { rerender } = render(
      withWorkspaceProviders(<FeasibilityPage view="elements" />, repository),
    );

    expect(await screen.findByLabelText("元素清单区块")).toHaveFocus();
    expect(screen.getByTestId("diagram-preview-section")).toBeInTheDocument();

    rerender(withWorkspaceProviders(<FeasibilityPage view="relations" />, repository));
    await waitFor(() => expect(screen.getByLabelText("关系说明区块")).toHaveFocus());
    expect(screen.getByTestId("diagram-preview-section")).toBeInTheDocument();
  });

  it("activates the requested shared detail tab on compact viewports", async () => {
    const restoreMatchMedia = stubCompactViewport(true);
    try {
      const repository = createMockWorkspaceRepository(createContextWorkspace());
      render(withWorkspaceProviders(<FeasibilityPage view="relations" />, repository));
      const relationsTab = await screen.findByRole("tab", { name: "关系" });
      await waitFor(() => expect(relationsTab).toHaveAttribute("aria-selected", "true"));
      expect(screen.getByText("关系说明")).toBeInTheDocument();
    } finally {
      restoreMatchMedia();
    }
  });

  it("atomically rebuilds traceability and rendered artifacts when a context element is edited", async () => {
    const repository = createMockWorkspaceRepository(createContextWorkspace());
    const updateFeasibility = vi.spyOn(repository, "updateFeasibility");
    const renderStructuredModel = vi.spyOn(repository, "renderStructuredModel");
    const user = userEvent.setup();
    render(withWorkspaceProviders(<FeasibilityPage view="elements" />, repository));

    await user.click(await screen.findByRole("button", { name: "编辑中心系统：登录系统" }));
    await user.clear(screen.getByLabelText("中心系统名称"));
    await user.type(screen.getByLabelText("中心系统名称"), "统一登录系统");
    await user.click(screen.getByRole("button", { name: "确认编辑" }));

    await waitFor(() => expect(renderStructuredModel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(updateFeasibility).toHaveBeenCalledWith(expect.objectContaining({
      contextModel: expect.objectContaining({ system: expect.objectContaining({ name: "统一登录系统" }) }),
      contextTraceability: expect.arrayContaining([
        expect.objectContaining({ requirementId: "r1", targetId: "user" }),
        expect.objectContaining({ requirementId: "r1", targetId: "login" }),
      ]),
      contextPlantUml: expect.stringContaining("@startuml"),
      contextSvg: expect.stringContaining("<svg"),
    })));
  });
});


describe("feasibility generation model modes", () => {
  it("generates fixed artifacts without a provider in a confirmed demo project", async () => {
    const repository = createMockWorkspaceRepository({ rules: [createRule()] });
    repository.startFeasibilityRun = vi.fn(async () => ({ runId: "demo-feasibility" }));
    repository.getFeasibilityRunSnapshot = vi.fn();
    repository.subscribeToFeasibilityRun = vi.fn(async (_runId, onEvent) => {
      onEvent({ type: "completed", snapshot: {} as never });
    });
    render(withWorkspaceProviders(<FeasibilityPage view="overview" initialSelectedArtifacts={["context"]} />, repository));
    const button = await screen.findByRole("button", { name: "生成可行性分析" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.setup().click(button);
    await waitFor(() => expect(repository.startFeasibilityRun).toHaveBeenCalledWith({
      selectedArtifacts: ["context"],
      providerSettings: { providerConfigId: "offline-demo", model: "offline-demo-fixed-artifacts" },
    }));
    await screen.findByRole("dialog", { name: "可行性分析已生成" });
  });

  it("reacts to provider, model and catalog changes while keeping the picker usable", async () => {
    const repository = createMockWorkspaceRepository({ rules: [createRule()] });
    repository.getProjectAccess = async () => ({ capabilities: ["update_project", "start_runs"], generationExecutionMode: "provider" });
    repository.startFeasibilityRun = vi.fn();
    render(withWorkspaceProviders(<FeasibilityPage view="overview" initialSelectedArtifacts={["context"]} />, repository));
    const button = await screen.findByRole("button", { name: "生成可行性分析" });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("供应商"));
    expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: "未选择模型" })).toBeEnabled();
    act(() => patchUserSettings({ providerConfigId: "provider-1", defaultModel: "", providerModelOptions: ["model-1"] }));
    expect(screen.getByRole("status")).toHaveTextContent("选择用于生成的模型");
    expect(button).toBeDisabled();
    act(() => patchUserSettings({ defaultModel: "model-1" }));
    expect(button).toBeEnabled();
    act(() => patchUserSettings({ providerModelOptions: ["model-2"] }));
    expect(screen.getByRole("status")).toHaveTextContent("已不可用");
    expect(button).toBeDisabled();
    await userEvent.setup().click(button);
    expect(repository.startFeasibilityRun).not.toHaveBeenCalled();
  });

  it("disables detail regeneration with an inline model reason", async () => {
    const repository = createMockWorkspaceRepository(createImplementationWorkspace());
    repository.getProjectAccess = async () => ({ capabilities: ["update_project", "start_runs"], generationExecutionMode: "provider" });
    repository.startFeasibilityRun = vi.fn();
    render(withWorkspaceProviders(<FeasibilityPage view="implementation" />, repository));
    await screen.findByTestId("implementation-plan-dashboard");
    await waitFor(() => expect(screen.getByText("未选择模型供应商")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "重新生成" })).toBeDisabled();
    expect(repository.startFeasibilityRun).not.toHaveBeenCalled();
  });
});


describe("business flow shared detail workspace", () => {
  it("uses the same preview, searchable element list and relationship section as other models", async () => {
    stubCompactViewport(false);
    const repository = createMockWorkspaceRepository({ rules: [createRule()], feasibilityBusinessFlow: createBusinessFlowArtifact() });
    render(withWorkspaceProviders(<FeasibilityPage view="business-flow" />, repository));
    await screen.findByRole("heading", { name: "业务与系统流程图" });
    expect(screen.getByRole("heading", { name: "元素清单" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "关系说明" })).toBeInTheDocument();
    expect(screen.getByLabelText("元素清单工具栏")).toBeInTheDocument();
    expect(screen.getByLabelText("关系说明工具栏")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "下载" }));
    expect(await screen.findByRole("menuitem", { name: "SVG" })).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.setup().keyboard("{Escape}");
    await userEvent.setup().click(screen.getByRole("button", { name: "定位元素：处理业务" }));
    expect(screen.getByRole("button", { name: "定位元素：处理业务" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "添加关系" })).not.toBeInTheDocument();
  });

  it("opens business-flow elements and relationships on the matching compact tabs", async () => {
    stubCompactViewport(true);
    const repository = createMockWorkspaceRepository({ rules: [createRule()], feasibilityBusinessFlow: createBusinessFlowArtifact() });
    const { rerender } = render(withWorkspaceProviders(<FeasibilityPage view="business-flow-elements" />, repository));
    await screen.findByRole("heading", { name: "业务与系统流程图" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "元素" })).toHaveAttribute("aria-selected", "true"));
    expect(screen.queryByRole("tab", { name: "编辑" })).not.toBeInTheDocument();
    rerender(withWorkspaceProviders(<FeasibilityPage view="business-flow-relations" />, repository));
    await waitFor(() => expect(screen.getByRole("tab", { name: "关系" })).toHaveAttribute("aria-selected", "true"));
  });

  it("renders a separate matrix from saved flow traces without using requirement activity traces", async () => {
    const artifact = createBusinessFlowArtifact();
    artifact.traceability.push({ requirementId: "deleted-rule", targetKind: "relationship", targetId: "e1" });
    const repository = createMockWorkspaceRepository({ rules: [createRule()], feasibilityBusinessFlow: artifact });
    render(withWorkspaceProviders(<FeasibilityPage view="business-flow-trace" />, repository));
    await screen.findByRole("heading", { name: "业务与系统流程图跟踪矩阵" });
    expect(screen.getByRole("table")).toHaveTextContent("处理业务");
    expect(screen.getByRole("table")).toHaveTextContent("系统");
    await userEvent.setup().click(within(screen.getByRole("table")).getByText("处理业务", { exact: true }));
    expect(screen.getByText(/用户必须登录后才能访问主要功能/)).toBeInTheDocument();
    expect(screen.queryByText("需求规则已变化，请重新生成业务与系统流程图。")).not.toBeInTheDocument();
  });
});
