// Verifies the rendered category SVGs agree across cards, dependency illustrations and navigation.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { LucideIcon } from "lucide-react";
import { DESIGN_DIAGRAM_ORDER, DIAGRAM_ORDER, getDesignDiagramLabel, getDiagramLabel } from "../../../entities/diagram/model";
import { i18n } from "../../../shared/i18n";
import { DESIGN_DIAGRAM_ICON, FEASIBILITY_ARTIFACT_ICON, REQUIREMENT_DIAGRAM_ICON } from "../../../entities/diagram/model-icons";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import { createBusinessFlowArtifact, createRule, withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { DesignModelPage } from "../../design/components/design-model-page";
import { FeasibilityPage } from "../../feasibility/components/feasibility-page";
import { TextRequirementView } from "../../requirements/components/text-requirement-page";
import { SidebarMenu } from "./sidebar-menu";

function expectCategoryIcon(node: Element, Icon: LucideIcon) {
  const expected = render(<Icon />).container.querySelector("svg")!;
  expect(node.querySelector("svg")!.innerHTML).toBe(expected.innerHTML);
}

const requirementCategories = DIAGRAM_ORDER.map(kind => ({ label: getDiagramLabel(kind, i18n.t), Icon: REQUIREMENT_DIAGRAM_ICON[kind] }));
const designCategories = DESIGN_DIAGRAM_ORDER.map(kind => ({ label: getDesignDiagramLabel(kind, i18n.t), Icon: DESIGN_DIAGRAM_ICON[kind] }));
const feasibilityCategories = [
  { label: "系统环境图", Icon: FEASIBILITY_ARTIFACT_ICON.context },
  { label: "业务流程图", Icon: FEASIBILITY_ARTIFACT_ICON["business-flow"] },
  { label: "实现方案", Icon: FEASIBILITY_ARTIFACT_ICON.implementation },
];

afterEach(() => localStorage.clear());

describe("shared model category SVGs", () => {
  it.each([
    { stage: "feasibility", page: <FeasibilityPage view="overview" />, categories: feasibilityCategories },
    { stage: "requirements", page: <TextRequirementView view="models" />, categories: requirementCategories },
    { stage: "design", page: <DesignModelPage />, categories: designCategories },
  ])("shares the $stage card icons with the dependency illustration", async ({ page, categories }) => {
    const user = userEvent.setup();
    render(withWorkspaceProviders(page, createMockWorkspaceRepository({ rules: [createRule()] })));
    for (const { label, Icon } of categories) {
      const card = await screen.findByRole("button", { name: label === "业务流程图" ? "选择业务流程图" : `选择${label}` });
      expectCategoryIcon(card, Icon);
      await user.hover(card);
      const figure = screen.getByRole("figure", { name: `${label}的上游输入` });
      // The target symbol shares the same geometry even when the illustration uses a larger size.
      expectCategoryIcon(figure.querySelector('[data-slot="upstream-target"]')!, Icon);
    }
  });

  it("uses each model's SVG for pending menu entries and keeps status indicators separate", async () => {
    const user = userEvent.setup();
    const rules = [createRule()];
    const repository = createMockWorkspaceRepository({
      rules,
      feasibilityContextModel: { diagramKind: "context", modelId: "context", title: "系统环境图", summary: "", notes: [],
        system: { id: "system", name: "系统", sourceRequirementIds: [] }, people: [], externalSystems: [], relationships: [] },
      feasibilityContextPlantUml: "@startuml\n@enduml",
      feasibilityContextSvg: "<svg />",
      feasibilityBusinessFlow: createBusinessFlowArtifact(rules),
    });
    render(withWorkspaceProviders(<SidebarMenu projectRuns={[
      { operationType: "requirement_modeling" as const, runId: "requirements", runKind: "requirements", stage: "generate_models", status: "running", selectedDiagrams: DIAGRAM_ORDER },
      { operationType: "design_modeling" as const, runId: "design", runKind: "design", stage: "generate_design_models", status: "queued", selectedDiagrams: DESIGN_DIAGRAM_ORDER },
    ]} />, repository));
    for (const label of ["可行性分析", "需求模型", "设计模型"]) {
      await user.click(await screen.findByRole("button", { name: `展开 ${label}` }));
    }
    for (const { label, Icon } of [...feasibilityCategories.slice(0, 2), ...requirementCategories, ...designCategories]) {
      expectCategoryIcon(screen.getByRole("button", { name: label }), Icon);
    }
    expect(screen.getByRole("button", { name: "设计类图" }).querySelector('[data-sidebar-status="queued"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "领域概念模型" }).querySelector('[data-sidebar-status="running"]')).not.toBeNull();
  });

  it("keeps scoped analysis and realization groups consistent with their child models", async () => {
    const user = userEvent.setup();
    const repository = createMockWorkspaceRepository({
      models: {
        "analysis:first": { diagramKind: "analysis", modelId: "analysis:first", sourceUseCaseId: "first", sourceUseCaseName: "分析一", title: "分析一", summary: "", notes: [], participants: [], messages: [], fragments: [] },
        "analysis:second": { diagramKind: "analysis", modelId: "analysis:second", sourceUseCaseId: "second", sourceUseCaseName: "分析二", title: "分析二", summary: "", notes: [], participants: [], messages: [], fragments: [] },
      },
      designModels: {
        "sequence:first": { diagramKind: "sequence", modelId: "sequence:first", sourceUseCaseId: "first", sourceUseCaseName: "实现一", title: "实现一", summary: "", notes: [], participants: [], messages: [], fragments: [] },
        "sequence:second": { diagramKind: "sequence", modelId: "sequence:second", sourceUseCaseId: "second", sourceUseCaseName: "实现二", title: "实现二", summary: "", notes: [], participants: [], messages: [], fragments: [] },
      },
    });
    render(withWorkspaceProviders(<SidebarMenu projectRuns={[
      { operationType: "requirement_modeling" as const, runId: "analysis", runKind: "requirements", stage: "generate_models", status: "running", selectedDiagrams: ["analysis"] },
      { operationType: "design_modeling" as const, runId: "sequence", runKind: "design", stage: "generate_design_sequence", status: "running", selectedDiagrams: ["sequence"] },
    ]} />, repository));
    for (const { stage, label, children, Icon } of [
      { stage: "需求模型", label: "需求分析模型", children: ["分析一", "分析二"], Icon: REQUIREMENT_DIAGRAM_ICON.analysis },
      { stage: "设计模型", label: "用例实现设计", children: ["实现一", "实现二"], Icon: DESIGN_DIAGRAM_ICON.sequence },
    ]) {
      await user.click(await screen.findByRole("button", { name: `展开 ${stage}` }));
      expectCategoryIcon(screen.getByRole("button", { name: label }), Icon);
      await user.click(screen.getByRole("button", { name: `展开 ${label}` }));
      for (const child of children) expectCategoryIcon(screen.getByRole("button", { name: child }), Icon);
    }
  });
});
