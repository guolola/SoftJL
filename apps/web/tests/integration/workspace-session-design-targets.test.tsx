// Verifies workspace session design targets across repository and UI boundaries.

import { createDesignRunSnapshot } from "@test/fixtures/contract-fixtures";
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignDiagramModelSpec, DesignRunSnapshot, DiagramModelSpec, UseCaseDiagramSpec } from "@uml-platform/contracts";

import type { StartRunInput, WorkspaceRepository } from "../../src/services/workspace-repository/index";

import { createRunSnapshot, createWorkspaceRecord, withWorkspaceProviders } from "../helpers/workspace-test-utils";
import { designInputFingerprint } from "../../src/shared/lib/fingerprint";
import { snapshotInputFingerprint } from "../../src/features/workspace-session/lib/fingerprint";
import { useWorkspaceSession } from "../../src/features/workspace-session/state";

const { toastMessage } = vi.hoisted(() => ({
  toastMessage: vi.fn(),
}));
vi.mock("../../src/shared/ui/floating-alert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/shared/ui/floating-alert")>();
  return { ...actual, floatingAlert: {
    ...actual.floatingAlert,
    message: toastMessage,
  } };
});

beforeEach(() => {
  storeManagedUserSettings();
  toastMessage.mockClear();
});

afterEach(() => {
  localStorage.clear();
});
import { createRule, storeManagedUserSettings, createBaselineRule, createRequirementBaseline } from "../helpers/workspace-session-fixtures";

