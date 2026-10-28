// Verifies workspace session documents across repository and UI boundaries.

import { createDocumentRunSnapshot } from "@test/fixtures/contract-fixtures";
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignDiagramModelSpec, DiagramModelSpec, DocumentRunSnapshot } from "@uml-platform/contracts";

import type { WorkspaceRepository } from "../../src/services/workspace-repository/index";

import { createWorkspaceRecord, withWorkspaceProviders } from "../helpers/workspace-test-utils";
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
import { createRule, storeManagedUserSettings, deferred } from "../helpers/workspace-session-fixtures";

describe("WorkspaceSessionProvider", () => {
it("keeps concurrent document runs as separate tasks without auto-downloading files", async () => {
    const requirementModel: DiagramModelSpec = {
      diagramKind: "usecase",
      title: "用例图",
      summary: "核心用例",
      notes: [],
      actors: [],
      useCases: [],
      systemBoundaries: [],
      relationships: [],
    };
    const designModel: DesignDiagramModelSpec = {
      diagramKind: "sequence",
      sourceUseCaseId: "uc",
      title: "顺序图",
      summary: "动态行为",
      notes: [],
      participants: [],
      messages: [],
      fragments: [],
    };
    const snapshots = new Map<string, DocumentRunSnapshot>([
      [
        "doc-req",
        createDocumentRunSnapshot({
          runId: "doc-req",
          documentKind: "requirementsSpec",
          requirementText: "订单系统需求",
          documentId: "doc-requirementsSpec",
          sections: [{ level: 1, title: "1 需求规定", body: ["正文"] }],
          fileName: "需求规格说明书.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteLength: 8,
          missingArtifacts: [],
          currentStage: "render_document_file",
          status: "completed",
          error: null,
        }),
      ],
      [
        "doc-design",
        createDocumentRunSnapshot({
          runId: "doc-design",
          documentKind: "softwareDesignSpec",
          requirementText: "订单系统需求",
          documentId: "doc-softwareDesignSpec",
          sections: [{ level: 1, title: "1 设计概述", body: ["正文"] }],
          fileName: "软件设计说明书.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteLength: 8,
          missingArtifacts: [],
          currentStage: "render_document_file",
          status: "completed",
          error: null,
        }),
      ],
    ]);
    const subscribers = new Map<
      string,
      {
        onEvent: Parameters<
          NonNullable<WorkspaceRepository["subscribeToDocumentRun"]>
        >[1];
        resolve: () => void;
      }
    >();
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单系统需求",
          models: { usecase: requirementModel },
          diagramInputFingerprints: { usecase: snapshotInputFingerprint({ requirementText: "订单系统需求", rules: [] }) },
          designModels: { sequence: designModel },
          designPlantUml: { sequence: "@startuml\n@enduml" },
          generatedDesignDiagramTypes: ["sequence"],
          designInputFingerprints: {
            sequence: designInputFingerprint([requirementModel], []),
          },
          manualModelEditStatus: {
            sequence: {
              status: "rerendered",
              warning: null,
              editedAt: "2026-06-24T00:00:00.000Z",
              rerenderedAt: "2026-06-24T00:00:00.000Z",
            },
          },
        }),
      ),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDocumentRun: vi.fn(async (input) => ({
        runId:
          input.documentKind === "requirementsSpec" ? "doc-req" : "doc-design",
      })),
      subscribeToDocumentRun: vi.fn(
        async (runId, onEvent) =>
          new Promise<void>((resolve) => {
            subscribers.set(runId, { onEvent, resolve });
          }),
      ),
      getDocumentRunSnapshot: vi.fn(async (runId) => snapshots.get(runId)!),

      saveRunHistory: vi.fn(async (snapshot) => ({
        id: snapshot.runId,
        createdAt: new Date().toISOString(),
        title: "document",
        snapshot,
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

    let requirementsPromise!: Promise<DocumentRunSnapshot | null>;
    act(() => {
      requirementsPromise = result.current.generateRequirementsSpec();
    });
    await waitFor(() => {
      expect(subscribers.has("doc-req")).toBe(true);
    });
    let designPromise!: Promise<DocumentRunSnapshot | null>;
    act(() => {
      designPromise = result.current.generateSoftwareDesignSpec();
    });
    await waitFor(() => {
      expect(subscribers.has("doc-design")).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.generationTasks.map((task) => task.title)).toEqual([
        "软件设计说明书",
        "需求规格说明书",
      ]);
    });
    expect(
      result.current.generationTasks.some((task) => task.status === "queued"),
    ).toBe(true);
    expect(result.current.generating).toBe(false);

    for (const runId of ["doc-design", "doc-req"]) {
      const subscriber = subscribers.get(runId)!;
      act(() => {
        subscriber.onEvent({ type: "queued" });
        subscriber.onEvent({
          type: "completed",
          snapshot: snapshots.get(runId)!,
        });
        subscriber.resolve();
      });
    }

    await act(async () => {
      await requirementsPromise;
      await designPromise;
    });

    await waitFor(() => {
      expect(result.current.generationTasks).toHaveLength(2);
      expect(
        result.current.generationTasks.every(
          (task) => task.status === "completed",
        ),
      ).toBe(true);
    });
    expect(repository.saveRunHistory).toHaveBeenCalledTimes(2);
    expect(result.current.currentRunDiagnostics.runId).toBe("doc-design");
    expect(result.current.generationTasks.at(0)?.message).toBe("说明书生成完成");
    const successDialog = await screen.findByRole("dialog", {
      name: "说明书已生成",
    });
    expect(
      within(successDialog).getByText("软件设计说明书已生成。"),
    ).toBeInTheDocument();
    expect(
      within(successDialog).queryByText("需求规格说明书已生成。"),
    ).not.toBeInTheDocument();
  });

it("surfaces document completion warnings when generated DOCX has missing diagrams", async () => {
    const requirementModel: DiagramModelSpec = {
      diagramKind: "usecase",
      title: "用例图",
      summary: "核心用例",
      notes: [],
      actors: [],
      useCases: [],
      systemBoundaries: [],
      relationships: [],
    };
    const snapshot: DocumentRunSnapshot = createDocumentRunSnapshot({
      runId: "doc-warning",
      documentKind: "requirementsSpec",
      requirementText: "订单系统需求",
      documentId: "doc-requirementsSpec",
      sections: [{ level: 1, title: "1 需求规定", body: ["正文"] }],
      fileName: "需求规格说明书.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      byteLength: 8,
      missingArtifacts: ["用例图：缺少可嵌入图片源"],
      currentStage: "render_document_file",
      status: "completed",
      error: null,
    });
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单系统需求",
          models: { usecase: requirementModel },
          diagramInputFingerprints: { usecase: snapshotInputFingerprint({ requirementText: "订单系统需求", rules: [] }) },
        }),
      ),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDocumentRun: vi.fn(async () => ({ runId: "doc-warning" })),
      subscribeToDocumentRun: vi.fn(async (_runId, onEvent) => {
        onEvent({ type: "queued" });
        onEvent({ type: "completed", snapshot });
      }),
      getDocumentRunSnapshot: vi.fn(async () => snapshot),

      saveRunHistory: vi.fn(async (savedSnapshot) => ({
        id: savedSnapshot.runId,
        createdAt: new Date().toISOString(),
        title: "document",
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
      await result.current.generateRequirementsSpec();
    });

    expect(result.current.generationTasks.at(0)?.message).toBe(
      "说明书生成完成，但有 1 项图源缺失，请复核",
    );
    expect(result.current.generationTasks[0]?.message).toBe(
      "说明书生成完成，但有 1 项图源缺失，请复核",
    );
    expect(repository.saveRunHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        missingArtifacts: ["用例图：缺少可嵌入图片源"],
      }),
      expect.any(Object),
    );
  });

