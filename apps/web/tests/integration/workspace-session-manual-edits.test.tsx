// Verifies workspace session manual edits across repository and UI boundaries.

import { act, renderHook, waitFor } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignDiagramModelSpec, DiagramModelSpec, UseCaseDiagramSpec } from "@uml-platform/contracts";

import type { WorkspaceRepository } from "../../src/services/workspace-repository/index";

import { createWorkspaceRecord, withWorkspaceProviders } from "../helpers/workspace-test-utils";

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
import { storeManagedUserSettings } from "../helpers/workspace-session-fixtures";

describe("WorkspaceSessionProvider", () => {
it("saves manual requirement model edits and clears the mapping warning after rerender", async () => {
    const originalUseCaseModel: UseCaseDiagramSpec = {
      diagramKind: "usecase",
      title: "用例模型",
      summary: "教师登录系统。",
      notes: [],
      actors: [
        {
          id: "actor_teacher",
          name: "教师",
          actorType: "human",
          responsibilities: [],
        },
      ],
      useCases: [
        {
          eventFlows: [],
          id: "uc_login",
          systemBoundaryId: "system",
          name: "登录",
          goal: "进入系统",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [{ id: "system", name: "实验平台" }],
      relationships: [
        {
          id: "rel_login",
          type: "association",
          sourceId: "actor_teacher",
          targetId: "uc_login",
          label: "发起",
        },
      ],
    };
    const editedUseCaseModel: UseCaseDiagramSpec = {
      ...originalUseCaseModel,
      actors: [{ ...originalUseCaseModel.actors[0], name: "授课教师" }],
      useCases: [
        ...originalUseCaseModel.useCases,
        {
          eventFlows: [],
          id: "uc_logout",
          systemBoundaryId: "system",
          name: "退出登录",
          goal: "离开系统",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      relationships: [
        {
          ...originalUseCaseModel.relationships[0],
          label: "发起登录",
          description: "授课教师发起登录。",
        },
        { id: "rel_logout", type: "association", sourceId: "actor_teacher", targetId: "uc_logout" },
      ],
    };
    const saveRequirementModelEdit = vi.fn(async () => {});
    const renderStructuredModel = vi.fn(async () => ({
      plantUmlSource: "@startuml\nactor 授课教师\n@enduml",
      svg: "<svg><text>授课教师</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: "2026-05-25T00:00:00.000Z",
        sourceLength: 28,
        durationMs: 2,
      },
    }));
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          requirementText: "教师登录系统需求",
          models: { usecase: originalUseCaseModel },
          requirementModelTraceability: [
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "actor_teacher",
                elementKind: "actor",
                label: "教师",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "uc_login",
                elementKind: "usecase",
                label: "登录",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "usecase",
                elementId: "rel_login",
                elementKind: "relationship",
                label: "发起",
              },
            },
          ],
          generatedDiagramTypes: ["usecase"],
          diagramVersions: { usecase: 0 },
          plantUml: { usecase: "@startuml\nactor 教师\n@enduml" },
        }),
      ),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),

      renderStructuredModel,
      saveRequirementModelEdit,

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
    expect(result.current.designGenerationBlockedReason).toBeNull();

    await act(async () => {
      await result.current.saveRequirementModelEdit(
        "usecase",
        editedUseCaseModel,
      );
    });

    expect(
      (result.current.models.usecase as UseCaseDiagramSpec | undefined)
        ?.actors[0]?.name,
    ).toBe("授课教师");
    expect(saveRequirementModelEdit).toHaveBeenCalledWith(
      "usecase",
      editedUseCaseModel,
      expect.objectContaining({ status: "dirty" }),
      {
        requirementModelTraceability: [
          expect.objectContaining({
            target: expect.objectContaining({ elementId: "actor_teacher" }),
          }),
          expect.objectContaining({
            target: expect.objectContaining({ elementId: "uc_login" }),
          }),
          expect.objectContaining({
            target: expect.objectContaining({ elementId: "rel_login" }),
          }),
        ],
        designModelTraceability: [],
      },
    );
    expect(result.current.manualModelEditStatus.usecase?.status).toBe("dirty");
    expect(result.current.manualModelEditStatus.usecase?.warning).toMatch(
      /可能与前置需求映射不一致/,
    );
    expect(result.current.requirementTraceabilityStale).toBe(true);
    expect(result.current.designGenerationBlockedReason).toBeNull();

    await act(async () => {
      await result.current.rerenderRequirementModel("usecase");
    });

    expect(renderStructuredModel).toHaveBeenCalledWith(editedUseCaseModel, "requirements");
    expect(result.current.plantUml.usecase).toContain("授课教师");
    expect(result.current.svgArtifacts.usecase?.svg).toContain("授课教师");
    expect(result.current.manualModelEditStatus.usecase?.status).toBe(
      "rerendered",
    );
    expect(result.current.manualModelEditStatus.usecase?.warning).toBeNull();
    expect(result.current.designGenerationBlockedReason).toBeNull();
  });