describe("WorkspaceSessionProvider", () => {
it("targets missing analysis use cases while preserving existing analysis artifacts", async () => {
    const rule = createRule({
      id: "r1",
      type: "functional" as const,
      text: "读者可以借书和检索图书。",

    });
    const requirementText = "图书馆系统需求";
    const activeFingerprint = snapshotInputFingerprint({
      requirementText,
      rules: [rule],
    });
    const baseline = createRequirementBaseline([
      createBaselineRule({ id: "r1" }),
    ]);
    const usecaseModel: UseCaseDiagramSpec = {
      diagramKind: "usecase",
      title: "用例模型",
      summary: "读者借书与检索图书。",
      notes: [],
      actors: [
        {
          id: "actor_reader",
          name: "读者",
          actorType: "human",
          responsibilities: ["借书", "检索图书"],
        },
      ],
      useCases: [
        { systemBoundaryId: "system",
          id: "uc_borrow",
          name: "借书",
          goal: "登记图书借阅",
          preconditions: [],
          postconditions: [],
          primaryActorId: "actor_reader",
          supportingActorIds: [],
          eventFlows: [
            {
              id: "flow_borrow",
              name: "借书主流程",
              flowType: "main",
              steps: [
                {
                  order: 1,
                  actor: "actor",
                  actorAction: "提交借书信息",
                  systemAction: "创建借阅记录",
                },
              ],
            },
          ],
        },
        { systemBoundaryId: "system",
          id: "uc_search",
          name: "检索图书",
          goal: "查找匹配图书",
          preconditions: [],
          postconditions: [],
          primaryActorId: "actor_reader",
          supportingActorIds: [],
          eventFlows: [
            {
              id: "flow_search",
              name: "检索主流程",
              flowType: "main",
              steps: [
                {
                  order: 1,
                  actor: "actor",
                  actorAction: "提交检索条件",
                  systemAction: "返回匹配图书",
                },
              ],
            },
          ],
        },
      ],
      systemBoundaries: [{ id: "system", name: "图书馆系统" }],
      relationships: [{"id":"participation:uc_borrow","type":"association","sourceId":"actor_reader","targetId":"uc_borrow"},{"id":"participation:uc_search","type":"association","sourceId":"actor_reader","targetId":"uc_search"}],
    };
    const existingAnalysis: DiagramModelSpec = {
      diagramKind: "analysis",
      modelId: "analysis:uc_borrow",
      sourceUseCaseId: "uc_borrow",
      sourceUseCaseName: "借书",
      title: "借书需求分析模型",
      summary: "已有借书分析。",
      notes: [],
      participants: [
        { id: "actor_reader", name: "读者", participantType: "actor" },
        {
          id: "boundary_borrow",
          name: "借书界面",
          participantType: "boundary",
        },
      ],
      messages: [
        {
          id: "msg_borrow",
          sourceId: "actor_reader",
          targetId: "boundary_borrow",
          type: "sync",
          name: "提交借书信息",
          parameters: [],
        },
      ],
      fragments: [],
    };
    const generatedAnalysis: DiagramModelSpec = {
      diagramKind: "analysis",
      modelId: "analysis:uc_search",
      sourceUseCaseId: "uc_search",
      sourceUseCaseName: "检索图书",
      title: "检索图书需求分析模型",
      summary: "补齐检索图书分析。",
      notes: [],
      participants: [
        { id: "actor_reader", name: "读者", participantType: "actor" },
        {
          id: "boundary_search",
          name: "检索界面",
          participantType: "boundary",
        },
      ],
      messages: [
        {
          id: "msg_search",
          sourceId: "actor_reader",
          targetId: "boundary_search",
          type: "sync",
          name: "提交检索条件",
          parameters: [],
        },
      ],
      fragments: [],
    };
    const renderMeta = {
      engine: "plantuml",
      generatedAt: "2026-06-08T00:00:00.000Z",
      sourceLength: 12,
      durationMs: 1,
    };
    const completedSnapshot = createRunSnapshot({
      runId: "run-analysis-supplement",
      requirementText,
      selectedDiagrams: ["analysis"],
      analysisTargetUseCaseIds: ["uc_search"],
      rules: [rule],
      requirementBaseline: baseline,
      models: [usecaseModel, existingAnalysis, generatedAnalysis],
      plantUml: [
        {
          diagramKind: "analysis",
          modelId: "analysis:uc_search",
          source: "@startuml\nsearch\n@enduml",
        },
      ],
      svgArtifacts: [
        {
          diagramKind: "analysis",
          modelId: "analysis:uc_search",
          svg: "<svg><text>search</text></svg>",
          renderMeta,
        },
      ],
    });
    const startRunInputs: StartRunInput[] = [];
    const startRun = vi.fn(async (input: StartRunInput) => {
      startRunInputs.push(input);
      return { runId: "run-analysis-supplement" };
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText,
          requirementBaseline: baseline,
          requirementQualityReport: baseline.qualityReport,
          rules: [rule],
          models: {
            usecase: usecaseModel,
            "analysis:uc_borrow": existingAnalysis,
          },
          requirementModelTraceability: [],
          generatedDiagramTypes: ["usecase", "analysis"],
          selectedDiagramTypes: ["usecase", "analysis"],
          plantUml: {
            "analysis:uc_borrow": "@startuml\nborrow\n@enduml",
          },
          svgArtifacts: {
            "analysis:uc_borrow": {
              diagramKind: "analysis",
              modelId: "analysis:uc_borrow",
              svg: "<svg><text>borrow</text></svg>",
              renderMeta,
            },
          },
          requirementInputFingerprint: activeFingerprint,
          diagramInputFingerprints: {
            usecase: activeFingerprint,
            analysis: activeFingerprint,
          },
          diagramVersions: { usecase: 1, analysis: 1 },
          rulesVersion: 1,
          rulesBasedOnTextVersion: 0,
        }),
      ),

      startRun,
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "completed", snapshot: completedSnapshot });
      }),
      getRunSnapshot: vi.fn(async () => completedSnapshot),

      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
      expect(result.current.workspaceInitialized).toBe(true);
    });

    let generation: Promise<void> | null = null;
    act(() => {
      generation = result.current.generateDiagrams(["analysis"]);
    });
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await act(async () => {
      await generation;
    });

    expect(startRunInputs[0]?.analysisTargetUseCaseIds).toEqual(["uc_search"]);
    expect(startRunInputs[0]?.contextModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diagramKind: "analysis",
          modelId: "analysis:uc_borrow",
        }),
      ]),
    );
    expect(result.current.models["analysis:uc_borrow"]).toEqual(
      existingAnalysis,
    );
    expect(result.current.models["analysis:uc_search"]).toEqual(
      generatedAnalysis,
    );
    expect(result.current.plantUml["analysis:uc_borrow"]).toContain("borrow");
    expect(result.current.plantUml["analysis:uc_search"]).toContain("search");
    expect(result.current.svgArtifacts["analysis:uc_borrow"]?.svg).toContain(
      "borrow",
    );
    expect(result.current.svgArtifacts["analysis:uc_search"]?.svg).toContain(
      "search",
    );
  });

