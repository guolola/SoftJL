// Verifies design model page generation controls, traceability views, and stale diagram handling.
import { createDesignRunSnapshot, createRenderMeta } from "@/test/contract-fixtures";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { designDiagramKindSchema, designDiagramModelSpecSchema, runSnapshotSchema, createRequirementBaselineSnapshot, type DesignRunSnapshot } from "@uml-platform/contracts";
import { librarySeatDemoFixture } from "../../../../../api/src/runs/demo/fixtures/library-seat-demo-fixture";
import { modelFixture } from "../../../../../../packages/contracts/dist/testing/model-fixtures";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRequirementBaseline,
  createUseCaseRelationshipTrace,
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { designInputFingerprint, snapshotInputFingerprint } from "../../../shared/lib/fingerprint";
import { normalizeRequirementTraceabilityWithCoverage } from "../../../../../api/src/normalizers/traceability/traceability-normalizer";
import { DesignModelPage } from "./design-model-page";
import { useWorkspaceShell } from "../../workspace-shell/state";

// Control tests add explicit manual source rules for old demo elements whose original types
// no longer feed those models. Production never invents such source requirements.
function completeRequirementSources() {
  const snapshot = runSnapshotSchema.parse(librarySeatDemoFixture.requirementSnapshot);
  const gaps = normalizeRequirementTraceabilityWithCoverage(snapshot.requirementModelTraceability, snapshot.rules,
    snapshot.models.filter(model => model.diagramKind !== "analysis")).missingTargets;
  for (const [index, target] of gaps.entries()) {
    const rule = createRule({ id: `control-fixture-${index}`, type: target.diagramKind === "deployment" ? "operations" : "functional", text: `测试明确要求：${target.label}` });
    snapshot.rules.push(rule);
    snapshot.requirementModelTraceability.push({ ruleId: rule.id, target, mappingSource: "llm" });
  }
  snapshot.requirementBaseline = createRequirementBaselineSnapshot({ runId: snapshot.runId, requirementText: snapshot.requirementText,
    rules: snapshot.rules, previousBaseline: snapshot.requirementBaseline, origin: "manual" });
  return snapshot;
}

// These fixtures model saved current sources; absent-rule scenarios supply an explicit empty rule list.
function createCurrentWorkspaceRecord(overrides: Parameters<typeof createWorkspaceRecord>[0] = {}) {
  const workspace = createWorkspaceRecord({
    ...(overrides.requirementText && overrides.rules === undefined ? { rules: [createRule()] } : {}),
    ...overrides,
  });
  const fingerprint = snapshotInputFingerprint({ requirementText: workspace.requirementText, rules: workspace.rules });
  return { ...workspace,
    requirementInputFingerprint: Object.hasOwn(overrides, "requirementInputFingerprint") ? workspace.requirementInputFingerprint : fingerprint,
    diagramInputFingerprints: {
      ...Object.fromEntries(Object.values(workspace.models).filter(Boolean).flatMap(model => [[model!.diagramKind, fingerprint], [model!.modelId ?? model!.diagramKind, fingerprint]])),
      ...workspace.diagramInputFingerprints,
    },
  };
}

function createCurrentMockWorkspaceRepository(seed: Parameters<typeof createWorkspaceRecord>[0] = {}) {
  return createMockWorkspaceRepository(createCurrentWorkspaceRecord(seed));
}

type StartDesignRunInput = Parameters<
  NonNullable<WorkspaceRepository["startDesignRun"]>
>[0];

const useCaseModel = {
  diagramKind: "usecase" as const,
  title: "用例模型",
  summary: "系统边界",
  notes: [],
  actors: [{ id: "actor", name: "用户", actorType: "human" as const, responsibilities: [] }],
  useCases: [
    {
      id: "uc",
      name: "生成模型",
      goal: "生成设计模型",
      preconditions: [],
      postconditions: [],
      supportingActorIds: [],
      eventFlows: [],
      systemBoundaryId: "system",
    },
  ],
  systemBoundaries: [{ id: "system", name: "平台" }],
  relationships: [{ id: "participates", type: "association" as const, sourceId: "actor", targetId: "uc" }],
};

const classModel = {
  diagramKind: "class" as const,
  title: "领域概念模型",
  summary: "核心实体",
  notes: [],
  classes: [],
  interfaces: [],
  enums: [],
  relationships: [],
};

const analysisModel = {
  diagramKind: "analysis" as const,
  modelId: "analysis:uc",
  sourceUseCaseId: "uc",
  sourceUseCaseName: "生成模型",
  title: "生成模型需求分析模型",
  summary: "按用例事件流生成的需求分析顺序图",
  notes: [],
  participants: [],
  messages: [],
  fragments: [],
};

