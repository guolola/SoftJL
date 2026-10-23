// Verifies workspace session recovery across repository and UI boundaries.

import { createRenderMeta } from "@test/fixtures/contract-fixtures";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignRunSnapshot, DiagramModelSpec } from "@uml-platform/contracts";
import { designRunSnapshotSchema, captureWorkspaceGuard, feasibilityRunSnapshotSchema } from "@uml-platform/contracts";
import { deriveSidebarDiagramState } from "../../src/features/workspace-shell/lib/sidebar-menu-model";
import type { WorkspaceRepository } from "../../src/services/workspace-repository/index";

import { createRunSnapshot, createWorkspaceRecord, withWorkspaceProviders } from "../helpers/workspace-test-utils";

import { useWorkspaceSession } from "../../src/features/workspace-session/state";
import { createMockWorkspaceRepository } from "../../src/services/workspace-repository/mock-repository";

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
import { createRule, storeManagedUserSettings, deferred } from "../helpers/workspace-session-fixtures";

describe("WorkspaceSessionProvider", () => {
it.each(["requirements", "design"] as const)("restores completed %s models immediately when reopening a running batch", async (kind) => {
    const runId = `reopened-${kind}`;
    const modelId = "class:restored";
    const base = createRunSnapshot({ runId, requirementText: "订单需求", selectedDiagrams: ["class", "deployment"],
      status: "running", currentStage: "generate_models", models: [{
        diagramKind: "class", modelId, title: "已完成的类图", summary: "类图", notes: [],
        classes: [], interfaces: [], enums: [], relationships: [],
      }], plantUml: [{ diagramKind: "class", modelId, source: "@startuml\n@enduml" }],
      svgArtifacts: [{ diagramKind: "class", modelId, svg: "<svg>已完成</svg>", renderMeta: {
        engine: "plantuml", generatedAt: "2026-10-10T00:00:00.000Z", sourceLength: 18, durationMs: 1,
      } }],
    });
    const snapshot = kind === "design" ? designRunSnapshotSchema.parse({ ...base,
      currentStage: "generate_design_models", requirementModels: [], designModelTraceability: [], designTrace: [],
    }) : base;
    let signal: AbortSignal | undefined;
    const subscribe = vi.fn(async (_runId, _onEvent, options) => {
      signal = options.signal;
      await new Promise<void>((resolve) => options.signal.addEventListener("abort", () => resolve(), { once: true }));
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord({ requirementText: "订单需求" })),
       startRun: vi.fn(),
      subscribeToRun: subscribe, subscribeToDesignRun: subscribe,
      getRunSnapshot: vi.fn(async () => base), getDesignRunSnapshot: vi.fn(async () => snapshot as DesignRunSnapshot),
        saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),
    };
    const { result, unmount } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    const projectRun = { operationType: (kind === "design" ? "design_modeling" as const : "requirement_modeling" as const), runId, status: "running", runKind: kind, selectedDiagrams: ["class", "deployment"] as const };
    act(() => result.current.reconcileGenerationTasksWithProjectRuns([{ ...projectRun, selectedDiagrams: [...projectRun.selectedDiagrams] }]));
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    expect(repository.startRun).not.toHaveBeenCalled();
    expect(result.current.generationTasks[0]).toMatchObject({ runId, status: "running" });
    const sidebar = deriveSidebarDiagramState({
      models: result.current.models, svgArtifacts: result.current.svgArtifacts, diagramErrors: result.current.diagramErrors,
      designModels: result.current.designModels, designSvgArtifacts: result.current.designSvgArtifacts, designDiagramErrors: result.current.designDiagramErrors,
      generatedDiagrams: result.current.generatedDiagrams, generatedDesignDiagrams: result.current.generatedDesignDiagrams,
      staleDiagrams: [], staleDesignDiagrams: [], staleDesignModelIds: [], generationTasks: result.current.generationTasks,
      projectRuns: [{ ...projectRun, selectedDiagrams: [...projectRun.selectedDiagrams] }],
    });
    expect(kind === "design" ? sidebar.designStatusFor("class", modelId) : sidebar.requirementStatusFor("class", modelId)).toBe("completed");
    expect(kind === "design" ? sidebar.designModelViewable("class", modelId) : sidebar.requirementModelViewable("class", modelId)).toBe(true);
    expect(kind === "design" ? sidebar.designStatusFor("deployment") : sidebar.requirementStatusFor("deployment")).toBe("running");
    act(() => result.current.reconcileGenerationTasksWithProjectRuns([{ ...projectRun, selectedDiagrams: [...projectRun.selectedDiagrams] }]));
    expect(subscribe).toHaveBeenCalledTimes(1);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

it("refreshes workspace and history after the browser comes back online without an active generation task", async () => {
    let loadCount = 0;
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => {
        loadCount += 1;
        return createWorkspaceRecord({
          requirementText:
            loadCount === 1 ? "初始出版系统需求" : "恢复后的出版系统需求",
        });
      }),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),

      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () =>
        loadCount > 1
          ? [
              {
                id: "run-restored",
                createdAt: "2026-06-20T00:00:00.000Z",
                title: "恢复后的运行",
                snapshot: null,
                providerModel: "gpt-5.5",
                status: "completed",
              },
            ]
          : [],
      ),
      deleteRunHistory: vi.fn(async () => []),

    };

    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });

    await waitFor(() => {
      expect(result.current.requirementText).toBe("初始出版系统需求");
    });

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(2);
      expect(result.current.requirementText).toBe("恢复后的出版系统需求");
    });
    expect(result.current.historyItems.map((item) => item.id)).toEqual([
      "run-restored",
    ]);
  });

