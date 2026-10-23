// Verifies model entries, upstream explanations, and scoped navigation remain accessible.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { DESIGN_DIAGRAM_ORDER, DIAGRAM_ORDER, getDesignDiagramLabel, getDiagramLabel } from "../../../entities/diagram/model";
import { i18n } from "../../../shared/i18n/index";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import { createBusinessFlowArtifact, createRule, withWorkspaceProviders } from "../../../../tests/helpers/workspace-test-utils";
import { DesignModelPage } from "../../design/components/design-model-page";
import { FeasibilityPage } from "../../feasibility/components/feasibility-page";
import { TextRequirementView } from "../../requirements/components/text-requirement-page";
import { SidebarMenu } from "./sidebar-menu";

const requirementCategories = DIAGRAM_ORDER.map(kind => ({ label: getDiagramLabel(kind, i18n.t) }));
const designCategories = DESIGN_DIAGRAM_ORDER.map(kind => ({ label: getDesignDiagramLabel(kind, i18n.t) }));
const feasibilityCategories = [
  { label: "系统环境图" },
  { label: "业务流程图" },
  { label: "实现方案" },
];

afterEach(() => localStorage.clear());

describe("model category navigation", () => {
  it.each([
    { stage: "feasibility", page: <FeasibilityPage view="overview" />, categories: feasibilityCategories },
    { stage: "requirements", page: <TextRequirementView view="models" />, categories: requirementCategories },
    { stage: "design", page: <DesignModelPage />, categories: designCategories },
  ])("opens the matching upstream explanation for each $stage model", async ({ page, categories }) => {
    const user = userEvent.setup();
    render(withWorkspaceProviders(page, createMockWorkspaceRepository({ rules: [createRule()] })));
    for (const { label } of categories) {
      const card = await screen.findByRole("button", { name: label === "业务流程图" ? "选择业务流程图" : `选择${label}` });
      expect(card).toBeVisible();
      await user.hover(card);
      const figure = screen.getByRole("figure", { name: `${label}的上游输入` });
      // Hovering a model exposes its corresponding upstream explanation.
      expect(figure).toBeVisible();
    }
  });

  it("shows model entries with their pending run states", async () => {
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
    for (const { label } of [...feasibilityCategories.slice(0, 2), ...requirementCategories, ...designCategories]) {
      expect(screen.getByRole("button", { name: label })).toBeVisible();
    }
    expect(screen.getByRole("button", { name: "设计类图" }).querySelector('[data-sidebar-status="queued"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "领域概念模型" }).querySelector('[data-sidebar-status="running"]')).not.toBeNull();
  });

  it("expands scoped analysis and realization groups to their child models", async () => {
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
    for (const { stage, label, children } of [
      { stage: "需求模型", label: "需求分析模型", children: ["分析一", "分析二"] },
      { stage: "设计模型", label: "用例实现设计", children: ["实现一", "实现二"] },
    ]) {
      await user.click(await screen.findByRole("button", { name: `展开 ${stage}` }));
      expect(screen.getByRole("button", { name: label })).toBeVisible();
      await user.click(screen.getByRole("button", { name: `展开 ${label}` }));
      for (const child of children) expect(screen.getByRole("button", { name: child })).toBeVisible();
    }
  });
});
