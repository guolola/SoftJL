// Verifies workspace session freshness across repository and UI boundaries.

import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseCaseDiagramSpec } from "@uml-platform/contracts";

import type { WorkspaceRepository } from "../../src/services/workspace-repository/index";

import { createRunSnapshot, createWorkspaceRecord, createUseCaseRelationshipTrace, withWorkspaceProviders } from "../helpers/workspace-test-utils";

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
import { createRule, storeManagedUserSettings, deferred } from "../helpers/workspace-session-fixtures";

describe("WorkspaceSessionProvider", () => {
it("drives runs through the repository and tracks stale diagrams after rules refresh", async () => {
    const snapshots = new Map([
      [
        "run-rules-1",
        createRunSnapshot({
          runId: "run-rules-1",
          requirementText: "订单系统需求",
          rules: [createRule({  })],
        }),
      ],
      [
        "run-diagrams",
        createRunSnapshot({
          runId: "run-diagrams",
          requirementText: "订单系统需求",
          selectedDiagrams: ["usecase", "activity"],
          rules: [createRule({  })],
          models: [
            {
              diagramKind: "usecase",
              title: "订单系统用例",
              summary: "核心参与者和用例",
              notes: [],
              actors: [
                {
                  id: "actor_user",
                  name: "用户",
                  actorType: "human",
                  responsibilities: ["提交订单"],
                },
              ],
              useCases: [
                {
                  eventFlows: [],
                  id: "usecase_submit_order",
                  name: "提交订单",
                  goal: "完成订单创建",
                  preconditions: ["已登录"],
                  postconditions: ["订单已生成"],
                  primaryActorId: "actor_user",
                  supportingActorIds: [],
                },
              ],
              systemBoundaries: [{ id: "boundary_order", name: "订单系统" }],
              relationships: [
                {
                  id: "rel_order_1",
                  sourceId: "actor_user",
                  targetId: "usecase_submit_order",
                  type: "association",
                  label: "发起",
                },
              ],
            },
            {
              diagramKind: "activity",
              title: "订单系统流程",
              summary: "订单主流程",
              notes: [],
              swimlanes: [{ id: "lane_user", name: "用户" }],
              nodes: [
                { id: "start", type: "start", name: "开始" },
                {
                  id: "activity_submit",
                  type: "activity",
                  name: "提交订单",
                  actorOrLane: "lane_user",
                  input: ["订单信息"],
                  output: ["订单记录"],
                },
                { id: "end", type: "end", name: "结束" },
              ],
              relationships: [
                {
                  id: "flow_1",
                  type: "control_flow",
                  sourceId: "start",
                  targetId: "activity_submit",
                },
                {
                  id: "flow_2",
                  type: "control_flow",
                  sourceId: "activity_submit",
                  targetId: "end",
                },
              ],
            },
          ],
          plantUml: [
            {
              diagramKind: "usecase",
              source: "@startuml\nactor 用户\n@enduml",
            },
            {
              diagramKind: "activity",
              source: "@startuml\nstart\nstop\n@enduml",
            },
          ],
          svgArtifacts: [
            {
              diagramKind: "usecase",
              svg: "<svg><text>usecase</text></svg>",
              renderMeta: {
                engine: "plantuml",
                generatedAt: new Date().toISOString(),
                sourceLength: 10,
                durationMs: 5,
              },
            },
            {
              diagramKind: "activity",
              svg: "<svg><text>activity</text></svg>",
              renderMeta: {
                engine: "plantuml",
                generatedAt: new Date().toISOString(),
                sourceLength: 10,
                durationMs: 5,
              },
            },
          ],
        }),
      ],
      [
        "run-rules-2",
        createRunSnapshot({
          runId: "run-rules-2",
          requirementText: "订单系统需求 v2",
          rules: [createRule({ id: "r2", text: "库存必须先校验。" })],
        }),
      ],
    ]);

    let startRunCount = 0;
    const startRun = vi.fn(async () => {
      startRunCount += 1;
      if (startRunCount === 1) return { runId: "run-rules-1" };
      if (startRunCount === 2) return { runId: "run-diagrams" };
      return { runId: "run-rules-2" };
    });

    const subscribeToRun = vi.fn(
      async (
        runId: string,
        onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1],
      ) => {
        const snapshot = snapshots.get(runId);
        if (!snapshot) {
          throw new Error(`Missing snapshot for ${runId}`);
        }
        onEvent({ type: "queued" });
        onEvent({
          type: "stage_progress",
          stage:
            snapshot.selectedDiagrams.length > 0
              ? "render_svg"
              : "extract_rules",
          progress: snapshot.selectedDiagrams.length > 0 ? 95 : 20,
          message:
            snapshot.selectedDiagrams.length > 0
              ? "正在渲染 SVG"
              : "正在抽取需求规则",
        });
        onEvent({ type: "completed", snapshot });
      },
    );

    const getRunSnapshot = vi.fn(async (runId: string) => {
      const snapshot = snapshots.get(runId);
      if (!snapshot) {
        throw new Error(`Missing snapshot for ${runId}`);
      }
      return snapshot;
    });

    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord()),

      startRun,
      subscribeToRun,
      getRunSnapshot,

      saveRunHistory: vi.fn(async (snapshot) => ({
        id: snapshot.runId,
        createdAt: new Date().toISOString(),
        title: "test",
        snapshot,
        providerModel: "gpt-5.5",
      })),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:document-run"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
      expect(result.current.workspaceInitialized).toBe(true);
    });

    act(() => {
      result.current.setRequirementText("订单系统需求");
    });

    expect(result.current.textVersion).toBe(1);

    await act(async () => {
      await result.current.generateRules();
    });

    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementText: "订单系统需求",
        selectedDiagrams: [],
      }),
    );
    expect(result.current.rules).toHaveLength(1);
    expect(result.current.rulesVersion).toBe(1);
    expect(result.current.isRulesStale).toBe(false);

    act(() => {
      result.current.setSelectedDiagrams(["usecase", "activity"]);
    });

    let diagramGeneration: Promise<void> | null = null;
    act(() => {
      diagramGeneration = result.current.generateDiagrams();
    });
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await act(async () => {
      await diagramGeneration;
    });

    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementText: "订单系统需求",
        selectedDiagrams: ["activity", "usecase"],
      }),
    );
    expect(result.current.generatedDiagrams).toEqual(["activity", "usecase"]);
    expect(result.current.svgArtifacts.usecase?.svg).toContain("<svg>");
    expect(result.current.staleDiagrams).toEqual([]);

    act(() => {
      result.current.setRequirementText("订单系统需求 v2");
    });
    expect(result.current.hasUncommittedRequirementDraft).toBe(true);
    expect(result.current.isRulesStale).toBe(false);
    expect(result.current.staleDiagrams).toEqual([]);

    await act(async () => {
      await result.current.generateRules();
    });

    expect(result.current.rulesVersion).toBe(2);
    expect(result.current.rules[0]?.id).toBe("r2");
    expect(result.current.staleDiagrams).toEqual(["activity", "usecase"]);
  });