it("warns when document generation completes after upstream inputs change", async () => {
    toastMessage.mockClear();
    const requirementModel: DiagramModelSpec = {
      diagramKind: "usecase",
      title: "用例图",
      summary: "核心用例",
      notes: [],
      actors: [],
      useCases: [],
      systemBoundaries: [],
      relationships: [],
    };
    const snapshot: DocumentRunSnapshot = createDocumentRunSnapshot({
      runId: "doc-stale",
      documentKind: "requirementsSpec",
      requirementText: "订单系统需求",
      documentId: "doc-requirementsSpec",
      sections: [{ level: 1, title: "1 需求规定", body: ["正文"] }],
      fileName: "需求规格说明书.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      byteLength: 8,
      missingArtifacts: [],
      currentStage: "render_document_file",
      status: "completed",
      error: null,
    });
    const subscription = deferred<void>();
    let onDocumentEvent:
      | Parameters<NonNullable<WorkspaceRepository["subscribeToDocumentRun"]>>[1]
      | null = null;
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单系统需求",
          models: { usecase: requirementModel },
          diagramInputFingerprints: { usecase: snapshotInputFingerprint({ requirementText: "订单系统需求", rules: [] }) },
        }),
      ),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDocumentRun: vi.fn(async () => ({ runId: "doc-stale" })),
      subscribeToDocumentRun: vi.fn(async (_runId, onEvent) => {
        onDocumentEvent = onEvent;
        return subscription.promise;
      }),
      getDocumentRunSnapshot: vi.fn(async () => snapshot),

      saveRunHistory: vi.fn(async (savedSnapshot) => ({
        id: savedSnapshot.runId,
        createdAt: new Date().toISOString(),
        title: "document",
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

    let documentPromise!: Promise<DocumentRunSnapshot | null>;
    act(() => {
      documentPromise = result.current.generateRequirementsSpec();
    });
    await waitFor(() => {
      expect(onDocumentEvent).not.toBeNull();
    });

    act(() => {
      result.current.setRequirementText("订单系统需求 v2");
    });
    await waitFor(() => {
      expect(result.current.requirementText).toBe("订单系统需求 v2");
    });
    expect(toastMessage).not.toHaveBeenCalled();

    act(() => {
      onDocumentEvent?.({ type: "completed", snapshot });
      subscription.resolve();
    });
    await act(async () => {
      await documentPromise;
    });

    expect(toastMessage).toHaveBeenCalledWith(
      "结果基于生成开始时的内容，期间修改不会自动合并到本次结果",
    );
    expect(repository.saveRunHistory).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "doc-stale" }),
      expect.any(Object),
    );
  });

