// Verifies workspace session rule persistence across repository and UI boundaries.

import { act, renderHook, waitFor } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseCaseDiagramSpec } from "@uml-platform/contracts";

import type { WorkspaceRepository } from "../../src/services/workspace-repository/index";
import type { RunHistoryItem } from "../../src/entities/run-history/index";
import { createRunSnapshot, createWorkspaceRecord, withWorkspaceProviders } from "../helpers/workspace-test-utils";

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
it("records failed rules-only snapshots in history without clearing existing rules", async () => {
    const oldRule = createRule({
      id: "old-rule",
      text: "旧规则仍可查看。",

    });
    const failedSnapshot = createRunSnapshot({
      runId: "run-rules-failed",
      requirementText: "订单系统需求",
      selectedDiagrams: [],
      rules: [],
      currentStage: "extract_rules",
      status: "failed",
      error: {
        code: "RUN_STRUCTURED_OUTPUT_INVALID",
        message: "需求规则抽取失败",
        category: "generation",
        retryable: true,
      },
      requirementTrace: [],
    });
    const savedHistory: RunHistoryItem[] = [];
    const saveRunHistory = vi.fn(
      async (
        snapshot: Parameters<WorkspaceRepository["saveRunHistory"]>[0],
        meta: Parameters<WorkspaceRepository["saveRunHistory"]>[1],
      ) => {
        const item: RunHistoryItem = {
          id: snapshot.runId,
          createdAt: "2026-06-21T00:00:00.000Z",
          title: "订单系统需求",
          snapshot,
          providerModel: meta.providerModel,
          durationMs: meta.durationMs,
        };
        savedHistory.splice(0, savedHistory.length, item);
        return item;
      },
    );
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单系统需求",
          rules: [oldRule],
          rulesVersion: 1,
        }),
      ),

      startRun: vi.fn(async () => ({ runId: "run-rules-failed" })),
      subscribeToRun: vi.fn(async () => {
        throw new Error("需求规则抽取失败");
      }),
      getRunSnapshot: vi.fn(async () => failedSnapshot),

      saveRunHistory,
      listRunHistory: vi.fn(async () => savedHistory),
      deleteRunHistory: vi.fn(async () => []),

    };

    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });

    await waitFor(() => {
      expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
      expect(result.current.workspaceInitialized).toBe(true);
    });

    await act(async () => {
      await result.current.generateRules();
    });

    expect(result.current.rules).toEqual([oldRule]);
    expect(saveRunHistory).toHaveBeenCalledWith(
      failedSnapshot,
      expect.objectContaining({ providerModel: expect.any(String) }),
    );
    expect(result.current.historyItems.map((item) => item.id)).toEqual([
      "run-rules-failed",
    ]);
    expect(result.current.generationTasks[0]?.status).toBe("failed");
    expect(
      result.current.generationTasks[0]?.subtasks.find(
        (subtask) => subtask.id === "extract_rules",
      )?.status,
    ).toBe("failed");
  });

it("passes an unsaved requirement draft to the rules run and commits after success", async () => {
    const startRun = vi.fn(async () => ({ runId: "run-flushed-rules" }));
    const snapshot = createRunSnapshot({
      runId: "run-flushed-rules",
      requirementText: "刚输入就生成的需求",
      rules: [createRule()],
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({ requirementText: "旧需求" }),
      ),

      startRun,
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({ type: "completed", snapshot });
      }),
      getRunSnapshot: vi.fn(async () => snapshot),

      saveRunHistory: vi.fn(async (savedSnapshot) => ({
        id: savedSnapshot.runId,
        createdAt: new Date().toISOString(),
        title: "test",
        snapshot: savedSnapshot,
        providerModel: "gpt-5.5",
      })),
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

    act(() => {
      result.current.setRequirementText("刚输入就生成的需求");
    });
    let generationPromise!: Promise<boolean>;
    act(() => {
      generationPromise = result.current.generateRules();
    });

    expect(result.current.hasUncommittedRequirementDraft).toBe(true);
    await act(async () => {
      await generationPromise;
    });

    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        requirementText: "刚输入就生成的需求",
        selectedDiagrams: [],
      }),
    );
    expect(result.current.rules).toHaveLength(1);
    expect(result.current.hasUncommittedRequirementDraft).toBe(false);
  });

it("keeps the prior rules and unsaved draft when project sync fails", async () => {
    const oldRule = createRule({ id: "old-rule", text: "旧规则" });
    const snapshot = createRunSnapshot({
      runId: "run-sync-failed",
      requirementText: "新需求",
      rules: [createRule({ id: "new-rule", text: "新规则" })],
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () => createWorkspaceRecord({
        requirementText: "旧需求",
        rules: [oldRule],
      })),

      startRun: vi.fn(async () => ({ runId: snapshot.runId })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "completed", snapshot });
      }),
      getRunSnapshot: vi.fn(async () => snapshot),

      saveRunHistory: vi.fn(async () => { throw new Error("项目保存失败"); }),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }) => withWorkspaceProviders(children, repository),
    });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    act(() => result.current.setRequirementText("新需求"));
    await act(async () => { await result.current.generateRules(); });

    expect(result.current.requirementText).toBe("新需求");
    expect(result.current.hasUncommittedRequirementDraft).toBe(true);
    expect(result.current.rules).toEqual([oldRule]);
    expect(result.current.runStatus).toBe("failed");

  });

