// Verifies workspace session design prerequisites across repository and UI boundaries.

import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignDiagramModelSpec, DiagramModelSpec, UseCaseDiagramSpec } from "@uml-platform/contracts";

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
import { createRule, storeManagedUserSettings, createBaselineRule, createRequirementBaseline } from "../helpers/workspace-session-fixtures";

describe("WorkspaceSessionProvider", () => {
it("does not require rule traceability for use-case driven analysis models before design generation", async () => {
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
        { systemBoundaryId: "system",
          id: "uc_submit",
          name: "提交订单",
          goal: "创建订单",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
          eventFlows: [
            {
              id: "flow-main",
              name: "主事件流",
              flowType: "main",
              steps: [
                {
                  order: 1,
                  actor: "actor",
                  actorAction: "填写订单",
                  systemAction: "保存订单",
                },
              ],
            },
          ],
        },
      ],
      systemBoundaries: [{ id: "system", name: "订单系统" }],
      relationships: [{"id":"participation:uc_submit","type":"association","sourceId":"actor_user","targetId":"uc_submit"}],
    };
    const analysisModel: DiagramModelSpec = {
      diagramKind: "analysis",
      modelId: "analysis:uc_submit",
      sourceUseCaseId: "uc_submit",
      sourceUseCaseName: "提交订单",
      title: "提交订单需求分析模型",
      summary: "基于用例事件流生成。",
      notes: [],
      participants: [
        { id: "actor_user", name: "用户", participantType: "actor" },
        { id: "system", name: "订单系统", participantType: "control" },
      ],
      messages: [
        {
          id: "msg_submit",
          sourceId: "actor_user",
          targetId: "system",
          type: "sync",
          name: "提交订单",
          parameters: [],
        },
      ],
      fragments: [],
    };
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText,
          requirementBaseline: createRequirementBaseline([
            createBaselineRule({ id: "r1" }),
          ]),
          rules: [rule],
          models: {
            usecase: usecaseModel,
            "analysis:uc_submit": analysisModel,
          },
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
          generatedDiagramTypes: ["usecase", "analysis"],
          selectedDiagramTypes: ["usecase", "analysis"],
          requirementInputFingerprint: activeFingerprint,
          diagramInputFingerprints: {
            usecase: activeFingerprint,
            "analysis:uc_submit": activeFingerprint,
          },
          diagramVersions: { usecase: 1, analysis: 1 },
          rulesVersion: 1,
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

    expect(result.current.staleDiagrams).toEqual([]);
    expect(result.current.designGenerationBlockedReason).toBeNull();
  });

it("keeps separately generated requirement diagrams fresh for design generation", async () => {
    const rule = createRule({

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
          responsibilities: [],
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
    const classModel: DiagramModelSpec = {
      diagramKind: "class",
      title: "领域概念模型",
      summary: "订单实体。",
      notes: [],
      classes: [
        {
          constraints: [],
          id: "order",
          name: "Order",
          stereotype: "entity",
          attributes: [],
          operations: [],
        },
      ],
      interfaces: [],
      enums: [],
      relationships: [],
    };
    const activityModel: DiagramModelSpec = {
      diagramKind: "activity",
      title: "界面关系图",
      summary: "订单界面流转。",
      notes: [],
      swimlanes: [],
      nodes: [{ name: "开始", id: "start", type: "start" }, { input: [], output: [],  id: "submit", type: "activity", name: "提交订单" }, { name: "结束", id: "end", type: "end" }],
      relationships: [{ id: "begin", type: "control_flow", sourceId: "start", targetId: "submit" }, { id: "done", type: "control_flow", sourceId: "submit", targetId: "end" }],
    };
    const snapshots = new Map([
      [
        "run-usecase",
        createRunSnapshot({
          runId: "run-usecase",
          requirementText: "订单需求",
          selectedDiagrams: ["usecase"],
          rules: [rule],
          models: [usecaseModel],
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
        }),
      ],
      [
        "run-class",
        createRunSnapshot({
          runId: "run-class",
          requirementText: "订单需求",
          selectedDiagrams: ["class"],
          rules: [rule],
          models: [classModel],
          requirementModelTraceability: [
            {
              ruleId: "r1",
              target: {
                diagramKind: "class",
                elementId: "order",
                elementKind: "class",
                label: "Order",
              },
            },
          ],
        }),
      ],
      [
        "run-activity",
        createRunSnapshot({
          runId: "run-activity",
          requirementText: "订单需求",
          selectedDiagrams: ["activity"],
          rules: [rule],
          models: [activityModel],
          requirementModelTraceability: [
            {
              ruleId: "r1",
              target: {
                diagramKind: "activity",
                elementId: "submit",
                elementKind: "activity",
                label: "提交订单",
              },
            },
          ],
        }),
      ],
    ]);
    const startRun = vi.fn(async (input) => ({
      runId: `run-${input.selectedDiagrams[0]}`,
    }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单需求",
          rules: [rule],
          rulesVersion: 1,
        }),
      ),

      startRun,
      subscribeToRun: vi.fn(async (runId, onEvent) => {
        const snapshot = snapshots.get(runId);
        if (!snapshot) throw new Error(`Missing ${runId}`);
        onEvent({ type: "completed", snapshot });
      }),
      getRunSnapshot: vi.fn(async (runId) => {
        const snapshot = snapshots.get(runId);
        if (!snapshot) throw new Error(`Missing ${runId}`);
        return snapshot;
      }),

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
    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
      expect(result.current.workspaceInitialized).toBe(true);
    });

    for (const diagram of ["usecase", "class", "activity"] as const) {
      let generation: Promise<void> | null = null;
      act(() => {
        generation = result.current.generateDiagrams([diagram]);
      });
      await user.click(await screen.findByRole("button", { name: "确认生成" }));
      await act(async () => {
        await generation;
      });
    }

    expect(result.current.generatedDiagrams.sort()).toEqual([
      "activity",
      "class",
      "usecase",
    ]);
    expect(result.current.staleDiagrams).toEqual([]);
    expect(result.current.designGenerationBlockedReason).toBeNull();
  });