it("summarizes preserved requirement models by model kind before supplement generation", async () => {
    const rule = createRule({
      id: "r1",
      type: "functional" as const,
      text: "用户可以登记、认领和处理失物招领。管理员可以审核状态流转。",

    });
    const requirementText = "校园失物招领需求";
    const activeFingerprint = snapshotInputFingerprint({
      requirementText,
      rules: [rule],
    });
    const existingModels: Record<string, DiagramModelSpec> = {
      usecase: {
        diagramKind: "usecase",
        title: "用例模型",
        summary: "登记和认领失物。",
        notes: [],
        actors: [],
        useCases: [],
        systemBoundaries: [],
        relationships: [],
      } as DiagramModelSpec,
      class: {
        diagramKind: "class",
        title: "领域概念模型",
        summary: "失物招领领域对象。",
        notes: [],
        classes: [],
        interfaces: [],
        enums: [],
        relationships: [],
      },
      deployment: { relationships: [], databases: [], components: [], externalSystems: [],
        diagramKind: "deployment",
        title: "部署需求模型",
        summary: "部署节点。",
        notes: [],
        nodes: [],
        artifacts: [],
      } as DiagramModelSpec,
      "proto-1": {
        diagramKind: "prototype",
        title: "原型界面关系",
        summary: "界面流转。",
        notes: [],
        nodes: [],
        relationships: [],
      } as DiagramModelSpec,
      "analysis:uc_claim": {
        diagramKind: "analysis",
        title: "需求分析模型",
        summary: "认领失物交互。",
        notes: [],
        participants: [],
        messages: [],
        fragments: [],
      } as DiagramModelSpec,
    };
    const activityModel: DiagramModelSpec = {
      diagramKind: "activity",
      title: "总体业务流程",
      summary: "登记到归还的流程。",
      notes: [],
      swimlanes: [],
      nodes: [],
      relationships: [],
    };
    const snapshot = createRunSnapshot({
      runId: "run-activity",
      requirementText,
      selectedDiagrams: ["activity"],
      rules: [rule],
      models: [activityModel],
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText,
          rules: [rule],
          models: existingModels,
          generatedDiagramTypes: [
            "usecase",
            "class",
            "analysis",
            "prototype",
            "deployment",
          ],
          requirementInputFingerprint: activeFingerprint,
          diagramInputFingerprints: {
            usecase: activeFingerprint,
            class: activeFingerprint,
            deployment: activeFingerprint,
            prototype: activeFingerprint,
            analysis: activeFingerprint,
          },
          diagramVersions: {
            usecase: 1,
            class: 1,
            deployment: 1,
            prototype: 1,
            analysis: 1,
          },
          rulesVersion: 1,
          rulesBasedOnTextVersion: 0,
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-activity" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "completed", snapshot });
      }),
      getRunSnapshot: vi.fn(async () => snapshot),

      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
      expect(result.current.workspaceInitialized).toBe(true);
    });

    let generation: Promise<void> | null = null;
    act(() => {
      generation = result.current.generateDiagrams(["activity"]);
    });

    const dialog = await screen.findByRole("dialog", {
      name: "确认生成需求模型",
    });
    expect(within(dialog).getByText("总体业务流程")).toBeInTheDocument();
    expect(within(dialog).getByText("保留不变")).toBeInTheDocument();
    expect(within(dialog).getByText(/用例模型/)).toBeInTheDocument();
    expect(within(dialog).getByText(/领域概念模型/)).toBeInTheDocument();
    expect(within(dialog).getByText(/部署需求模型/)).toBeInTheDocument();
    expect(within(dialog).getByText(/原型界面关系/)).toBeInTheDocument();
    expect(within(dialog).getByText(/需求分析模型/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "确认生成" }));
    expect(
      screen.queryByRole("dialog", { name: "确认生成" }),
    ).not.toBeInTheDocument();
    await act(async () => {
      await generation;
    });
  });