it("prunes requirement model traceability when rules-only generation replaces rule ids", async () => {
    const oldRule = createRule({ id: "r1", text: "用户可以提交订单。" });
    const newRule = createRule({ id: "r2", text: "系统必须先校验库存。" });
    const snapshot = createRunSnapshot({
      runId: "run-replace-rules",
      requirementText: "订单系统需求",
      rules: [newRule],
    });
    const updateRequirementRules = vi.fn(async () => {});
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单系统需求",
          rules: [oldRule],
          requirementModelTraceability: [
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "uc_submit_order",
                elementKind: "usecase",
                label: "提交订单",
              },
            },
            {
              ruleId: "r2",
              target: {
                diagramKind: "usecase",
                elementId: "uc_check_stock",
                elementKind: "usecase",
                label: "校验库存",
              },
            },
          ],
        }),
      ),

      updateRequirementRules,
      startRun: vi.fn(async () => ({ runId: "run-replace-rules" })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({ type: "completed", snapshot });
      }),
      getRunSnapshot: vi.fn(async () => snapshot),

      saveRunHistory: vi.fn(async (savedSnapshot) => ({
        id: savedSnapshot.runId,
        createdAt: new Date().toISOString(),
        title: "test",
        snapshot: savedSnapshot,
        providerModel: "gpt-5.5",
      })),
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

    await act(async () => {
      await result.current.generateRules();
    });

    expect(result.current.rules).toEqual([newRule]);
    expect(result.current.requirementModelTraceability).toEqual([
      expect.objectContaining({
        ruleId: "r2",
        target: expect.objectContaining({ elementId: "uc_check_stock" }),
      }),
    ]);
    expect(updateRequirementRules).toHaveBeenCalledWith(
      [newRule],
      expect.objectContaining({
        requirementModelTraceability: [
          expect.objectContaining({
            ruleId: "r2",
            target: expect.objectContaining({ elementId: "uc_check_stock" }),
          }),
        ],
      }),
    );
  });

it("drops only the edited rule's baseline entry when a user edits requirement rules", async () => {
    const rule = createRule({
      id: "r1",
      text: "用户可以提交订单。",

    });
    const requirement = createBaselineRule({ requirementId: "REQ-001", id: "r1" });
    const baseline = createRequirementBaseline([requirement], {
      qualityReport: {
        runId: "run-rules",
        status: "pending-review",
        summary: "旧规则存在待确认字段。",
        issues: [
          {
            id: "issue-old-rule",
            requirementId: "REQ-001",
            severity: "warning",
            code: "missing-actor",
            message: "缺少参与者。",
            blocksDownstream: true,
          },
        ],
        blockingIssueIds: ["issue-old-rule"],
        reviewRequiredRequirementIds: ["REQ-001"],
      },
    });
    const updateRequirementRules = vi.fn(async () => {});
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单系统需求",
          rules: [rule],
          rulesVersion: 1,
          rulesBasedOnTextVersion: 0,
          requirementBaseline: baseline,
          requirementQualityReport: baseline.qualityReport,

        }),
      ),

      updateRequirementRules,
      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),

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
    expect(result.current.requirementBaseline).toEqual((await repository.loadWorkspace()).requirementBaseline);
    expect(result.current.requirementBaseline?.qualityReport).toEqual(
      baseline.qualityReport,
    );

    act(() => {
      result.current.updateRequirementRule("r1", {
        text: "用户可以提交订单并接收库存校验结果。",
      });
    });

    expect(result.current.requirementBaseline?.rules[0]?.text).toBe("用户可以提交订单并接收库存校验结果。");
    expect(result.current.requirementBaseline?.qualityReport?.issues).toEqual([]);
    expect(updateRequirementRules).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "r1",
          text: "用户可以提交订单并接收库存校验结果。",
        }),
      ],
      expect.objectContaining({
        requirementBaseline: expect.objectContaining({ rules: expect.any(Array) }),

        rulesBasedOnTextVersion: 0,
        rulesVersion: 2,
      }),
    );
  });

it("treats manual rule edits as current rules while marking existing models stale", async () => {
    const requirementText = "订单系统需求";
    const originalRule = createRule({
      id: "r1",
      type: "functional" as const,
      text: "用户提交订单。",

    });
    const originalFingerprint = snapshotInputFingerprint({
      requirementText,
      rules: [originalRule],
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
    const updateRequirementRules = vi.fn(async () => {});
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText,
          rules: [originalRule],
          models: { usecase: usecaseModel },
          generatedDiagramTypes: ["usecase"],
          selectedDiagramTypes: ["usecase"],
          requirementInputFingerprint: originalFingerprint,
          diagramInputFingerprints: { usecase: originalFingerprint },
          diagramVersions: { usecase: 4 },
          rulesVersion: 4,
          rulesBasedOnTextVersion: 0,
        }),
      ),

      updateRequirementRules,
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
    expect(result.current.isRulesStale).toBe(false);
    expect(result.current.staleDiagrams).toEqual([]);

    act(() => {
      result.current.updateRequirementRule("r1", {
        text: "用户提交订单并收到确认消息。",
      });
    });

    const editedRules = [
      {
        ...originalRule,
        text: "用户提交订单并收到确认消息。",
      },
    ];
    const editedFingerprint = snapshotInputFingerprint({
      requirementText,
      rules: editedRules,
    });

    expect(result.current.isRulesStale).toBe(false);
    expect(result.current.staleDiagrams).toEqual(["usecase"]);
    expect(updateRequirementRules).toHaveBeenLastCalledWith(
      editedRules,
      expect.objectContaining({
        requirementInputFingerprint: editedFingerprint,
        rulesBasedOnTextVersion: 0,
        rulesVersion: 5,
      }),
    );
  });
});