it("generates classes without requiring existing sequences to cover current use cases", async () => {
    const usecaseModel: UseCaseDiagramSpec = {
      diagramKind: "usecase",
      title: "用例模型",
      summary: "两个用例。",
      notes: [],
      actors: [
        {
          id: "actor_user",
          name: "用户",
          actorType: "human",
          responsibilities: [],
        },
      ],
      useCases: [
        {
          eventFlows: [], systemBoundaryId: "system",
          id: "uc_view",
          name: "查看订单",
          goal: "查看订单",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
        {
          eventFlows: [], systemBoundaryId: "system",
          id: "uc_submit",
          name: "提交订单",
          goal: "提交订单",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [{ id: "system", name: "订单系统" }],
      relationships: [{"id":"participation:uc_view","type":"association","sourceId":"actor_user","targetId":"uc_view"},{"id":"participation:uc_submit","type":"association","sourceId":"actor_user","targetId":"uc_submit"}],
    };
    const classRequirementModel: DiagramModelSpec = {
      diagramKind: "class",
      title: "领域概念模型",
      summary: "订单实体。",
      notes: [],
      classes: [
        {
          constraints: [],
          id: "order",
          name: "Order",
          stereotype: "entity",
          attributes: [],
          operations: [],
        },
      ],
      interfaces: [],
      enums: [],
      relationships: [],
    };
    const sequenceModel: DesignDiagramModelSpec = {
      diagramKind: "sequence",
      modelId: "sequence:uc_view",
      title: "查看订单顺序图",
      summary: "查看订单。",
      notes: [],
      sourceUseCaseId: "uc_view",
      sourceUseCaseName: "查看订单",
      participants: [],
      messages: [],
      fragments: [],
    };
    const startDesignRun = vi.fn(async () => ({ runId: "design-run" }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单需求",
          requirementBaseline: createRequirementBaseline([
            createBaselineRule(),
          ]),
          rules: [createRule({  })],
          rulesVersion: 1,
          diagramInputFingerprints: {
            usecase: snapshotInputFingerprint({ requirementText: "订单需求", rules: [createRule()] }),
            class: snapshotInputFingerprint({ requirementText: "订单需求", rules: [createRule()] }),
          },
          generatedDiagramTypes: ["usecase", "class"],
          models: { usecase: usecaseModel, class: classRequirementModel },
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
                elementId: "uc_view",
                elementKind: "usecase",
                label: "查看订单",
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
            {
              ruleId: "r1",
              target: {
                diagramKind: "class",
                elementId: "order",
                elementKind: "class",
                label: "Order",
              },
            },
          ],
          generatedDesignDiagramTypes: ["sequence"],
          designModels: { "sequence:uc_view": sequenceModel },
        }),
      ),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDesignRun,
      subscribeToDesignRun: vi.fn(),
      getDesignRunSnapshot: vi.fn(),

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
      generation = result.current.generateDesignDiagrams(["class"]);
    });
    const confirmation = await screen.findByRole("dialog", {
      name: "确认生成设计模型",
    });
    expect(within(confirmation).queryByText("设计依赖补齐")).not.toBeInTheDocument();
    await user.click(
      within(confirmation).getByRole("button", { name: "确认生成" }),
    );
    await act(async () => {
      await generation;
    });

    expect(startDesignRun).toHaveBeenCalledWith(expect.objectContaining({ selectedDiagrams: ["class"] }));
  });
});