it("keeps completed requirement models current when only a text draft changes in flight", async () => {
    const rule = createRule({
      id: "r1",
      text: "用户可以查看座位。",

    });
    const startFingerprint = snapshotInputFingerprint({
      requirementText: "座位预约系统 v1",
      rules: [rule],
    });
    const completedSnapshot = createRunSnapshot({
      runId: "run-inflight-usecase",
      requirementText: "座位预约系统 v1",
      selectedDiagrams: ["usecase"],
      rules: [rule],
      models: [
        {
          diagramKind: "usecase",
          title: "座位预约用例",
          summary: "基于 v1 需求生成。",
          notes: [],
          actors: [],
          useCases: [],
          systemBoundaries: [],
          relationships: [],
        },
      ],
      plantUml: [{ diagramKind: "usecase", source: "@startuml\n@enduml" }],
      svgArtifacts: [
        {
          diagramKind: "usecase",
          svg: "<svg><text>v1</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: "2026-06-21T00:00:00.000Z",
            sourceLength: 18,
            durationMs: 1,
          },
        },
      ],
    });
    const subscription = deferred<void>();
    let emitRunEvent:
      | Parameters<WorkspaceRepository["subscribeToRun"]>[1]
      | null = null;
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "座位预约系统 v1",
          rules: [rule],
          requirementInputFingerprint: startFingerprint,
          rulesVersion: 1,
          rulesBasedOnTextVersion: 0,
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-inflight-usecase" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        emitRunEvent = onEvent;
        await subscription.promise;
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

    let generation: Promise<unknown> | null = null;
    act(() => {
      generation = result.current.generateDiagrams(["usecase"]);
    });
    await user.click(await screen.findByRole("button", { name: "确认生成" }));
    await waitFor(() => {
      expect(repository.startRun).toHaveBeenCalledTimes(1);
      expect(emitRunEvent).toBeTruthy();
    });

    act(() => {
      result.current.setRequirementText("座位预约系统 v2");
    });

    act(() => {
      emitRunEvent?.({ type: "completed", snapshot: completedSnapshot });
      subscription.resolve();
    });
    await act(async () => {
      await generation;
    });

    expect(result.current.staleDiagrams).toEqual([]);
    expect(result.current.hasUncommittedRequirementDraft).toBe(true);
    expect(result.current.svgArtifacts.usecase?.svg).toContain("v1");
  });