it("treats persisted selected diagram fields as stale draft state on workspace load", async () => {
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单系统需求",
          rules: [createRule({  })],
          generatedDiagramTypes: ["usecase"],
          selectedDiagramTypes: ["class"],
          generatedDesignDiagramTypes: ["sequence"],
          selectedDesignDiagramTypes: ["table"],
        }),
      ),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),

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

    expect(result.current.generatedDiagrams).toEqual(["usecase"]);
    expect(result.current.selectedDiagrams).toEqual([]);
    expect(result.current.generatedDesignDiagrams).toEqual(["sequence"]);
    expect(result.current.selectedDesignDiagrams).toEqual([]);
  });
});
it("background feasibility callbacks check live unsaved session facts", async () => {
  const repository = createMockWorkspaceRepository({ requirementText: "旧需求" });
  const workspace = await repository.loadWorkspace();
  const { result } = renderHook(() => useWorkspaceSession(), {
    wrapper: ({ children }) => withWorkspaceProviders(children, repository),
  });
  await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
  act(() => result.current.syncFeasibilityArtifacts(workspace));
  const backgroundCallback = result.current.syncFeasibilityArtifacts;
  const snapshot = feasibilityRunSnapshotSchema.parse({
    operationType: "feasibility_analysis", outputManifest: [],
    runId: "old-run", projectId: "p", selectedArtifacts: ["context"],
    providerSettings: { providerConfigId: "p", model: "m" }, rules: [], requirementBaseline: null,
    inputs: {}, status: "completed", currentStage: null, error: null,
    contextModel: { diagramKind: "context", title: "旧任务结果", summary: "系统边界", notes: [], system: { id: "system", name: "系统" }, people: [], externalSystems: [], relationships: [] },
    contextPlantUml: null, contextSvg: null, contextFingerprint: null, implementationPlan: null, implementationFingerprint: null,
  });
  snapshot.workspaceGuard = captureWorkspaceGuard({ snapshot }, { ...workspace });
  act(() => result.current.setRequirementText("尚未保存的新需求"));
  act(() => backgroundCallback({ ...workspace, feasibilityContextModel: snapshot.contextModel, feasibilityContextPlantUml: "source", feasibilityContextSvg: "<svg/>" }, snapshot));
  expect(result.current.requirementText).toBe("尚未保存的新需求");
  expect(result.current.hasFeasibilityContextArtifact).toBe(false);
  expect(result.current.feasibilityGeneration.workspace?.feasibilityContextModel).toBeNull();
  expect(result.current.feasibilityGeneration.workspace?.requirementText).toBe("尚未保存的新需求");
});

