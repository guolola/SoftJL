// Verifies cumulative analysis receipts populate the live sidebar without reloading the workspace.
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { captureWorkspaceGuard, createRequirementBaselineSnapshot, snapshotInputFingerprint, type AnalysisSequenceDiagramSpec, type UseCaseDiagramSpec } from "@uml-platform/contracts";
import { modelFixture } from "../../../../../../packages/contracts/dist/testing/model-fixtures";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { createRenderMeta, createRunSnapshot } from "../../../test/contract-fixtures";
import { createRule, createWorkspaceRecord, withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { SidebarMenu } from "../../workspace-shell/components/sidebar-menu";
import { useWorkspaceSession } from "../state";

afterEach(() => localStorage.clear());

it("shows every analysis model after successive guarded receipts and completion", async () => {
  localStorage.setItem("uml-lab-settings", JSON.stringify({ providerConfigId: "provider", defaultModel: "model", providerModelOptions: ["model"] }));
  const rules = [createRule({ type: "functional", text: "管理员可以配置工具和管理知识库。" })];
  const requirementText = rules[0]!.text;
  const requirementBaseline = createRequirementBaselineSnapshot({ runId: "baseline", requirementText, rules });
  const fingerprint = snapshotInputFingerprint({ requirementText, rules });
  const baseUsecase = modelFixture("requirements", "usecase") as UseCaseDiagramSpec;
  const usecase: UseCaseDiagramSpec = { ...baseUsecase, useCases: ["配置工具", "管理知识库"].map((name, index) => ({
    ...baseUsecase.useCases[0]!, id: `uc_${index}`, name, primaryActorId: "actor",
    eventFlows: [{ id: `flow_${index}`, name: "主流程", flowType: "main", steps: [{ order: 1, actor: "actor", actorAction: name, systemAction: "保存配置" }] }],
  })), relationships: [0, 1].map((index) => ({ id: `rel_${index}`, type: "association", sourceId: "actor", targetId: `uc_${index}` })) };
  const workspace = createWorkspaceRecord({ requirementText, rules, requirementBaseline, models: { usecase },
    generatedDiagramTypes: ["usecase"], requirementInputFingerprint: fingerprint, diagramInputFingerprints: { usecase: fingerprint },
    rulesVersion: 1, rulesBasedOnTextVersion: 0, diagramVersions: { usecase: 1 } });
  const models = usecase.useCases.map((useCase) => ({
    ...(modelFixture("requirements", "analysis") as AnalysisSequenceDiagramSpec), modelId: `analysis:${useCase.id}`,
    sourceUseCaseId: useCase.id, sourceUseCaseName: useCase.name,
  }));
  const snapshotFor = (count: number) => {
    const accepted = models.slice(0, count);
    const snapshot = createRunSnapshot({ runId: "analysis-run", status: "running", requirementText, rules, requirementBaseline,
      selectedDiagrams: ["analysis"], analysisTargetUseCaseIds: usecase.useCases.map((item) => item.id), models: accepted,
      plantUml: accepted.map((model) => ({ diagramKind: "analysis", modelId: model.modelId, source: `@startuml\n${model.modelId}\n@enduml` })),
      svgArtifacts: accepted.map((model) => ({ diagramKind: "analysis", modelId: model.modelId, svg: "<svg />", renderMeta: createRenderMeta() })),
    });
    snapshot.workspaceGuard = captureWorkspaceGuard({ snapshot }, { ...workspace });
    return snapshot;
  };
  const completed = { ...snapshotFor(2), status: "completed" as const };
  let callbacks!: { event: Parameters<WorkspaceRepository["subscribeToRun"]>[1]; options: Parameters<WorkspaceRepository["subscribeToRun"]>[2] };
  let finish!: () => void;
  const subscription = new Promise<void>((resolve) => { finish = resolve; });
  const repository: WorkspaceRepository = {
    loadWorkspace: vi.fn(async () => workspace), updateRequirementText: vi.fn(async () => {}),
    startRun: vi.fn(async () => ({ runId: completed.runId })),
    subscribeToRun: vi.fn(async (_runId, event, options) => { callbacks = { event, options }; await subscription; }),
    getRunSnapshot: vi.fn(async () => completed), renderPlantUml: vi.fn(), testProviderSettings: vi.fn(),
    saveRunHistory: vi.fn(), listRunHistory: vi.fn(async () => []), deleteRunHistory: vi.fn(async () => []), clearRunHistory: vi.fn(async () => {}),
  };
  const { result } = renderHook(() => useWorkspaceSession(), {
    wrapper: ({ children }) => withWorkspaceProviders(<>{children}<SidebarMenu /></>, repository),
  });
  const user = userEvent.setup();
  await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
  let generation!: Promise<void>;
  act(() => { generation = result.current.generateDiagrams(["analysis"]); });
  await user.click(await screen.findByRole("button", { name: "确认生成" }));
  await waitFor(() => expect(callbacks).toBeDefined());
  act(() => { callbacks.options?.onSnapshot?.(snapshotFor(1)); });
  await waitFor(() => expect(result.current.models[models[0]!.modelId!]).toBeDefined());
  await user.click(screen.getByRole("button", { name: "展开 需求模型" }));
  await user.click(screen.getByRole("button", { name: "展开 需求分析模型" }));
  expect(screen.getByRole("button", { name: "配置工具" })).toBeInTheDocument();
  act(() => { callbacks.options?.onSnapshot?.(snapshotFor(2)); });
  await waitFor(() => expect(result.current.models[models[1]!.modelId!]).toBeDefined());
  expect(screen.getByRole("button", { name: "管理知识库" })).toBeInTheDocument();
  await act(async () => { callbacks.event({ type: "completed", snapshot: completed }); finish(); await generation; });
  await user.click(screen.getByRole("button", { name: "我知道了" }));
  expect(Object.values(result.current.models).filter((model) => model?.diagramKind === "analysis")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "配置工具" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "管理知识库" })).toBeInTheDocument();
  expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
});