it("prunes traceability when saving a requirement model with deleted elements", async () => {
    const originalClassModel = {
      diagramKind: "class",
      title: "领域类", summary: "订单领域", notes: [],
      classes: [
        { id: "order", name: "Order", attributes: [], operations: [] },
        { id: "customer", name: "Customer", attributes: [], operations: [] },
      ],
      interfaces: [],
      enums: [],
      relationships: [
        {
          id: "rel_order_customer",
          type: "association",
          sourceId: "order",
          targetId: "customer",
          label: "owns",
        },
      ],
    } as unknown as DiagramModelSpec;
    const editedClassModel = {
      ...originalClassModel,
      classes: [{ id: "order", name: "Order", attributes: [], operations: [] }],
      relationships: [],
    } as unknown as DiagramModelSpec;
    const saveRequirementModelEdit = vi.fn(async () => {});
    const repository: WorkspaceRepository = {
      loadWorkspace: vi.fn(async () =>
        createWorkspaceRecord({
          models: { class: originalClassModel },
          requirementModelTraceability: [
            {
              ruleId: "REQ-1",
              target: {
                diagramKind: "class",
                elementId: "order",
                elementKind: "class",
                label: "Order",
              },
            },
            {
              ruleId: "REQ-2",
              target: {
                diagramKind: "class",
                elementId: "customer",
                elementKind: "class",
                label: "Customer",
              },
            },
            {
              ruleId: "REQ-2",
              target: {
                diagramKind: "class",
                elementId: "rel_order_customer",
                elementKind: "relationship",
                label: "owns",
              },
            },
          ],
          designModels: {
            "design-class": {
              diagramKind: "class",
              modelId: "design-class",
              classes: [
                {
                  id: "order-service",
                  name: "OrderService",
                  attributes: [],
                  operations: [],
                },
              ],
              interfaces: [],
              enums: [],
              relationships: [],
            } as unknown as DesignDiagramModelSpec,
          },
          designModelTraceability: [
            {
              source: {
                diagramKind: "class",
                modelId: "design-class",
                elementId: "order-service",
                elementKind: "class",
                label: "OrderService",
              },
              targets: [
                {
                  diagramKind: "class",
                  elementId: "order",
                  elementKind: "class",
                  label: "Order",
                },
                {
                  diagramKind: "class",
                  elementId: "customer",
                  elementKind: "class",
                  label: "Customer",
                },
              ],
            },
          ],
          generatedDiagramTypes: ["class"],
        }),
      ),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),

      saveRequirementModelEdit,

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
      await result.current.saveRequirementModelEdit("class", editedClassModel);
    });

    expect(result.current.requirementModelTraceability).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({ elementId: "order" }),
      }),
    ]);
    expect(result.current.designModelTraceability).toEqual([
      expect.objectContaining({
        targets: [expect.objectContaining({ elementId: "order" })],
      }),
    ]);
    expect(saveRequirementModelEdit).toHaveBeenCalledWith(
      "class",
      editedClassModel,
      expect.objectContaining({ status: "dirty" }),
      {
        requirementModelTraceability: [
          expect.objectContaining({
            target: expect.objectContaining({ elementId: "order" }),
          }),
        ],
        designModelTraceability: [
          expect.objectContaining({
            targets: [expect.objectContaining({ elementId: "order" })],
          }),
        ],
      },
    );
  });
});