const prototypeModel = {
  diagramKind: "prototype" as const,
  modelId: "proto-1",
  title: "原型界面关系",
  summary: "页面入口",
  notes: [],
  nodes: [],
  relationships: [],
};

function storeManagedUserSettings() {
  localStorage.setItem(
    "uml-lab-settings",
    JSON.stringify({
      providerConfigId: "provider-config-1",
      defaultModel: "gpt-5.5",
      providerModelOptions: ["gpt-5.5"],
      autoGenerate: false,
      showStaleBanner: true,
    }),
  );
}

describe("DesignModelPage", () => {
  it("select all regenerates selected successful models even when another design model previously failed", async () => {
    const snapshot = completeRequirementSources();
    const kinds = designDiagramKindSchema.options.filter(kind => kind !== "deployment");
    const savedModels = kinds.map(kind => designDiagramModelSpecSchema.parse(modelFixture("design", kind)));
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: snapshot.requirementText, requirementBaseline: snapshot.requirementBaseline, rules: snapshot.rules,
      rulesVersion: 1, rulesBasedOnTextVersion: 0,
      models: Object.fromEntries(snapshot.models.map(model => [model.modelId ?? model.diagramKind, model])),
      generatedDiagramTypes: [...new Set(snapshot.models.map(model => model.diagramKind))],
      diagramVersions: Object.fromEntries(snapshot.models.map(model => [model.diagramKind, 1])),
      requirementModelTraceability: snapshot.requirementModelTraceability,
      designModels: Object.fromEntries(savedModels.map(model => [model.modelId!, model])),
      generatedDesignDiagramTypes: kinds,
      designSvgArtifacts: Object.fromEntries(savedModels.map(model => [model.modelId!, {
        diagramKind: model.diagramKind, modelId: model.modelId, svg: "<svg/>", renderMeta: createRenderMeta({ engine: "plantuml" }),
      }])),
      designDiagramErrors: { "sequence:failed": { stage: "generate_design_sequence", error: { code: "RUN_RENDER_FAILED", category: "render", message: "之前生成失败", retryable: true } } },
    });
    const startDesignRun = vi.fn(async (_input: StartDesignRunInput) => ({ runId: "regenerate-selected" }));
    repository.startDesignRun = startDesignRun;
    repository.subscribeToDesignRun = vi.fn(async () => {});
    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));
    const group = await screen.findByRole("group", { name: "全选 / 全不选" });
    await user.click(within(group).getByRole("button", { name: "全选" }));
    const independentKinds = ["architecture", "sequence", "class", "navigation"];
    expect(screen.getByRole("checkbox", { name: "部署设计" })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("button", { name: "生成" }));
    const dialog = await screen.findByRole("dialog", { name: "确认生成设计模型" });
    expect(within(dialog).getByRole("heading", { name: "保留不变" })).toBeInTheDocument();
    const updates = within(dialog).getByRole("list", { name: "模型生成范围" });
    expect(updates).toHaveTextContent("总体架构图、用例实现设计、设计类图、界面关系图");
    expect(updates).toHaveTextContent("保留不变数据库设计、组件（构件）关系");
    await user.click(within(dialog).getByRole("button", { name: "确认生成" }));
    await waitFor(() => expect(startDesignRun).toHaveBeenCalledTimes(1));
    expect(new Set(startDesignRun.mock.calls[0][0].requestedDiagrams)).toEqual(new Set(independentKinds));
    expect(new Set(startDesignRun.mock.calls[0][0].selectedDiagrams)).toEqual(new Set(independentKinds));
  });

  it("excludes missing requirement upstreams from card, checkbox, keyboard and bulk selection", async () => {
    const snapshot = completeRequirementSources();
    snapshot.models = snapshot.models.filter(model => model.diagramKind !== "deployment");
    const savedModels = ["class", "component"].map(kind => designDiagramModelSpecSchema.parse(modelFixture("design", kind)));
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: snapshot.requirementText, requirementBaseline: snapshot.requirementBaseline, rules: snapshot.rules,
      models: Object.fromEntries(snapshot.models.map(model => [model.modelId ?? model.diagramKind, model])),
      requirementModelTraceability: snapshot.requirementModelTraceability.filter(entry => entry.target.diagramKind !== "deployment"),
      designModels: Object.fromEntries(savedModels.map(model => [model.modelId!, model])),
      selectedDesignDiagramTypes: ["deployment"],
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));
    const group = await screen.findByRole("group", { name: "全选 / 全不选" });
    const card = screen.getByRole("button", { name: "选择部署设计" });
    const checkbox = within(card).getByRole("checkbox");
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(checkbox).toHaveAttribute("aria-disabled", "true");
    expect(checkbox).not.toBeChecked();
    expect(within(card).queryByText("缺少上游模型：部署需求模型，请先生成")).not.toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "缺少上游模型：部署需求模型，请先生成" })).toHaveAttribute("data-generation-status", "blocked");
    expect(within(card).queryByText(/将自动补齐/)).not.toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    await user.click(card);
    await user.click(checkbox);
    act(() => card.focus());
    await user.keyboard("{Enter} ");
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
    await user.click(within(group).getByRole("button", { name: "全选" }));
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("4/7")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "生成" }));
    const confirmation = await screen.findByRole("dialog", { name: "确认生成设计模型" });
    expect(confirmation).not.toHaveTextContent("部署设计");
    expect(confirmation).not.toHaveTextContent("部署需求模型");
  });

  it("select all skips design targets whose upstream requirement model is stale", async () => {
    const snapshot = completeRequirementSources();
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: snapshot.requirementText, requirementBaseline: snapshot.requirementBaseline, rules: snapshot.rules,
      rulesVersion: 2, rulesBasedOnTextVersion: 0,
      models: Object.fromEntries(snapshot.models.map(model => [model.modelId ?? model.diagramKind, model])),
      generatedDiagramTypes: [...new Set(snapshot.models.map(model => model.diagramKind))],
      diagramVersions: Object.fromEntries(snapshot.models.map(model => [model.diagramKind, model.diagramKind === "class" ? 1 : 2])),
      diagramInputFingerprints: { class: "stale:previous-rule-input" },
      requirementModelTraceability: snapshot.requirementModelTraceability,
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));
    const group = await screen.findByRole("group", { name: "全选 / 全不选" });
    await user.click(within(group).getByRole("button", { name: "全选" }));
    for (const label of ["设计类图", "数据库设计", "组件（构件）关系", "部署设计"]) {
      const checkbox = screen.getByRole("checkbox", { name: label });
      expect(checkbox).toHaveAttribute("aria-disabled", "true");
      expect(checkbox).not.toBeChecked();
    }
    expect(screen.getByText("3/7")).toBeInTheDocument();
  });

  it("keeps a downstream target blocked until its stale class source has actually been regenerated", async () => {
    const snapshot = completeRequirementSources();
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: snapshot.requirementText, requirementBaseline: snapshot.requirementBaseline, rules: snapshot.rules,
      rulesVersion: 1, rulesBasedOnTextVersion: 0,
      models: Object.fromEntries(snapshot.models.map(model => [model.modelId ?? model.diagramKind, model])),
      generatedDiagramTypes: [...new Set(snapshot.models.map(model => model.diagramKind))],
      diagramVersions: Object.fromEntries(snapshot.models.map(model => [model.diagramKind, 1])),
      requirementModelTraceability: snapshot.requirementModelTraceability,
      designModels: { class: { ...classModel, modelId: "class" } }, designInputFingerprints: { class: "old-input" },
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));
    await screen.findByRole("heading", { name: "目标模型" });
    const table = screen.getByRole("checkbox", { name: "数据库设计" });
    await waitFor(() => expect(table).toHaveAttribute("aria-disabled", "true"));
    await user.click(screen.getByRole("checkbox", { name: "设计类图" }));
    expect(table).toHaveAttribute("aria-disabled", "true");
    await user.click(table);
    expect(table).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "设计类图" })).toBeChecked();
  });

  it.each([false, true])("keeps available design targets independently selectable with custom saved requirement IDs: %s", async (customIds) => {
    const snapshot = completeRequirementSources();
    if (customIds) {
      // Match production records whose IDs differ from their diagram kinds.
      const kinds = new Set(["function", "usecase", "class", "deployment"]);
      snapshot.models = snapshot.models.map((model) => kinds.has(model.diagramKind)
        ? { ...model, modelId: `saved-home-security-${model.diagramKind}` }
        : model);
      snapshot.requirementModelTraceability = snapshot.requirementModelTraceability.map((entry) => ({
        ...entry,
        target: kinds.has(entry.target.diagramKind)
          ? { ...entry.target, modelId: `saved-home-security-${entry.target.diagramKind}` }
          : entry.target,
      }));
    }
    const savedDesignSources = ["class", "component"].map(kind => designDiagramModelSpecSchema.parse(modelFixture("design", kind)));
    const repository = createCurrentMockWorkspaceRepository({
      designModels: Object.fromEntries(savedDesignSources.map(model => [model.modelId!, model])),
      designInputFingerprints: Object.fromEntries(savedDesignSources.map(model => [model.modelId!, designInputFingerprint(snapshot.models, snapshot.requirementModelTraceability)])),
      requirementText: snapshot.requirementText,
      requirementBaseline: snapshot.requirementBaseline,
      rules: snapshot.rules,
      rulesVersion: 1,
      rulesBasedOnTextVersion: 0,
      models: Object.fromEntries(snapshot.models.map((model) => [model.modelId ?? model.diagramKind, model])),
      generatedDiagramTypes: [...new Set(snapshot.models.map((model) => model.diagramKind))],
      diagramVersions: Object.fromEntries(snapshot.models.map((model) => [model.diagramKind, 1])),
      requirementModelTraceability: snapshot.requirementModelTraceability,
    });
    const startDesignRun = vi.fn(async (_input: StartDesignRunInput) => ({ runId: "demo-design-run" }));
    repository.startDesignRun = startDesignRun;
    repository.subscribeToDesignRun = vi.fn(async () => {});
    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByRole("heading", { name: "目标模型" });
    for (const label of ["总体架构图", "用例实现设计", "设计类图", "页面导航模型", "数据库设计", "组件（构件）关系", "部署设计"]) {
      const checkbox = screen.getByRole("checkbox", { name: label });
      await waitFor(() => expect(checkbox).not.toHaveAttribute("aria-disabled", "true"));
      await user.click(screen.getByRole("button", { name: `选择${label}` }));
      expect(checkbox).toBeChecked();
      await user.click(checkbox);
    }
    await user.click(screen.getByRole("checkbox", { name: "设计类图" }));
    const tableCard = screen.getByRole("button", { name: "选择数据库设计" });
    const selectionReason = "已选择设计类图，上下游模型不能在同一批生成。";
    const blockedIcon = within(tableCard).getByRole("img", { name: selectionReason });
    await user.hover(tableCard);
    await user.hover(blockedIcon);
    await waitFor(() => expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(selectionReason));
    expect(screen.queryByText("请先更新并确认所需的需求模型")).not.toBeInTheDocument();
    await user.unhover(blockedIcon);
    for (const label of ["数据库设计", "组件（构件）关系", "部署设计"]) {
      const checkbox = screen.getByRole("checkbox", { name: label });
      expect(checkbox).toHaveAttribute("aria-disabled", "true");
      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
    }
    await user.click(screen.getByRole("checkbox", { name: "设计类图" }));
    await user.click(screen.getByRole("checkbox", { name: "组件（构件）关系" }));
    expect(screen.getByRole("checkbox", { name: "设计类图" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("checkbox", { name: "部署设计" })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("checkbox", { name: "数据库设计" }));
    expect(screen.getByRole("checkbox", { name: "数据库设计" })).toBeChecked();
    const group = screen.getByRole("group", { name: "全选 / 全不选" });
    await user.click(within(group).getByRole("button", { name: "全不选" }));
    expect(screen.getByText("0/7")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").every((checkbox) => checkbox.getAttribute("aria-checked") !== "true")).toBe(true);
    await user.click(within(group).getByRole("button", { name: "全选" }));
    expect(screen.getByText("4/7")).toBeInTheDocument();
    expect(screen.queryByText(/需求模型之间的追踪关系不完整/)).not.toBeInTheDocument();
    expect(screen.queryByText(/将自动补齐：/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "生成" }));
    const confirmation = await screen.findByRole("dialog", { name: "确认生成设计模型" });
    await user.click(within(confirmation).getByRole("button", { name: "确认生成" }));
    await waitFor(() => expect(startDesignRun).toHaveBeenCalledTimes(1));
    expect(new Set(startDesignRun.mock.calls[0][0].requestedDiagrams)).toEqual(new Set(["architecture", "sequence", "class", "navigation"]));
    expect(startDesignRun.mock.calls[0][0].requirementModels).toEqual(snapshot.models);
  });

  it("shows real model eligibility independently of design prerequisites", async () => {
    localStorage.clear();
    const repository = createCurrentMockWorkspaceRepository({ requirementText: "生成设计", rules: [createRule()], models: { usecase: useCaseModel }, selectedDesignDiagramTypes: ["sequence"] });
    repository.getProjectAccess = async () => ({ capabilities: ["update_project", "start_runs"], generationExecutionMode: "provider" });
    repository.startDesignRun = vi.fn();
    render(withWorkspaceProviders(<DesignModelPage />, repository));
    const targetHeading = await screen.findByRole("heading", { name: "目标模型" });
    const targetRow = targetHeading.parentElement?.parentElement as HTMLElement;
    expect(within(targetRow).getByText("0/7")).toBeInTheDocument();
    expect(within(targetRow).getByRole("combobox", { name: "选择模型" })).toBeEnabled();
    const button = await screen.findByRole("button", { name: "生成" });
    expect(button).toHaveClass("h-7", "px-2.5");
    expect(within(targetRow).getByRole("button", { name: "生成" })).toBe(button);
    expect(button).toBeDisabled();
    expect(screen.queryByText("未选择模型供应商")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "选择模型" })).toBeEnabled();
    await userEvent.setup().click(button);
    expect(repository.startDesignRun).not.toHaveBeenCalled();
    act(() => patchUserSettings({ providerConfigId: "provider-1", defaultModel: "model-1", providerModelOptions: ["model-1"] }));
    expect(screen.queryByText("未选择模型供应商")).not.toBeInTheDocument();
  });

  beforeEach(() => {
    storeManagedUserSettings();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("does not interrupt an empty project with an automatic prerequisite dialog", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createCurrentWorkspaceRecord()),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };
    const user = userEvent.setup();

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    const reopen = await screen.findByRole("button", { name: "有 1 项需要处理" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(reopen);
    const guidance = screen.getByRole("dialog", {
      name: "设计模型暂时无法生成",
    });
    expect(guidance).toHaveTextContent("请先输入并确认系统需求");
    expect(guidance).not.toHaveTextContent("影响：");
    expect(guidance).not.toHaveTextContent("技术详情");
    expect(
      within(guidance).getByRole("button", { name: "前往系统需求" }),
    ).toBeInTheDocument();
  });

  it("opens the trace matrix for the requirement model with a coverage gap", async () => {
    const snapshot = completeRequirementSources();
    const repository = createCurrentMockWorkspaceRepository({
      models: Object.fromEntries(snapshot.models.map(model => [model.modelId ?? model.diagramKind, model])),
      requirementModelTraceability: snapshot.requirementModelTraceability.filter(entry => entry.target.diagramKind !== "class"),
      rules: snapshot.rules, requirementText: snapshot.requirementText, requirementBaseline: snapshot.requirementBaseline,
      generatedDiagramTypes: snapshot.models.map(model => model.diagramKind),
      selectedDesignDiagramTypes: ["class"],
    });
    function SelectionProbe() {
      const { selection } = useWorkspaceShell();
      return <output data-testid="workspace-selection">{
        selection.kind === "requirement-trace-matrix" ? selection.diagram : selection.kind
      }</output>;
    }
    render(withWorkspaceProviders(<><DesignModelPage /><SelectionProbe /></>, repository));
    const target = await screen.findByRole("checkbox", { name: "设计类图" });
    expect(target).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("需求模型追踪关系不完整，请先回到需求页处理")).not.toBeInTheDocument();
  });

  it("keeps architecture selectable when only domain model traceability is incomplete", async () => {
    const snapshot = completeRequirementSources();
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: snapshot.requirementText, rules: snapshot.rules,
      requirementBaseline: snapshot.requirementBaseline,
      models: Object.fromEntries(snapshot.models.map(model => [model.modelId ?? model.diagramKind, model])),
      generatedDiagramTypes: snapshot.models.map(model => model.diagramKind),
      requirementModelTraceability: snapshot.requirementModelTraceability.filter(entry => entry.target.diagramKind !== "class"),
    });
    render(withWorkspaceProviders(<DesignModelPage />, repository));
    const architecture = await screen.findByRole("checkbox", { name: "总体架构图" });
    await waitFor(() => expect(architecture).not.toHaveAttribute("aria-disabled", "true"));
    expect(screen.getByRole("checkbox", { name: "设计类图" })).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: "选择总体架构图" }));
    expect(architecture).toBeChecked();
  });

  it("treats per-use-case analysis models as available requirement sources", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
            "analysis:uc": analysisModel,
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const { container } = render(
      withWorkspaceProviders(<DesignModelPage />, repository),
    );

    const modelGrid = container.querySelector('[data-workspace-density="compact-grid"]');
    expect(modelGrid).toBeInTheDocument();
    expect(modelGrid).toHaveAttribute("data-mobile-card-density", "model-targets");
    expect(modelGrid).toHaveClass("grid-cols-2");
    expect(modelGrid?.className).toContain("min-[1900px]:grid-cols-6");
  });

  it("treats generated prototype model aliases as available requirement sources", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [createRule({  })],
          models: {
            usecase: useCaseModel,
            "proto-1": prototypeModel,
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /页面导航模型/ })).not.toHaveAttribute("aria-disabled", "true"));
  });

  it("generates navigation without adding a sequence dependency", async () => {
    const snapshot: DesignRunSnapshot = createDesignRunSnapshot({
      runId: "design-run",
      requirementText: "生成 UML",
      selectedDiagrams: ["navigation"],
      rules: [],
      requirementBaseline: createRequirementBaseline(),
      requirementModels: [useCaseModel],
      models: [
        {
          diagramKind: "sequence",
          title: "用例实现设计",
          summary: "动态行为",
          notes: [],
          participants: [{ id: "actor", name: "用户", participantType: "actor" }],
          messages: [],
          fragments: [],
        },
      ],
      plantUml: [{ diagramKind: "sequence", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "sequence",
          svg: "<svg><text>sequence</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: new Date().toISOString(),
            sourceLength: 16,
            durationMs: 1,
          },
        },
      ],
      diagramErrors: {},
      designTrace: [],
      currentStage: "render_svg",
      status: "completed",
      error: null,
    });
    const startDesignRun = vi.fn(async () => ({ runId: "design-run" }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "生成 UML",
          requirementBaseline: createRequirementBaseline(),
          rules: [createRule({  })],
          rulesVersion: 1,
          models: {
            usecase: useCaseModel,
            prototype: prototypeModel,
            "analysis:uc": analysisModel,
          },
          generatedDiagramTypes: ["usecase", "prototype", "analysis"],
          diagramVersions: { usecase: 1, prototype: 1, analysis: 1 },
          requirementModelTraceability: [
            ...createUseCaseRelationshipTrace(useCaseModel, "r1"),
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "actor",
                elementKind: "actor",
                label: "用户",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "uc",
                elementKind: "usecase",
                label: "生成模型",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "system",
                elementKind: "system-boundary",
                label: "平台",
              },
            },
          ],
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun,
      subscribeToDesignRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "completed", snapshot });
      }),
      getDesignRunSnapshot: vi.fn(async () => snapshot),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "选择页面导航模型" }));
    expect(screen.getByRole("checkbox", { name: /用例实现设计/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /页面导航模型/ })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "生成" }));
    const confirmation = await screen.findByRole("dialog", { name: "确认生成设计模型" });
    expect(within(confirmation).queryByText("设计依赖补齐")).not.toBeInTheDocument();
    expect(within(confirmation).queryByText("用例实现设计")).not.toBeInTheDocument();
    await userEvent.click(within(confirmation).getByRole("button", { name: "确认生成" }));

    await waitFor(() => {
      expect(startDesignRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDiagrams: ["navigation"],
          requestedDiagrams: ["navigation"],
        }),
      );
    });
    const input = (startDesignRun.mock.calls[0] as unknown as [StartDesignRunInput] | undefined)?.[0];
    expect(input).not.toHaveProperty("requirementText");
    expect(input).not.toHaveProperty("rules");
    expect(input).toHaveProperty("requirementBaseline");
  });

  it("requires saved design upstreams even when their generation targets are selected", async () => {
    const snapshot = completeRequirementSources();
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: snapshot.requirementText, rules: snapshot.rules,
      requirementBaseline: snapshot.requirementBaseline,
      models: Object.fromEntries(snapshot.models.map(model => [model.modelId ?? model.diagramKind, model])),
      requirementModelTraceability: snapshot.requirementModelTraceability,
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));
    const group = await screen.findByRole("group", { name: "全选 / 全不选" });
    await user.click(within(group).getByRole("button", { name: "全选" }));
    expect(screen.getByRole("checkbox", { name: "设计类图" })).toBeChecked();
    for (const label of ["数据库设计", "组件（构件）关系", "部署设计"]) {
      const checkbox = screen.getByRole("checkbox", { name: label });
      expect(checkbox).toHaveAttribute("aria-disabled", "true");
      expect(checkbox).not.toBeChecked();
    }
    expect(screen.getByText("4/7")).toBeInTheDocument();
    const deployment = screen.getByRole("button", { name: "选择部署设计" });
    const warning = within(deployment).getByRole("img", { name: "缺少上游模型：组件（构件）关系，请先生成" });
    expect(within(deployment).queryByText("缺少上游模型：组件（构件）关系，请先生成")).not.toBeInTheDocument();
    await user.hover(warning);
    expect(await screen.findByText("缺少上游模型：组件（构件）关系，请先生成")).toBeVisible();
    await user.unhover(warning);
    await user.click(deployment);
    expect(screen.getByRole("checkbox", { name: "部署设计" })).not.toBeChecked();
  });

  it("blocks navigation when its prototype source is missing", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [createRule({  })],
          requirementBaseline: createRequirementBaseline(),
          models: {
            usecase: useCaseModel,
            activity: {
              diagramKind: "activity",
              title: "需求活动图",
              summary: "业务流转",
              notes: [],
              swimlanes: [],
              nodes: [],
              relationships: [],
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    expect(screen.getByRole("checkbox", { name: /页面导航模型/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("img", { name: "缺少上游模型：原型界面关系，请先生成" })).toBeInTheDocument();
    expect(screen.queryByText("缺少上游模型：原型界面关系，请先生成")).not.toBeInTheDocument();
  });

  it("disables design targets and clears selection when requirement upstreams are missing", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [createRule({  })],
          models: {
            usecase: useCaseModel,
          },
          selectedDesignDiagramTypes: ["class"],
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    const sequenceCheckbox = screen.getByRole("checkbox", { name: /用例实现设计/ });
    const classDiagramCheckbox = screen.getByRole("checkbox", { name: /设计类图/ });
    expect(sequenceCheckbox).toHaveAttribute("aria-disabled", "true");
    expect(classDiagramCheckbox).toHaveAttribute("aria-disabled", "true");
    expect(classDiagramCheckbox).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "选择设计类图" }));
    expect(classDiagramCheckbox).not.toBeChecked();
    expect(screen.getByRole("img", { name: "缺少上游模型：领域概念模型，请先生成" })).toBeInTheDocument();
    expect(screen.getByText("0/7")).toBeInTheDocument();
    expect(screen.queryByText("0/1")).not.toBeInTheDocument();
  });

  it("blocks downstream design targets when the use-case source is missing", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [createRule({  })],
          models: {
            class: classModel,
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    const sequenceCheckbox = screen.getByRole("checkbox", { name: /用例实现设计/ });
    const classDiagramCheckbox = screen.getByRole("checkbox", { name: /设计类图/ });
    expect(sequenceCheckbox).toBeEnabled();
    expect(classDiagramCheckbox).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "选择设计类图" }));
    expect(classDiagramCheckbox).not.toBeChecked();
  });

  it.each(["usecase", "usecase-home-security"])("disables sequence generation for an empty use case model saved as %s", async (modelId) => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            [modelId]: {
              ...useCaseModel,
              modelId,
              useCases: [],
            },
          },
          selectedDesignDiagramTypes: ["sequence"],
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    expect(screen.getByRole("checkbox", { name: /用例实现设计/ })).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getAllByRole("img", { name: "需求阶段用例模型没有可用于设计的用例" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
  });

  it("blocks design generation when existing requirement model inputs are stale", async () => {
    const startRun = vi.fn();
    const startDesignRun = vi.fn();
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [createRule()],
          rulesVersion: 2,
          rulesBasedOnTextVersion: 1,
          models: {
            usecase: useCaseModel, "analysis:uc": analysisModel,
          },
          generatedDiagramTypes: ["usecase"],
          diagramVersions: { usecase: 1 },
          diagramInputFingerprints: { usecase: "stale:previous-rule-input" },
          requirementModelTraceability: [
            ...createUseCaseRelationshipTrace(useCaseModel, "r1"),
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "actor",
                elementKind: "actor",
                label: "用户",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "uc",
                elementKind: "usecase",
                label: "生成模型",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "system",
                elementKind: "system-boundary",
                label: "平台",
              },
            },
          ],
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun,
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun,
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    expect(screen.getByRole("checkbox", { name: /用例实现设计/ })).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getAllByRole("img", { name: /已有需求阶段用例模型基于旧规则，请先回到需求页更新/ }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
    expect(startRun).not.toHaveBeenCalled();
    expect(startDesignRun).not.toHaveBeenCalled();
  });

  it("allows selecting class generation when existing use-case realization coverage is incomplete", async () => {
    const startDesignRun = vi.fn();
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel, "analysis:uc": analysisModel,
            class: classModel,
          },
          selectedDesignDiagramTypes: ["class"],
          generatedDesignDiagramTypes: ["sequence", "class"],
          designModels: {
            "sequence:uc_old": {
              diagramKind: "sequence",
              modelId: "sequence:uc_old",
              sourceUseCaseId: "uc_old",
              sourceUseCaseName: "旧用例",
              title: "旧用例实现设计",
              summary: "旧动态行为",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
            class: {
              diagramKind: "class",
              title: "设计类图",
              summary: "已生成设计类图",
              notes: [],
              classes: [],
              interfaces: [],
              enums: [],
              relationships: [],
            },
          },
          designSvgArtifacts: {
            "sequence:uc_old": {
              diagramKind: "sequence",
              modelId: "sequence:uc_old",
              svg: "<svg><text>旧用例实现设计</text></svg>",
              renderMeta: createRenderMeta({ engine: "plantuml" }),
            },
            class: {
              diagramKind: "class",
              svg: "<svg><text>设计类图</text></svg>",
              renderMeta: createRenderMeta({ engine: "plantuml" }),
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun,
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByRole("img", { name: /用例实现设计：/, hidden: true });
    expect(screen.getByText("0/7")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "设计模型暂时无法生成" })).not.toBeInTheDocument();
    expect(screen.queryByText("已有用例实现设计覆盖不足，请先手动更新用例实现设计")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /设计类图/ }));
    expect(screen.getByRole("checkbox", { name: /设计类图/ })).toBeChecked();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成" })).toBeEnabled();
    expect(screen.getByRole("img", { name: /用例实现设计：/ })).toBeInTheDocument();
    expect(screen.queryByText("已生成设计模型")).not.toBeInTheDocument();
    expect(startDesignRun).not.toHaveBeenCalled();
  });

  it("selects generated design diagram cards without showing navigation actions", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [createRule({  })],
          models: {
            usecase: useCaseModel, "analysis:uc": analysisModel,
          },
          selectedDesignDiagramTypes: ["sequence"],
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            "sequence:uc_view": {
              diagramKind: "sequence",
              modelId: "sequence:uc_view",
              sourceUseCaseId: "uc_view",
              sourceUseCaseName: "查看活动",
              title: "查看活动用例实现设计",
              summary: "查看活动动态行为",
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
              summary: "创建活动动态行为",
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
              renderMeta: createRenderMeta({ engine: "plantuml" }),
            },
            "sequence:uc_create": {
              diagramKind: "sequence",
              modelId: "sequence:uc_create",
              svg: "<svg><text>创建活动</text></svg>",
              renderMeta: createRenderMeta({ engine: "plantuml" }),
            },
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));

    const sequenceCheckbox = await screen.findByRole("checkbox", {
      name: /用例实现设计/,
    });
    const sequenceCard = screen.getByRole("button", { name: "选择用例实现设计" });
    expect(sequenceCard).toHaveClass("min-h-[260px]", "sm:min-h-[284px]");
    expect(sequenceCard).toHaveAttribute("data-slot", "spotlight-card");
    expect(sequenceCheckbox).not.toBeChecked();
    expect(within(sequenceCard).getByText("2")).toBeInTheDocument();
    expect(within(sequenceCard).getByRole("img", { name: /用例实现设计：/ })).toBeInTheDocument();
    expect(screen.queryByText("2 个用例实现设计")).not.toBeInTheDocument();

    expect(within(sequenceCard).queryByRole("button", { name: /查看|打开/ })).not.toBeInTheDocument();
    await user.click(sequenceCard);
    expect(sequenceCheckbox).toBeChecked();
    await user.click(sequenceCard);
    expect(sequenceCheckbox).not.toBeChecked();
  });

  it("does not show confirmed auto-filled design traceability as pending repair records", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
          },
          selectedDesignDiagramTypes: ["sequence"],
          generatedDesignDiagramTypes: ["sequence"],
          designModels: {
            "sequence:uc": {
              diagramKind: "sequence",
              modelId: "sequence:uc",
              sourceUseCaseId: "uc",
              sourceUseCaseName: "生成模型",
              title: "生成模型用例实现设计",
              summary: "动态行为",
              notes: [],
              participants: [
                {
                  id: "api",
                  name: "编排 API",
                  participantType: "service",
                },
              ],
              messages: [],
              fragments: [],
            },
          },
          designModelTraceability: [
            {
              source: {
                modelId: "sequence:uc",
                diagramKind: "sequence",
                elementId: "api",
                elementKind: "participant",
                label: "编排 API",
              },
              targets: [
                {
                  diagramKind: "usecase",
                  elementId: "uc",
                  elementKind: "usecase",
                  label: "生成模型",
                },
              ],
              mappingSource: "llm",
              rationale: "设计元素缺少上游来源，AI 自动补齐到需求用例。",
            },
          ],
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    expect(screen.queryByText("设计模型 AI 修复记录")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/设计元素缺少上游来源，系统自动补齐到需求用例/u),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /查看设计模型追踪证明/u }),
    ).not.toBeInTheDocument();
  });

  it("blocks database design until its class model has been generated", async () => {
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "生成 UML", models: { usecase: useCaseModel, class: classModel },
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));
    const table = await screen.findByRole("checkbox", { name: "数据库设计" });
    expect(table).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("button", { name: "选择数据库设计" }));
    expect(table).not.toBeChecked();
    expect(within(screen.getByRole("button", { name: "选择数据库设计" })).getByRole("img", { name: "缺少上游模型：设计类图，请先生成" })).toBeInTheDocument();
    expect(screen.queryByText("缺少上游模型：设计类图，请先生成")).not.toBeInTheDocument();
  });

  it("allows database design when the current design class diagram is keyed by model id", async () => {
    const designClassModel = {
      diagramKind: "class" as const,
      modelId: "class:design-class-diagram",
      title: "设计类图",
      summary: "按当前需求生成的设计类图",
      notes: [],
      classes: [],
      interfaces: [],
      enums: [],
      relationships: [],
    };
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
            class: classModel,
          },
          designModels: {
            "class:design-class-diagram": designClassModel,
          },
          designInputFingerprints: {
            "class:design-class-diagram": designInputFingerprint(
              [useCaseModel, classModel],
              [],
            ),
          },
        }),
      ),
      updateRequirementText: vi.fn(async () => {}),
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(),
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),
      renderPlantUml: vi.fn(),
      testProviderSettings: vi.fn(),
      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    expect(screen.queryByText("设计类图已存在但基于旧需求，请先手动更新设计类图")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /数据库设计/ })).toBeEnabled();
  });
});