it("passes existing design artifacts when incrementally generating only a table diagram", async () => {
    const usecaseModel: DiagramModelSpec = {
      diagramKind: "usecase",
      title: "图书馆用例模型",
      summary: "管理员与读者的核心用例",
      notes: [],
      actors: [
        {
          id: "actor_librarian",
          name: "图书管理员",
          actorType: "human",
          responsibilities: ["借书"],
        },
      ],
      useCases: [
        {
          eventFlows: [], systemBoundaryId: "boundary_library",
          id: "uc_borrow",
          name: "借书",
          goal: "登记图书借阅",
          preconditions: ["图书未借出"],
          postconditions: ["图书被借出"],
          primaryActorId: "actor_librarian",
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [{ id: "boundary_library", name: "图书馆管理系统" }],
      relationships: [{"id":"participation:uc_borrow","type":"association","sourceId":"actor_librarian","targetId":"uc_borrow"}],
    };
    const classRequirementModel: DiagramModelSpec = {
      diagramKind: "class",
      title: "领域概念模型",
      summary: "图书实体",
      notes: [],
      classes: [
        {
          constraints: [],
          id: "class_book",
          name: "图书",
          classKind: "entity",
          attributes: [{ constraints: [], name: "id", type: "string", visibility: "private" }],
          operations: [],
        },
      ],
      interfaces: [],
      enums: [],
      relationships: [],
    };
    const sequenceModel: DesignDiagramModelSpec = {
      diagramKind: "sequence",
      modelId: "sequence:uc_borrow",
      sourceUseCaseId: "uc_borrow",
      sourceUseCaseName: "借书",
      title: "借书顺序图",
      summary: "借书交互",
      notes: [],
      participants: [],
      messages: [],
      fragments: [],
    };
    const designClassModel: DesignDiagramModelSpec = {
      diagramKind: "class",
      modelId: "class:design-class-diagram",
      title: "设计类图",
      summary: "图书设计类",
      notes: [],
      classes: [
        {
          constraints: [],
          id: "class_book",
          name: "图书",
          classKind: "entity",
          attributes: [{ constraints: [], name: "id", type: "string", visibility: "private" }],
          operations: [],
        },
      ],
      interfaces: [],
      enums: [],
      relationships: [],
    };
    const tableModel: DesignDiagramModelSpec = {
      diagramKind: "table",
      title: "表关系图",
      summary: "图书表",
      notes: [],
      tables: [
        {
          constraints: [],
          relationalConstraints: [{"id":"pk_test","type":"primary-key","columnIds":["id"]}],
          id: "book",
          name: "book",
          columns: [
            {
              constraints: [],
              id: "id",
              name: "id",
              dataType: "VARCHAR",
              isPrimaryKey: true,
              isForeignKey: false,
              nullable: false,
            },
          ],
        },
      ],
      relationships: [],
    };
    const snapshot: DesignRunSnapshot = createDesignRunSnapshot({
      runId: "design-table-run",
      requirementText: "图书馆管理系统",
      selectedDiagrams: ["table"],
      rules: [
        createRule({
          id: "r1",
          text: "图书管理员可以借书。",

        }),
        createRule({
          id: "r2",
          text: "系统需要记录图书。",

        }),
      ],
      requirementModels: [usecaseModel, classRequirementModel],
      requirementModelTraceability: [
        {
          ruleId: "r1",
          target: {
            diagramKind: "usecase",
            elementId: "actor_librarian",
            elementKind: "actor",
            label: "图书管理员",
          },
        },
        {
          ruleId: "r1",
          target: {
            diagramKind: "usecase",
            elementId: "uc_borrow",
            elementKind: "usecase",
            label: "借书",
          },
        },
        {
          ruleId: "r2",
          target: {
            diagramKind: "class",
            elementId: "class_book",
            elementKind: "class",
            label: "图书",
          },
        },
      ],
      models: [tableModel],
      designModelTraceability: [
        {
          source: {
            diagramKind: "table",
            elementId: "book",
            elementKind: "table",
            label: "book",
          },
          targets: [
            {
              diagramKind: "class",
              elementId: "class_book",
              elementKind: "class",
              label: "图书",
            },
          ],
        },
      ],
      plantUml: [{ diagramKind: "table", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "table",
          svg: "<svg></svg>",
          renderMeta: {
            engine: "test",
            generatedAt: new Date().toISOString(),
            sourceLength: 18,
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
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "图书馆管理系统",
          rules: snapshot.rules,
          requirementBaseline: createRequirementBaseline([
            createBaselineRule(),
          ]),
          rulesVersion: 1,
          rulesBasedOnTextVersion: 0,
          diagramVersions: { usecase: 1, class: 1 },
          generatedDiagramTypes: ["usecase", "class"],
          models: { usecase: usecaseModel, class: classRequirementModel },
          requirementModelTraceability: [
            ...snapshot.requirementModelTraceability,
          ],
          selectedDesignDiagramTypes: ["table"],
          generatedDesignDiagramTypes: ["sequence", "class"],
          designModels: {
            "sequence:uc_borrow": sequenceModel,
            "class:design-class-diagram": designClassModel,
          },
          designModelTraceability: [],
          designPlantUml: {
            "sequence:uc_borrow": "@startuml\n@enduml",
            "class:design-class-diagram": "@startuml\n@enduml",
          },
          designSvgArtifacts: {
            "sequence:uc_borrow": {
              diagramKind: "sequence",
              modelId: "sequence:uc_borrow",
              svg: "<svg></svg>",
              renderMeta: {
                engine: "test",
                generatedAt: new Date().toISOString(),
                sourceLength: 18,
                durationMs: 1,
              },
            },
            "class:design-class-diagram": {
              diagramKind: "class",
              modelId: "class:design-class-diagram",
              svg: "<svg></svg>",
              renderMeta: {
                engine: "test",
                generatedAt: new Date().toISOString(),
                sourceLength: 18,
                durationMs: 1,
              },
            },
          },
          designInputFingerprints: {
            "class:design-class-diagram": designInputFingerprint(
              [usecaseModel, classRequirementModel],
              snapshot.requirementModelTraceability,
            ),
          },
        }),
      ),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun: vi.fn(async () => ({ runId: "design-table-run" })),
      subscribeToDesignRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({ type: "completed", snapshot });
      }),
      getDesignRunSnapshot: vi.fn(async () => snapshot),

      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };

    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
      expect(result.current.workspaceInitialized).toBe(true);
    });

    const user = userEvent.setup();
    let designGeneration: Promise<void> | null = null;
    act(() => {
      designGeneration = result.current.generateDesignDiagrams(["table"]);
    });
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await act(async () => {
      await designGeneration;
    });

    expect(repository.startDesignRun).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedDiagrams: ["table"],
        existingDesignModels: expect.arrayContaining([
          expect.objectContaining({ diagramKind: "sequence" }),
          expect.objectContaining({ diagramKind: "class" }),
        ]),
        existingDesignPlantUml: expect.arrayContaining([
          expect.objectContaining({ diagramKind: "sequence" }),
          expect.objectContaining({ diagramKind: "class" }),
        ]),
      }),
    );
    const input = vi.mocked(repository.startDesignRun).mock.calls[0]?.[0];
    expect(input).not.toHaveProperty("requirementText");
    expect(input).not.toHaveProperty("rules");
    expect(input).toHaveProperty("requirementBaseline");
    expect(Object.keys(result.current.designModels).sort()).toEqual([
      "class:design-class-diagram",
      "sequence:uc_borrow",
      "table",
    ]);
    expect(result.current.generatedDesignDiagrams.sort()).toEqual([
      "class",
      "sequence",
      "table",
    ]);
  });
});