it("marks legacy fingerprints stale without upgrading saved models", async () => {
    const rule = createRule({
      id: "r1",
      type: "functional" as const,
      text: "用户提交订单。",

    });
    const requirementText = "订单系统需求";
    const legacyFingerprint = JSON.stringify({
      rules: [
        {
          text: rule.text,

          type: rule.type,
          id: rule.id,
        },
      ],
      requirementText,
    });
    const usecaseModel: UseCaseDiagramSpec = {
      diagramKind: "usecase",
      title: "用例模型",
      summary: "用户提交订单。",
      notes: [],
      actors: [
        {
          id: "actor_user",
          name: "用户",
          actorType: "human",
          responsibilities: ["提交订单"],
        },
      ],
      useCases: [
        {
          eventFlows: [], systemBoundaryId: "system",
          id: "uc_submit",
          name: "提交订单",
          goal: "创建订单",
          preconditions: ["用户已登录"],
          postconditions: ["订单已创建"],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [{ id: "system", name: "订单系统" }],
      relationships: [{"id":"participation:uc_submit","type":"association","sourceId":"actor_user","targetId":"uc_submit"}],
    };
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText,
          rules: [rule],
          models: { usecase: usecaseModel },
          requirementModelTraceability: [
            ...createUseCaseRelationshipTrace(usecaseModel, "r1"),
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "actor_user",
                elementKind: "actor",
                label: "用户",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "uc_submit",
                elementKind: "usecase",
                label: "提交订单",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "system",
                elementKind: "system-boundary",
                label: "订单系统",
              },
            },
          ],
          generatedDiagramTypes: ["usecase"],
          selectedDiagramTypes: ["usecase"],
          requirementInputFingerprint: legacyFingerprint,
          diagramInputFingerprints: { usecase: legacyFingerprint },
          rulesVersion: 1,
          rulesBasedOnTextVersion: 0,
          diagramVersions: { usecase: 1 },
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

    expect(result.current.isRulesStale).toBe(true);
    expect(result.current.staleDiagrams).toContain("usecase");
    expect(result.current.designGenerationBlockedReason).toBeNull();
  });

it("marks restored requirement models stale when current per-diagram receipts are missing", async () => {
    const rule = createRule({
      id: "r1",
      type: "functional" as const,
      text: "用户提交订单。",

    });
    const requirementText = "订单系统需求";
    const activeFingerprint = snapshotInputFingerprint({
      requirementText,
      rules: [rule],
    });
    const usecaseModel: UseCaseDiagramSpec = {
      diagramKind: "usecase",
      title: "用例模型",
      summary: "用户提交订单。",
      notes: [],
      actors: [
        {
          id: "actor_user",
          name: "用户",
          actorType: "human",
          responsibilities: ["提交订单"],
        },
      ],
      useCases: [
        {
          eventFlows: [], systemBoundaryId: "system",
          id: "uc_submit",
          name: "提交订单",
          goal: "创建订单",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [{ id: "system", name: "订单系统" }],
      relationships: [{"id":"participation:uc_submit","type":"association","sourceId":"actor_user","targetId":"uc_submit"}],
    };
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText,
          rules: [rule],
          models: { usecase: usecaseModel },
          requirementModelTraceability: [
            ...createUseCaseRelationshipTrace(usecaseModel, "r1"),
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "actor_user",
                elementKind: "actor",
                label: "用户",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "uc_submit",
                elementKind: "usecase",
                label: "提交订单",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "system",
                elementKind: "system-boundary",
                label: "订单系统",
              },
            },
          ],
          generatedDiagramTypes: ["usecase"],
          selectedDiagramTypes: ["usecase"],
          requirementInputFingerprint: activeFingerprint,
          diagramInputFingerprints: {},
          diagramVersions: {},
          rulesVersion: 3,
          rulesBasedOnTextVersion: 0,
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

    expect(result.current.staleDiagrams).toEqual(["usecase"]);
    expect(result.current.designGenerationBlockedReason).toBeNull();
  });
});