it("blocks software design specification generation when sequence designs do not cover all use cases", async () => {
    const usecaseModel: DiagramModelSpec = {
      diagramKind: "usecase",
      title: "用例图",
      summary: "订单核心用例。",
      notes: [],
      actors: [],
      useCases: [
        {
          eventFlows: [],
          id: "uc_view",
          name: "查看订单",
          goal: "查看订单",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
        {
          eventFlows: [],
          id: "uc_submit",
          name: "提交订单",
          goal: "提交订单",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [],
      relationships: [],
    };
    const sequenceModel: DesignDiagramModelSpec = {
      diagramKind: "sequence",
      modelId: "sequence:uc_view",
      title: "查看订单顺序图",
      summary: "查看订单流程。",
      notes: [],
      sourceUseCaseId: "uc_view",
      sourceUseCaseName: "查看订单",
      participants: [],
      messages: [],
      fragments: [],
    };
    const startDocumentRun = vi.fn(async () => ({
      runId: "doc-should-not-start",
    }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "订单系统需求",
          rules: [createRule()],
          models: { usecase: usecaseModel },
          designModels: { "sequence:uc_view": sequenceModel },
        }),
      ),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),
      startDocumentRun,
      subscribeToDocumentRun: vi.fn(),
      getDocumentRunSnapshot: vi.fn(),

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

    await act(async () => {
      await result.current.generateSoftwareDesignSpec();
    });

    expect(startDocumentRun).not.toHaveBeenCalled();
    expect(result.current.runStatus).toBe("failed");

    expect(
      await screen.findByRole("dialog", { name: "暂时无法开始生成" }),
    ).toBeInTheDocument();
  });
});
