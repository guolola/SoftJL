// Verifies design model page generation controls, traceability views, and stale diagram handling.
import { createDesignRunSnapshot, createRenderMeta } from "../../../test/artifact-fixtures";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { designDiagramKindSchema, runSnapshotSchema, type DesignRunSnapshot } from "@uml-platform/contracts";
import { librarySeatDemoFixture } from "../../../../../api/src/runs/demo/fixtures/library-seat-demo-fixture";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRequirementBaseline,
  createUseCaseRelationshipTrace,
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { designInputFingerprint } from "../../../shared/lib/fingerprint";
import { DesignModelPage } from "./design-model-page";
import { useWorkspaceShell } from "../../workspace-shell/state";

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
      imageModel: "nano-banana-pro",
      fontSize: "md",
      autoGenerate: false,
      showStaleBanner: true,
    }),
  );
}

describe("DesignModelPage", () => {
  it.each([false, true])("allows all seven design targets with custom saved requirement IDs: %s", async (customIds) => {
    const snapshot = runSnapshotSchema.parse(librarySeatDemoFixture.requirementSnapshot);
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
    const repository = createMockWorkspaceRepository({
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
    }
    expect(screen.getByText("7/7")).toBeInTheDocument();
    expect(screen.queryByText(/需求模型之间的追踪关系不完整/)).not.toBeInTheDocument();
    expect(screen.queryByText(/将自动补齐：/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /生成设计模型/ }));
    const confirmation = await screen.findByRole("dialog", { name: "确认生成设计模型" });
    await user.click(within(confirmation).getByRole("button", { name: "确认生成" }));
    await waitFor(() => expect(startDesignRun).toHaveBeenCalledTimes(1));
    expect(new Set(startDesignRun.mock.calls[0][0].requestedDiagrams)).toEqual(new Set(designDiagramKindSchema.options));
    expect(startDesignRun.mock.calls[0][0].requirementModels).toEqual(snapshot.models);
  });

  it("shows real model eligibility independently of design prerequisites", async () => {
    localStorage.clear();
    const repository = createMockWorkspaceRepository({ requirementText: "生成设计", rules: [createRule()], models: { usecase: useCaseModel }, selectedDesignDiagramTypes: ["sequence"] });
    repository.getProjectAccess = async () => ({ capabilities: ["update_project", "start_runs"], generationExecutionMode: "provider" });
    repository.startDesignRun = vi.fn();
    render(withWorkspaceProviders(<DesignModelPage />, repository));
    const targetHeading = await screen.findByRole("heading", { name: "目标模型" });
    const targetRow = targetHeading.parentElement?.parentElement as HTMLElement;
    expect(within(targetRow).getByText("0/7")).toBeInTheDocument();
    expect(within(targetRow).getByRole("button", { name: "未选择模型" })).toBeEnabled();
    const button = await screen.findByRole("button", { name: /生成设计模型/ });
    expect(within(targetRow).getByRole("button", { name: /生成设计模型/ })).toBe(button);
    expect(button).toBeDisabled();
    expect(screen.queryByText("未选择模型供应商")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "未选择模型" })).toBeEnabled();
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
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
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
      restoreRunHistory: vi.fn(async () => null),
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
    const repository = createMockWorkspaceRepository({
      requirementText: "生成 UML",
      rules: [createRule()],
      models: { class: classModel },
      generatedDiagramTypes: ["class"],
      selectedDesignDiagramTypes: ["class"],
    });
    function SelectionProbe() {
      const { selection } = useWorkspaceShell();
      return <output data-testid="workspace-selection">{
        selection.kind === "requirement-trace-matrix" ? selection.diagram : selection.kind
      }</output>;
    }
    const user = userEvent.setup();
    render(withWorkspaceProviders(<><DesignModelPage /><SelectionProbe /></>, repository));
    await screen.findByRole("heading", { name: "目标模型" });
    await user.click(await screen.findByRole("button", { name: /需要处理/ }));
    const guidance = screen.getByRole("dialog", { name: "设计模型暂时无法生成" });
    await user.click(within(guidance).getByRole("button", { name: "查看跟踪矩阵" }));

    expect(screen.getByTestId("workspace-selection")).toHaveTextContent("class");
  });

  it("treats per-use-case analysis models as available requirement sources", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
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
      restoreRunHistory: vi.fn(async () => null),
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
        createWorkspaceRecord({
          requirementText: "生成 UML",
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
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    expect(screen.getByRole("checkbox", { name: /页面导航模型/ })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("keeps downstream design selection separate and confirms missing sequence dependency", async () => {
    const snapshot: DesignRunSnapshot = createDesignRunSnapshot({
      runId: "design-run",
      requirementText: "生成 UML",
      selectedDiagrams: ["sequence", "navigation"],
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
        createWorkspaceRecord({
          requirementText: "生成 UML",
          requirementBaseline: createRequirementBaseline(),
          rules: [createRule({ relatedDiagrams: ["usecase", "prototype"] })],
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
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "选择页面导航模型" }));
    expect(screen.getByRole("checkbox", { name: /用例实现设计/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /页面导航模型/ })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: /生成设计模型/ }));
    const confirmation = await screen.findByRole("dialog", { name: "确认生成设计模型" });
    expect(within(confirmation).getByText("设计依赖补齐")).toBeInTheDocument();
    expect(within(confirmation).getByText("用例实现设计")).toBeInTheDocument();
    await userEvent.click(within(confirmation).getByRole("button", { name: "确认生成" }));

    await waitFor(() => {
      expect(startDesignRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDiagrams: ["sequence", "navigation"],
          requestedDiagrams: ["navigation"],
        }),
      );
    });
    const input = (startDesignRun.mock.calls[0] as unknown as [StartDesignRunInput] | undefined)?.[0];
    expect(input).not.toHaveProperty("requirementText");
    expect(input).not.toHaveProperty("rules");
    expect(input).toHaveProperty("requirementBaseline");
  });

  it("auto-fills component and class dependencies before deployment design", async () => {
    const startDesignRun = vi.fn(async () => ({ runId: "design-run" }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          requirementBaseline: createRequirementBaseline(),
          rules: [
            createRule({
              relatedDiagrams: ["usecase", "class", "deployment"],
            }),
          ],
          models: {
            usecase: useCaseModel,
            "analysis:uc": analysisModel,
            class: classModel,
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
          },
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
      subscribeToDesignRun: vi.fn(),
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
    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    await user.click(screen.getByRole("button", { name: "选择部署设计" }));

    await user.click(screen.getByRole("button", { name: /生成设计模型/ }));
    const confirmation = await screen.findByRole("dialog", { name: "确认生成设计模型" });
    expect(within(confirmation).getByText("设计依赖补齐")).toBeInTheDocument();
    expect(confirmation).toHaveTextContent("用例实现设计、设计类图、组件（构件）关系");
    await user.click(within(confirmation).getByRole("button", { name: "确认生成" }));

    await waitFor(() => {
      expect(startDesignRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDiagrams: ["sequence", "class", "component", "deployment"],
          requestedDiagrams: ["deployment"],
        }),
      );
    });
  });

  it("allows interface relation design and flags missing prototype source for auto-fill", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
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
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    expect(screen.getByRole("checkbox", { name: /页面导航模型/ })).toBeEnabled();
    expect(screen.getAllByText(/将自动补齐：原型界面关系/).length).toBeGreaterThan(0);
  });

  it("keeps design diagrams selectable when their prerequisite requirement models are missing", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
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
      restoreRunHistory: vi.fn(async () => null),
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
    expect(classDiagramCheckbox).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "选择设计类图" }));
    expect(classDiagramCheckbox).toBeChecked();
    await user.click(screen.getByRole("button", { name: "取消选择设计类图" }));
    expect(classDiagramCheckbox).not.toBeChecked();
    expect(screen.getAllByText(/将自动补齐：领域概念模型/).length).toBeGreaterThan(0);
    expect(screen.getByText("0/7")).toBeInTheDocument();
    expect(screen.queryByText("0/1")).not.toBeInTheDocument();
  });

  it("keeps downstream design diagrams selectable when the use case prerequisite is missing", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
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
      restoreRunHistory: vi.fn(async () => null),
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
    expect(classDiagramCheckbox).toBeChecked();
  });

  it.each(["usecase", "usecase-home-security"])("disables sequence generation for an empty use case model saved as %s", async (modelId) => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
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
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    expect(screen.getByRole("checkbox", { name: /用例实现设计/ })).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getAllByText("需求阶段用例模型没有可生成用例实现设计的用例").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /生成设计模型/ })).toBeDisabled();
  });

  it("blocks design generation when existing requirement model inputs are stale", async () => {
    const startRun = vi.fn();
    const startDesignRun = vi.fn();
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          rules: [createRule()],
          rulesVersion: 2,
          rulesBasedOnTextVersion: 1,
          models: {
            usecase: useCaseModel,
          },
          generatedDiagramTypes: ["usecase"],
          diagramVersions: { usecase: 1 },
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
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    expect(screen.getByRole("checkbox", { name: /用例实现设计/ })).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getAllByText(/已有需求阶段用例模型基于旧规则，请先回到需求页更新/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /生成设计模型/ })).toBeDisabled();
    expect(startRun).not.toHaveBeenCalled();
    expect(startDesignRun).not.toHaveBeenCalled();
  });

  it("shows a top-level blocker when existing use-case realization design no longer covers current use cases", async () => {
    const startDesignRun = vi.fn();
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
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
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByRole("img", { name: /用例实现设计：/, hidden: true });
    expect(screen.getByText("0/7")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "设计模型暂时无法生成" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /有 1 项需要处理/ }));
    const blocker = await screen.findByRole("dialog", {
      name: "设计模型暂时无法生成",
    });
    await waitFor(() => {
      expect(
        within(blocker).getByText("已有用例实现设计覆盖不足，请先手动更新用例实现设计"),
      ).toBeInTheDocument();
    });
    expect(
      within(blocker).getByRole("button", { name: "查看用例实现设计" }),
    ).toBeInTheDocument();
    await userEvent.click(within(blocker).getByRole("button", { name: "我知道了" }));
    expect(screen.getByRole("checkbox", { name: /设计类图/ })).not.toBeChecked();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "有 1 项需要处理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生成设计模型/ })).toBeDisabled();
    expect(screen.getByRole("img", { name: /用例实现设计：/ })).toBeInTheDocument();
    expect(screen.queryByText("已生成设计模型")).not.toBeInTheDocument();
    expect(startDesignRun).not.toHaveBeenCalled();
  });

  it("keeps a view action on generated design diagram cards", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          models: {
            usecase: useCaseModel,
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
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    const user = userEvent.setup();
    render(withWorkspaceProviders(<DesignModelPage />, repository));

    const sequenceCheckbox = await screen.findByRole("checkbox", {
      name: /用例实现设计/,
    });
    const sequenceCard = screen.getByRole("button", { name: "选择用例实现设计" });
    expect(sequenceCard).toHaveClass("h-[212px]", "sm:h-[236px]");
    expect(sequenceCard).toHaveAttribute("data-slot", "spotlight-card");
    expect(sequenceCheckbox).not.toBeChecked();
    expect(within(sequenceCard).getByText("2")).toBeInTheDocument();
    expect(within(sequenceCard).getByRole("img", { name: /用例实现设计：/ })).toBeInTheDocument();
    expect(screen.queryByText("2 个用例实现设计")).not.toBeInTheDocument();

    await user.click(within(sequenceCard).getByRole("button", { name: "查看" }));

    expect(sequenceCheckbox).not.toBeChecked();
  });

  it("does not show confirmed auto-filled design traceability as pending repair records", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
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
              mappingSource: "auto-filled-pending-review",
              reviewStatus: "confirmed",
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
      restoreRunHistory: vi.fn(async () => null),
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

  it("keeps table selection separate and confirms missing sequence and class dependencies", async () => {
    const snapshot: DesignRunSnapshot = createDesignRunSnapshot({
      runId: "design-run-table",
      requirementText: "生成 UML",
      selectedDiagrams: ["sequence", "class", "table"],
      rules: [],
      requirementBaseline: createRequirementBaseline(),
      requirementModels: [useCaseModel, classModel],
      models: [],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {},
      designTrace: [],
      currentStage: "render_svg",
      status: "completed",
      error: null,
    });
    const startDesignRun = vi.fn(async () => ({ runId: "design-run-table" }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "生成 UML",
          requirementBaseline: createRequirementBaseline(),
          rules: [createRule({ relatedDiagrams: ["usecase", "class"] })],
          rulesVersion: 1,
          diagramVersions: { usecase: 1, class: 1, analysis: 1 },
          generatedDiagramTypes: ["usecase", "class", "analysis"],
          models: {
            usecase: useCaseModel,
            class: classModel,
            "analysis:uc": analysisModel,
          },
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
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await userEvent.click(await screen.findByRole("checkbox", { name: /数据库设计/ }));
    expect(screen.getByRole("checkbox", { name: /用例实现设计/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /设计类图/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /数据库设计/ })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: /生成设计模型/ }));
    const confirmation = await screen.findByRole("dialog", { name: "确认生成设计模型" });
    expect(within(confirmation).getByText("设计依赖补齐")).toBeInTheDocument();
    expect(within(confirmation).getByText("用例实现设计、设计类图")).toBeInTheDocument();
    await userEvent.click(within(confirmation).getByRole("button", { name: "确认生成" }));

    await waitFor(() => {
      expect(startDesignRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDiagrams: ["sequence", "class", "table"],
          requestedDiagrams: ["table"],
        }),
      );
    });
    const input = (startDesignRun.mock.calls[0] as unknown as [StartDesignRunInput] | undefined)?.[0];
    expect(input).not.toHaveProperty("requirementText");
    expect(input).not.toHaveProperty("rules");
    expect(input).toHaveProperty("requirementBaseline");
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
        createWorkspaceRecord({
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
      restoreRunHistory: vi.fn(async () => null),
      deleteRunHistory: vi.fn(async () => []),
      clearRunHistory: vi.fn(async () => {}),
    };

    render(withWorkspaceProviders(<DesignModelPage />, repository));

    await screen.findByText("设计模型");
    expect(screen.queryByText("设计类图已存在但基于旧需求，请先手动更新设计类图")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /数据库设计/ })).toBeEnabled();
  });
});
