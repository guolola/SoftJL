// Verifies that hover, keyboard focus, and the tap-friendly inspect button drive each page's
// workflow illustration while card selection keeps its existing behavior.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { snapshotInputFingerprint, createRequirementBaselineSnapshot } from "@uml-platform/contracts";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import { createRule, createWorkspaceRecord, withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { DesignModelPage } from "../../design/components/design-model-page";
import { FeasibilityPage } from "../../feasibility/components/feasibility-page";
import { TextRequirementView } from "../../requirements/components/text-requirement-page";
import { modelFixture } from "../../../../../../packages/contracts/dist/testing/model-fixtures";

// Workflow tests start from saved rules with explicit source receipts.
function createCurrentMockWorkspaceRepository(seed: Parameters<typeof createWorkspaceRecord>[0] = {}) {
  const workspace = createWorkspaceRecord(seed);
  const fingerprint = snapshotInputFingerprint({ requirementText: workspace.requirementText, rules: workspace.rules });
  return createMockWorkspaceRepository({ ...workspace, requirementInputFingerprint: fingerprint,
    diagramInputFingerprints: { ...Object.fromEntries(Object.values(workspace.models).filter(Boolean).flatMap(model => [[model!.diagramKind, fingerprint], [model!.modelId ?? model!.diagramKind, fingerprint]])), ...workspace.diagramInputFingerprints },
  });
}

const workflow = () => screen.getByRole("figure", { name: /的上游输入$/ });
const inputKeys = () => within(workflow()).getAllByRole("listitem").map((item) => item.getAttribute("data-input"));
const inputStates = () => within(workflow()).getAllByRole("listitem").map((item) => item.getAttribute("data-state"));