it.each(["ordered", "overlap"] as const)("updates requirement menus and contents during a %s batch without waiting for completion", async (timing) => {
  const rules = [createRule({  })];
  const repository = createMockWorkspaceRepository({ requirementText: "订单需求", rules, rulesVersion: 1 });
  const models: DiagramModelSpec[] = [
    { diagramKind: "usecase", title: "新用例模型", summary: "", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] },
    { diagramKind: "class", title: "新领域模型", summary: "", notes: [], classes: [], interfaces: [], enums: [], relationships: [] },
  ];
  const snapshot = createRunSnapshot({ runId: "parallel-requirements", requirementText: "订单需求", rules,
    selectedDiagrams: ["usecase", "class"], status: "running", models,
    plantUml: models.map((model) => ({ diagramKind: model.diagramKind, source: "@startuml\n@enduml" })),
    svgArtifacts: models.map((model) => ({ diagramKind: model.diagramKind, svg: '<svg><text>' + model.title + '</text></svg>', renderMeta: createRenderMeta() })),
  });
  const first = { ...snapshot, models: models.slice(0, 1), plantUml: snapshot.plantUml.slice(0, 1), svgArtifacts: snapshot.svgArtifacts.slice(0, 1) };
  const pending = deferred<void>();
  const firstRead = deferred<typeof snapshot>();
  const secondRead = deferred<typeof snapshot>();
  let emit!: Parameters<WorkspaceRepository["subscribeToRun"]>[1];
  repository.startRun = vi.fn(async () => ({ runId: snapshot.runId }));
  repository.subscribeToRun = vi.fn(async (_id, onEvent) => { emit = onEvent; await pending.promise; });
  repository.getRunSnapshot = vi.fn().mockImplementationOnce(() => firstRead.promise).mockImplementationOnce(() => secondRead.promise)
    .mockResolvedValue({ ...snapshot, status: "completed" });
  const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
  await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
  let generation!: Promise<void>;
  act(() => { generation = result.current.generateDiagrams(["usecase", "class"]); });
  await userEvent.click(await screen.findByRole("button", { name: "确认生成" }));
  await waitFor(() => expect(emit).toBeTypeOf("function"));
  const ready = (diagramKind: "usecase" | "class") => emit({ type: "artifact_ready", stage: "render_svg", artifactKind: "svg", diagramKind, subtaskId: diagramKind, subtaskStatus: "completed" });
  await act(async () => {
    ready("usecase");
    if (timing === "ordered") firstRead.resolve(first);
  });
  if (timing === "ordered") {
    expect(result.current.models.usecase?.title).toBe("新用例模型");
    expect(deriveSidebarDiagramState(result.current).requirementStatusFor("usecase")).toBe("completed");
    expect(result.current.models.class).toBeUndefined();
    expect(result.current.generationTasks[0]?.status).toBe("running");
  }
  await act(async () => { ready("class"); secondRead.resolve(snapshot); });
  expect(result.current.models.usecase?.title).toBe("新用例模型");
  expect(result.current.models.class?.title).toBe("新领域模型");
  expect(result.current.svgArtifacts.usecase?.svg).toContain("新用例模型");
  expect(result.current.svgArtifacts.class?.svg).toContain("新领域模型");
  expect(deriveSidebarDiagramState(result.current).requirementStatusFor("class")).toBe("completed");
  expect(result.current.generationTasks[0]?.status).toBe("running");
  if (timing === "overlap") await act(async () => { firstRead.resolve(first); });
  expect(result.current.models.class?.title).toBe("新领域模型");
  await act(async () => { emit({ type: "completed", snapshot: { ...snapshot, status: "completed" } }); pending.resolve(); await generation; });
});