function expectWorkflowBelowCards() {
  const grid = document.querySelector('[data-mobile-card-density="model-targets"]');
  expect(grid).not.toBeNull();
  expect(grid!.compareDocumentPosition(workflow()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe("upstream workflow illustrations", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("follows card hover on the feasibility page without changing selection", async () => {
    const user = userEvent.setup();
    const repository = createCurrentMockWorkspaceRepository({ rules: [createRule()] });
    repository.getProjectAccess = async () => ({ capabilities: ["update_project", "start_runs"], generationExecutionMode: "provider" });
    render(withWorkspaceProviders(<FeasibilityPage view="overview" />, repository));

    // The first card is represented by default and subtly marked.
    expect(await screen.findByRole("figure", { name: "系统环境图的上游输入" })).toBeInTheDocument();
    expectWorkflowBelowCards();
    expect(inputKeys()).toEqual(["rules:r1", "supplementary"]);
    expect(within(workflow()).getByText("业务规则 1")).toBeInTheDocument();
    expect(within(workflow()).getByText("可选")).toBeInTheDocument();
    const contextCard = screen.getByRole("button", { name: "选择系统环境图" });
    expect(contextCard).toHaveAttribute("data-inspected", "true");
    // Layout stacks vertically on narrow screens and becomes a row from the md breakpoint.
    expect(within(workflow()).getByRole("list").parentElement).toHaveClass("flex-col", "md:flex-row");

    const implementationCard = screen.getByRole("button", { name: "选择实现方案" });
    await user.hover(implementationCard);
    expect(screen.getByRole("figure", { name: "实现方案的上游输入" })).toBeInTheDocument();
    expect(inputKeys()).toEqual(["feasibility:context", "feasibility:business-flow", "rules:r1", "supplementary"]);
    expect(inputStates().slice(0, 2)).toEqual(["missing", "missing"]);
    expect(contextCard).not.toHaveAttribute("data-inspected");

    // Hovering the card inspects its inputs without toggling selection.
    await user.hover(contextCard);
    expect(screen.getByRole("figure", { name: "系统环境图的上游输入" })).toBeInTheDocument();
    expect(contextCard).toHaveAttribute("data-inspected", "true");
    expect(contextCard.querySelector('[data-slot="inspect-dependencies"]')).toBeNull();
    expect(screen.getByRole("checkbox", { name: "选择系统环境图" })).not.toBeChecked();

    // Clicking the card itself still selects it.
    await user.click(contextCard);
    expect(screen.getByRole("checkbox", { name: "选择系统环境图" })).toBeChecked();
    await user.hover(implementationCard);
    expect(inputStates().slice(0, 2)).toEqual(["planned", "missing"]);
    expect(within(workflow()).getByText("本次将生成")).toBeInTheDocument();

    await user.click(contextCard);
    await user.hover(implementationCard);
    expect(inputStates().slice(0, 2)).toEqual(["missing", "missing"]);

    // Selecting the implementation also schedules both missing prerequisite diagrams.
    await user.click(implementationCard);
    expect(inputStates().slice(0, 2)).toEqual(["planned", "planned"]);
  });

  it.each([
    ["feasibility", <FeasibilityPage view="overview" />, "baseline"],
    ["requirement", <TextRequirementView view="models" />, "baseline"],
    ["design", <DesignModelPage />, "baseline:constraints"],
  ] as const)("omits baseline nodes from the %s workflow", async (_, page, key) => {
    const rules = [createRule()];
    const requirementBaseline = createRequirementBaselineSnapshot({ runId: "rules-run", requirementText: "需求", rules });
    const repository = createCurrentMockWorkspaceRepository({ requirementText: "需求", rules, requirementBaseline });
    render(withWorkspaceProviders(page, repository));
    const figure = await screen.findByRole("figure", { name: /的上游输入$/ });
    expect(inputKeys()).not.toContain(key);
    expect(within(figure).queryByText(/需求基线/)).not.toBeInTheDocument();
  });

  it("keeps a missing use-case model unavailable when inspecting requirement analysis", async () => {
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "用户可以提交订单", rules: [createRule()],
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));
    await screen.findByRole("figure", { name: "功能结构图的上游输入" });
    await user.click(screen.getByRole("button", { name: "选择需求分析模型" }));
    expect(inputKeys()).toEqual(["requirement:usecase:single-use-case"]);
    expect(inputStates()).toEqual(["missing"]);
    const analysisCheckbox = screen.getByRole("checkbox", { name: "需求分析模型" });
    expect(analysisCheckbox).toHaveAttribute("aria-disabled", "true");
    expect(analysisCheckbox).not.toBeChecked();
  });

  it("keeps missing design dependencies unavailable and unplanned", async () => {
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "生成设计模型的需求", rules: [createRule({})],
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));
    await screen.findByRole("figure", { name: "总体架构图的上游输入" });
    await user.click(screen.getByRole("button", { name: "选择数据库设计" }));
    expect(inputKeys()).toEqual(["design:class"]);
    expect(inputStates()).toEqual(["missing"]);
    expect(screen.getByRole("checkbox", { name: "数据库设计" })).not.toBeChecked();
    await user.hover(screen.getByRole("button", { name: "选择设计类图" }));
    expect(inputKeys()).toEqual(["requirement:class", "requirement:usecase:all-use-cases"]);
    expect(inputStates()).toEqual(["missing", "missing"]);
  });

  it("shows the workflow below requirement cards and follows keyboard focus", async () => {
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "用户可以提交订单",
      rules: [createRule({ type: "functional" })],
      generatedDiagramTypes: ["usecase"],
      models: { usecase: { diagramKind: "usecase", title: "订单用例", summary: "订单业务", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] } },
    });
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));

    expect(await screen.findByRole("figure", { name: "功能结构图的上游输入" })).toBeInTheDocument();
    expectWorkflowBelowCards();
    expect(inputKeys()).toEqual(["rules:relevant:r1"]);

    const analysisInspect = screen.getByRole("button", { name: "选择需求分析模型" });
    act(() => analysisInspect.focus());
    expect(screen.getByRole("figure", { name: "需求分析模型的上游输入" })).toBeInTheDocument();
    expect(inputKeys()).toEqual(["requirement:usecase:single-use-case"]);
    expect(within(workflow()).getByText("对应单个用例的事件流")).toBeInTheDocument();
    expect(screen.queryByText(/^间接依赖：/)).not.toBeInTheDocument();
  });

  it.each([false, true])("shows the single-use-case event-flow source in yellow when planned or retained analysis is stale: %s", async (savedStale) => {
    const usecase = modelFixture("requirements", "usecase");
    const analysis = modelFixture("requirements", "analysis");
    if (usecase.diagramKind !== "usecase" || analysis.diagramKind !== "analysis") throw new Error("fixture");
    analysis.modelId = "analysis:case";
    analysis.sourceUseCaseId = "case";
    analysis.sourceUseCaseName = "下单";
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "用户提交订单", rules: [createRule({ type: "functional" })],
      selectedDiagramTypes: [], generatedDiagramTypes: ["usecase", "analysis"],
      models: { usecase, [analysis.modelId!]: analysis },
      ...(savedStale ? { diagramInputFingerprints: { analysis: "stale:previous-events", [analysis.modelId!]: "stale:previous-events" } } : {}),
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));
    await screen.findByRole("figure", { name: "功能结构图的上游输入" });
    if (!savedStale) await user.click(screen.getByRole("checkbox", { name: "用例模型" }));
    await user.hover(screen.getByRole("button", { name: "选择需求分析模型" }));
    const source = within(workflow()).getByText("对应单个用例的事件流").closest("li")!;
    expect(source).toHaveAttribute("data-state", "stale");
    expect(within(source).getByText("待更新")).toHaveClass("text-warning");
    if (!savedStale) {
      await user.click(screen.getByRole("checkbox", { name: "用例模型" }));
      await user.hover(screen.getByRole("button", { name: "选择需求分析模型" }));
      const currentSource = within(workflow()).getByText("对应单个用例的事件流").closest("li")!;
      expect(currentSource).toHaveAttribute("data-state", "ready");
      expect(within(currentSource).getByText("就绪")).toBeInTheDocument();
    }
  });

  it("shows only fixed mapped types before generation", async () => {
    const user = userEvent.setup();
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "项目需求",
      rules: [
        createRule({ id: "r2", type: "functional" as const,  text: "提供业务管理功能" }),
        createRule({ id: "r5", type: "quality" as const,  text: "支持浏览器访问" }),
        createRule({ id: "r8", type: "operations" as const,  text: "部署在校园网络" }),
      ],
    });
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));
    await screen.findByRole("figure", { name: "功能结构图的上游输入" });
    expect(within(workflow()).getByText("功能需求 1")).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "选择部署需求模型" }));
    expect(inputKeys()).toEqual(["rules:relevant:r5", "rules:relevant:r8", "rules:relevant:missing:interface"]);
    const ruleNodes = within(workflow()).getAllByRole("listitem");
    expect(ruleNodes[0]).toHaveTextContent("质量需求 1");
    expect(ruleNodes[0]).toHaveAttribute("title", "质量需求 1: 支持浏览器访问");
    expect(ruleNodes[1]).toHaveTextContent("部署运行 1");
    expect(inputStates()).toEqual(["ready", "ready", "missing"]);
    await user.hover(screen.getByRole("button", { name: "选择领域概念模型" }));
    expect(inputKeys()).toEqual(["rules:relevant:missing:business-rule", "rules:relevant:missing:data"]);
    expect(within(workflow()).getByText("缺少业务规则")).toBeInTheDocument();
    expect(within(workflow()).getByText("缺少数据需求")).toBeInTheDocument();
    expect(within(workflow()).getByText("按需求类型固定关联；生成后的具体元素另行追踪")).toBeInTheDocument();
  });

  it("shows the specific missing types for the overall business workflow alongside existing functional rules", async () => {
    const user = userEvent.setup();
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "用户提交申请",
      rules: [createRule({ id: "r2", type: "functional", text: "用户提交申请" })],
    });
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));
    await screen.findByRole("figure", { name: "功能结构图的上游输入" });
    await user.hover(screen.getByRole("button", { name: "选择总体业务流程" }));
    expect(inputKeys()).toEqual([
      "rules:relevant:r2", "rules:relevant:missing:business-rule", "rules:relevant:missing:interface", "rules:relevant:missing:exception",
    ]);
    expect(inputStates()).toEqual(["ready", "missing", "missing", "missing"]);
    expect(within(workflow()).getByText("缺少业务规则")).toBeInTheDocument();
    expect(within(workflow()).getByText("缺少外部接口")).toBeInTheDocument();
    expect(within(workflow()).getByText("缺少异常处理")).toBeInTheDocument();
    expect(within(workflow()).queryByText("暂无该模型对应类型的需求")).not.toBeInTheDocument();
  });

  it("excludes business and exception types from prototype workflow inputs", async () => {
    const user = userEvent.setup();
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "页面权限与失败返回",
      rules: [
        createRule({ id: "r3", type: "interaction", text: "页面显示提交按钮" }),
        createRule({ id: "r5", type: "business-rule" as const,  text: "仅管理员可进入管理页面" }),
        createRule({ id: "r9", type: "exception" as const,  text: "提交失败后返回表单" }),
      ],
    });
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));
    await screen.findByRole("figure", { name: "功能结构图的上游输入" });
    await user.hover(screen.getByRole("button", { name: "选择原型界面关系" }));
    expect(inputKeys()).toEqual(["rules:relevant:r3", "rules:relevant:missing:functional", "rules:relevant:missing:quality"]);
    expect(within(workflow()).getByText("界面交互 1")).toBeInTheDocument();
    expect(within(workflow()).queryByText("业务规则 1")).not.toBeInTheDocument();
    expect(within(workflow()).queryByText("异常处理 1")).not.toBeInTheDocument();
    expect(inputStates()).toEqual(["ready", "missing", "missing"]);
  });

  it("does not require every category before selecting a use-case model", async () => {
    const user = userEvent.setup();
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "用户提交申请",
      rules: [createRule({ id: "r2", type: "functional" as const, text: "用户提交申请" })],
    });
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));
    await screen.findByRole("figure", { name: "功能结构图的上游输入" });
    await user.hover(screen.getByRole("button", { name: "选择用例模型" }));
    expect(within(workflow()).getByText("功能需求 1").closest("li")).toHaveAttribute("data-state", "ready");
    for (const category of ["业务规则", "数据需求", "外部接口", "异常处理", "质量需求"]) {
      expect(within(workflow()).getByText(`缺少${category}`).closest("li")).toHaveAttribute("data-state", "missing");
    }
    await user.click(screen.getByRole("button", { name: "选择用例模型" }));
    expect(screen.getByRole("checkbox", { name: "用例模型" })).toBeChecked();
  });

  it("shows only the workflow below design cards while inspecting dependencies", async () => {
    const user = userEvent.setup();
    const repository = createCurrentMockWorkspaceRepository({ requirementText: "生成设计", rules: [createRule()] });
    render(withWorkspaceProviders(<DesignModelPage />, repository));

    expect(await screen.findByRole("figure", { name: "总体架构图的上游输入" })).toBeInTheDocument();
    expectWorkflowBelowCards();
    expect(inputKeys()).toEqual(["requirement:function"]);
    expect(inputStates()[0]).toBe("missing");
    expect(screen.queryByText("需求基线提供约束、验收标准与可追踪性。")).not.toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "选择数据库设计" }));
    expect(inputKeys()).toEqual(["design:class"]);
    expect(screen.queryByText(/^间接依赖：/)).not.toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "选择设计类图" }));
    expect(inputKeys()).toEqual(["requirement:class", "requirement:usecase:all-use-cases"]);
    expect(within(workflow()).getByTitle("来源：需求阶段领域概念模型 + 用例事件流")).toBeInTheDocument();

    await user.hover(screen.getByRole("button", { name: "选择页面导航模型" }));
    expect(inputKeys()).toEqual(["requirement:prototype"]);
    expect(within(workflow()).getByTitle("来源：需求阶段原型界面关系")).toBeInTheDocument();
  });
});
