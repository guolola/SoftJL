// Verifies workspace session state transitions, generation flows, persistence sync, and UI feedback contracts.
import { createDesignRunSnapshot, createDocumentRunSnapshot, createRenderMeta } from "@/test/contract-fixtures";
import { act, render, renderHook, screen, waitFor, within, } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtomicRequirement, DesignDiagramModelSpec, DesignRunSnapshot, DiagramModelSpec, DocumentRunSnapshot, RequirementBaseline, UseCaseDiagramSpec, } from "@uml-platform/contracts";
import { designRunSnapshotSchema, captureWorkspaceGuard, feasibilityRunSnapshotSchema } from "@uml-platform/contracts";
import { deriveSidebarDiagramState } from "../workspace-shell/lib/sidebar-menu-model";
import type { StartRunInput, WorkspaceRepository, } from "../../services/workspace-repository";
import type { RunHistoryItem } from "../../entities/run-history";
import { createRule, createRunSnapshot, createWorkspaceRecord, createUseCaseRelationshipTrace, withWorkspaceProviders, } from "../../test/workspace-test-utils";
import { designInputFingerprint } from "../../shared/lib/fingerprint";
import { snapshotInputFingerprint } from "./lib/fingerprint";
import { useWorkspaceSession } from "./state";
import { createMockWorkspaceRepository } from "../../services/workspace-repository/mock-repository";
const { toastMessage } = vi.hoisted(() => ({
    toastMessage: vi.fn(),
}));
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
vi.mock("../../shared/ui/floating-alert", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../shared/ui/floating-alert")>();
    return { ...actual, floatingAlert: {
            ...actual.floatingAlert,
            message: toastMessage,
        } };
});
function storeManagedUserSettings() {
    localStorage.setItem("uml-lab-settings", JSON.stringify({
        providerConfigId: "provider-config-1",
        defaultModel: "gpt-5.5",
        providerModelOptions: ["gpt-5.5"],
        imageModel: "nano-banana-pro",
        fontSize: "md",
        autoGenerate: false,
        showStaleBanner: true,
    }));
}
function GenerateRulesHarness() {
    const { generateRules } = useWorkspaceSession();
    return (<button type="button" onClick={() => void generateRules()}>
      生成需求规则
    </button>);
}
function createAtomicRequirement(overrides: Partial<AtomicRequirement> = {}): AtomicRequirement {
    return {
        id: "REQ-001",
        sourceRuleId: "r1",
        sourceFragment: "用户可以提交订单。",
        sourceLocation: { section: "input", startOffset: 0, endOffset: 9 },
        type: "functional",
        actor: "用户",
        subject: "用户",
        action: "提交",
        object: "订单",
        condition: "用户已登录",
        outcome: "系统创建订单",
        confidence: 0.86,
        status: "accepted",
        criticality: "high",
        acceptanceCriteria: ["用户提交订单后系统创建订单。"],
        priority: "must",
        fieldProvenance: {},
        ...overrides,
    };
}
function createRequirementBaseline(requirements: AtomicRequirement[], overrides: Partial<RequirementBaseline> = {}): RequirementBaseline {
    return {
        runId: "run-baseline",
        sourceDocumentId: "inline-requirement",
        createdAt: "2026-05-27T00:00:00.000Z",
        assumptions: [],
        conflicts: [],
        requirements,
        qualityReport: {
            runId: "run-baseline",
            status: "passed",
            summary: "需求规则已确认。",
            issues: [],
            blockingIssueIds: [],
            reviewRequiredRequirementIds: [],
        },
        ...overrides,
    };
}
beforeEach(() => {
    storeManagedUserSettings();
    toastMessage.mockClear();
});
afterEach(() => {
    localStorage.clear();
});
function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((innerResolve, innerReject) => {
        resolve = innerResolve;
        reject = innerReject;
    });
    return { promise, resolve, reject };
}
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
            updateRequirementText: vi.fn(async () => { }), startRun: vi.fn(),
            subscribeToRun: subscribe, subscribeToDesignRun: subscribe,
            getRunSnapshot: vi.fn(async () => base), getDesignRunSnapshot: vi.fn(async () => snapshot as DesignRunSnapshot),
            renderPlantUml: vi.fn(), testProviderSettings: vi.fn(), saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []), clearRunHistory: vi.fn(async () => { }),
        };
        const { result, unmount } = renderHook(() => useWorkspaceSession(), {
            wrapper: ({ children }) => withWorkspaceProviders(children, repository),
        });
        await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
        const projectRun = { runId, status: "running", runKind: kind, selectedDiagrams: ["class", "deployment"] as const };
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
                    requirementText: loadCount === 1 ? "初始出版系统需求" : "恢复后的出版系统需求",
                });
            }),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => loadCount > 1
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
                : []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
    it("shows Figma-style generation result dialogs with a single confirm close action", async () => {
        toastMessage.mockClear();
        let runIndex = 0;
        const createSuccessSnapshot = () => createRunSnapshot({
            runId: `run-success-dialog-${runIndex}`,
            requirementText: "订单系统需求",
            rules: [createRule()],
        });
        const successRepository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({ requirementText: "订单系统需求" })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => {
                runIndex += 1;
                return { runId: `run-success-dialog-${runIndex}` };
            }),
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                const successSnapshot = createSuccessSnapshot();
                onEvent({ type: "completed", snapshot: successSnapshot });
            }),
            getRunSnapshot: vi.fn(async () => createSuccessSnapshot()),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
        };
        const user = userEvent.setup();
        render(withWorkspaceProviders(<GenerateRulesHarness />, successRepository));
        await user.click(await screen.findByRole("button", { name: "生成需求规则" }));
        const successDialog = await screen.findByRole("dialog", {
            name: "需求规则已生成",
        });
        expect(successDialog).toHaveClass("sm:max-w-[448px]", "rounded-[12px]");
        expect(within(successDialog).getByLabelText("操作成功")).toHaveClass("bg-success/10");
        expect(within(successDialog).getByText("生成完成。")).toBeInTheDocument();
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(screen.queryByRole("dialog", { name: "生成成功" })).not.toBeInTheDocument();
        expect(toastMessage).not.toHaveBeenCalled();
        expect(within(successDialog).queryByRole("button", { name: "取消" })).not.toBeInTheDocument();
        await user.click(within(successDialog).getByRole("button", { name: "我知道了" }));
        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "需求规则已生成" })).not.toBeInTheDocument();
        });
        toastMessage.mockClear();
        await user.click(screen.getByRole("button", { name: "生成需求规则" }));
        const successDialogAgain = await screen.findByRole("dialog", {
            name: "需求规则已生成",
        });
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(screen.queryByRole("dialog", { name: "生成成功" })).not.toBeInTheDocument();
        expect(toastMessage).not.toHaveBeenCalled();
        await user.click(within(successDialogAgain).getByRole("button", { name: "我知道了" }));
        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "需求规则已生成" })).not.toBeInTheDocument();
        });
    });
    it("shows generation failures without raw technical details", async () => {
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({ requirementText: "订单系统需求" })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => ({ runId: "run-failed-dialog" })),
            subscribeToRun: vi.fn(async () => {
                throw new Error("Trusted chain traceability gate failed: runId=abc123");
            }),
            getRunSnapshot: vi.fn(),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
        };
        const user = userEvent.setup();
        render(withWorkspaceProviders(<GenerateRulesHarness />, repository));
        await user.click(await screen.findByRole("button", { name: "生成需求规则" }));
        const failedDialog = await screen.findByRole("dialog", {
            name: "任务遇到内部错误",
        });
        expect(failedDialog).toHaveClass("sm:max-w-[448px]", "rounded-[12px]");
        expect(within(failedDialog).getByLabelText("操作失败")).toHaveClass("bg-destructive/10");
        expect(within(failedDialog).getByText("生成任务失败，请稍后重试。 任务或请求编号：run-failed-dialog。")).toBeInTheDocument();
        expect(within(failedDialog).queryByRole("button", { name: "取消" })).not.toBeInTheDocument();
        expect(within(failedDialog).getByRole("button", { name: "我知道了" })).toBeInTheDocument();
        expect(within(failedDialog).queryByText("影响：")).not.toBeInTheDocument();
        expect(within(failedDialog).queryByText("技术详情")).not.toBeInTheDocument();
        expect(failedDialog).toHaveTextContent("run-failed-dialog");
        await user.click(within(failedDialog).getByRole("button", { name: "我知道了" }));
        await user.click(screen.getByRole("button", { name: "生成需求规则" }));
        expect(await screen.findByRole("dialog", { name: "任务遇到内部错误" })).toBeInTheDocument();
    });
    it("records failed rules-only snapshots in history without clearing existing rules", async () => {
        const oldRule = createRule({
            id: "old-rule",
            text: "旧规则仍可查看。",
            relatedDiagrams: ["usecase"],
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
        const saveRunHistory = vi.fn(async (snapshot: Parameters<WorkspaceRepository["saveRunHistory"]>[0], meta: Parameters<WorkspaceRepository["saveRunHistory"]>[1]) => {
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
        });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "订单系统需求",
                rules: [oldRule],
                rulesVersion: 1,
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => ({ runId: "run-rules-failed" })),
            subscribeToRun: vi.fn(async () => {
                throw new Error("需求规则抽取失败");
            }),
            getRunSnapshot: vi.fn(async () => failedSnapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory,
            listRunHistory: vi.fn(async () => savedHistory),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(saveRunHistory).toHaveBeenCalledWith(failedSnapshot, expect.objectContaining({ providerModel: expect.any(String) }));
        expect(result.current.historyItems.map((item) => item.id)).toEqual([
            "run-rules-failed",
        ]);
        expect(result.current.generationTasks[0]?.status).toBe("failed");
        expect(result.current.generationTasks[0]?.subtasks.find((subtask) => subtask.id === "extract_rules")?.status).toBe("failed");
    });
    it("blocks requirement model generation when rules need autofill but no requirement source exists", async () => {
        const startRun = vi.fn(async () => ({ runId: "run-should-not-start" }));
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "",
                rules: [],
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun,
            subscribeToRun: vi.fn(async () => { }),
            getRunSnapshot: vi.fn(),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
        };
        const { result } = renderHook(() => useWorkspaceSession(), {
            wrapper: ({ children }) => withWorkspaceProviders(children, repository),
        });
        await waitFor(() => {
            expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
            expect(result.current.workspaceInitialized).toBe(true);
        });
        await act(async () => {
            await result.current.generateDiagrams(["usecase"]);
        });
        expect(startRun).not.toHaveBeenCalled();
        const warningDialog = await screen.findByRole("dialog", {
            name: "缺少需求来源",
        });
        expect(within(warningDialog).getByText("缺少需求来源，无法自动生成需求规则")).toBeInTheDocument();
    });
    it("does not show a stale success dialog when final snapshot handling fails", async () => {
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({ requirementText: "订单系统需求" })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => ({ runId: "run-completed-then-failed" })),
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                onEvent({
                    type: "completed",
                    snapshot: createRunSnapshot({
                        runId: "run-completed-then-failed",
                        requirementText: "订单系统需求",
                        rules: [createRule()],
                    }),
                });
            }),
            getRunSnapshot: vi.fn(async () => {
                throw new Error("Final snapshot unavailable");
            }),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
        };
        const user = userEvent.setup();
        render(withWorkspaceProviders(<GenerateRulesHarness />, repository));
        await user.click(await screen.findByRole("button", { name: "生成需求规则" }));
        const failedDialog = await screen.findByRole("dialog", {
            name: "任务遇到内部错误",
        });
        expect(screen.queryByRole("dialog", { name: "需求规则已生成" })).not.toBeInTheDocument();
        await user.click(within(failedDialog).getByRole("button", { name: "我知道了" }));
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
        expect(screen.queryByRole("dialog", { name: "需求规则已生成" })).not.toBeInTheDocument();
    });
    it("keeps global generating true for active model runs", async () => {
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "订单系统需求",
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => ({ runId: "run-rules" })),
            subscribeToRun: vi.fn(async () => new Promise<void>(() => { })),
            getRunSnapshot: vi.fn(),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
        };
        const { result } = renderHook(() => useWorkspaceSession(), {
            wrapper: ({ children }) => withWorkspaceProviders(children, repository),
        });
        await waitFor(() => {
            expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
            expect(result.current.workspaceInitialized).toBe(true);
        });
        act(() => {
            void result.current.generateRules();
        });
        await waitFor(() => {
            expect(result.current.generating).toBe(true);
        });
    });
    it("passes an unsaved requirement draft to the rules run and commits after success", async () => {
        const startRun = vi.fn(async () => ({ runId: "run-flushed-rules" }));
        const snapshot = createRunSnapshot({
            runId: "run-flushed-rules",
            requirementText: "刚输入就生成的需求",
            rules: [createRule()],
        });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({ requirementText: "旧需求" })),
            updateRequirementText: vi.fn(async () => { }),
            startRun,
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                onEvent({ type: "queued" });
                onEvent({ type: "completed", snapshot });
            }),
            getRunSnapshot: vi.fn(async () => snapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(async (savedSnapshot) => ({
                id: savedSnapshot.runId,
                createdAt: new Date().toISOString(),
                title: "test",
                snapshot: savedSnapshot,
                providerModel: "gpt-5.5",
            })),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(repository.updateRequirementText).not.toHaveBeenCalled();
        expect(result.current.hasUncommittedRequirementDraft).toBe(true);
        await act(async () => {
            await generationPromise;
        });
        expect(startRun).toHaveBeenCalledWith(expect.objectContaining({
            requirementText: "刚输入就生成的需求",
            selectedDiagrams: [],
        }));
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
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => ({ runId: snapshot.runId })),
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                onEvent({ type: "completed", snapshot });
            }),
            getRunSnapshot: vi.fn(async () => snapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(async () => { throw new Error("项目保存失败"); }),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(repository.updateRequirementText).not.toHaveBeenCalled();
    });
    it("drives runs through the repository and tracks stale diagrams after rules refresh", async () => {
        const snapshots = new Map([
            [
                "run-rules-1",
                createRunSnapshot({
                    runId: "run-rules-1",
                    requirementText: "订单系统需求",
                    rules: [createRule({ relatedDiagrams: ["usecase", "activity"] })],
                }),
            ],
            [
                "run-diagrams",
                createRunSnapshot({
                    runId: "run-diagrams",
                    requirementText: "订单系统需求",
                    selectedDiagrams: ["usecase", "activity"],
                    rules: [createRule({ relatedDiagrams: ["usecase", "activity"] })],
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
            if (startRunCount === 1)
                return { runId: "run-rules-1" };
            if (startRunCount === 2)
                return { runId: "run-diagrams" };
            return { runId: "run-rules-2" };
        });
        const subscribeToRun = vi.fn(async (runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
            const snapshot = snapshots.get(runId);
            if (!snapshot) {
                throw new Error(`Missing snapshot for ${runId}`);
            }
            onEvent({ type: "queued" });
            onEvent({
                type: "stage_progress",
                stage: snapshot.selectedDiagrams.length > 0
                    ? "render_svg"
                    : "extract_rules",
                progress: snapshot.selectedDiagrams.length > 0 ? 95 : 20,
                message: snapshot.selectedDiagrams.length > 0
                    ? "正在渲染 SVG"
                    : "正在抽取需求规则",
            });
            onEvent({ type: "completed", snapshot });
        });
        const getRunSnapshot = vi.fn(async (runId: string) => {
            const snapshot = snapshots.get(runId);
            if (!snapshot) {
                throw new Error(`Missing snapshot for ${runId}`);
            }
            return snapshot;
        });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
            updateRequirementText: vi.fn(async () => { }),
            startRun,
            subscribeToRun,
            getRunSnapshot,
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(async (snapshot) => ({
                id: snapshot.runId,
                createdAt: new Date().toISOString(),
                title: "test",
                snapshot,
                providerModel: "gpt-5.5",
            })),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
        };
        Object.defineProperty(URL, "createObjectURL", {
            configurable: true,
            value: vi.fn(() => "blob:document-run"),
        });
        Object.defineProperty(URL, "revokeObjectURL", {
            configurable: true,
            value: vi.fn(),
        });
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { });
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
        expect(repository.updateRequirementText).not.toHaveBeenCalled();
        expect(result.current.textVersion).toBe(1);
        await act(async () => {
            await result.current.generateRules();
        });
        expect(startRun).toHaveBeenCalledWith(expect.objectContaining({
            requirementText: "订单系统需求",
            selectedDiagrams: [],
        }));
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
        expect(startRun).toHaveBeenCalledWith(expect.objectContaining({
            requirementText: "订单系统需求",
            selectedDiagrams: ["activity", "usecase"],
        }));
        expect(result.current.generatedDiagrams).toEqual(["activity", "usecase"]);
        expect(result.current.svgArtifacts.usecase?.svg).toContain("<svg>");
        expect(result.current.staleDiagrams).toEqual([]);
        act(() => {
            result.current.setRequirementText("订单系统需求 v2");
        });
        expect(result.current.isRulesStale).toBe(true);
        await act(async () => {
            await result.current.generateRules();
        });
        expect(result.current.rulesVersion).toBe(2);
        expect(result.current.rules[0]?.id).toBe("r2");
        expect(result.current.staleDiagrams).toEqual(["activity", "usecase"]);
    });
    it("keeps completed requirement models stale when input changes while the run is in flight", async () => {
        const rule = createRule({
            id: "r1",
            text: "用户可以查看座位。",
            relatedDiagrams: ["usecase"],
        });
        const startFingerprint = snapshotInputFingerprint({
            requirementText: "座位预约系统 v1",
            rules: [rule],
        });
        const updatedFingerprint = snapshotInputFingerprint({
            requirementText: "座位预约系统 v2",
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
        let emitRunEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1] | null = null;
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "座位预约系统 v1",
                rules: [rule],
                requirementInputFingerprint: startFingerprint,
                rulesVersion: 1,
                rulesBasedOnTextVersion: 0,
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => ({ runId: "run-inflight-usecase" })),
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                emitRunEvent = onEvent;
                await subscription.promise;
            }),
            getRunSnapshot: vi.fn(async () => completedSnapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(repository.updateRequirementText).not.toHaveBeenCalled();
        act(() => {
            emitRunEvent?.({ type: "completed", snapshot: completedSnapshot });
            subscription.resolve();
        });
        await act(async () => {
            await generation;
        });
        expect(result.current.requirementInputFingerprint).toBe(updatedFingerprint);
        expect(result.current.diagramInputFingerprints.usecase).toBe(startFingerprint);
        expect(result.current.staleDiagrams).toEqual(["usecase"]);
        expect(result.current.svgArtifacts.usecase?.svg).toContain("v1");
    });
    it("prunes requirement model traceability when rules-only generation replaces rule ids", async () => {
        const oldRule = createRule({ id: "r1", text: "用户可以提交订单。" });
        const newRule = createRule({ id: "r2", text: "系统必须先校验库存。" });
        const snapshot = createRunSnapshot({
            runId: "run-replace-rules",
            requirementText: "订单系统需求",
            rules: [newRule],
        });
        const updateRequirementRules = vi.fn(async () => { });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
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
            })),
            updateRequirementText: vi.fn(async () => { }),
            updateRequirementRules,
            startRun: vi.fn(async () => ({ runId: "run-replace-rules" })),
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                onEvent({ type: "queued" });
                onEvent({ type: "completed", snapshot });
            }),
            getRunSnapshot: vi.fn(async () => snapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(async (savedSnapshot) => ({
                id: savedSnapshot.runId,
                createdAt: new Date().toISOString(),
                title: "test",
                snapshot: savedSnapshot,
                providerModel: "gpt-5.5",
            })),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(updateRequirementRules).toHaveBeenCalledWith([newRule], expect.objectContaining({
            requirementModelTraceability: [
                expect.objectContaining({
                    ruleId: "r2",
                    target: expect.objectContaining({ elementId: "uc_check_stock" }),
                }),
            ],
        }));
    });
    it("drops only the edited rule's baseline entry when a user edits requirement rules", async () => {
        const rule = createRule({
            id: "r1",
            text: "用户可以提交订单。",
            relatedDiagrams: ["usecase"],
        });
        const requirement = createAtomicRequirement({
            id: "REQ-001",
            sourceRuleId: "r1",
            status: "pending-review",
        });
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
        const updateRequirementRules = vi.fn(async () => { });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "订单系统需求",
                rules: [rule],
                rulesVersion: 1,
                rulesBasedOnTextVersion: 0,
                requirementBaseline: baseline,
                requirementQualityReport: baseline.qualityReport,
                requirementReviewCandidates: {
                    r1: {
                        ruleId: "r1",
                        beforeRequirement: requirement,
                        afterRequirement: null,
                        repairRationale: null,
                        blockingReasons: ["缺少参与者"],
                        status: "failed",
                        errorMessage: "无法自动补齐。",
                        createdAt: "2026-06-21T00:00:00.000Z",
                    },
                },
            })),
            updateRequirementText: vi.fn(async () => { }),
            updateRequirementRules,
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
        };
        const { result } = renderHook(() => useWorkspaceSession(), {
            wrapper: ({ children }) => withWorkspaceProviders(children, repository),
        });
        await waitFor(() => {
            expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
            expect(result.current.workspaceInitialized).toBe(true);
        });
        expect(result.current.requirementBaseline).toEqual(baseline);
        expect(result.current.requirementQualityReport).toEqual(baseline.qualityReport);
        expect(result.current.requirementReviewCandidates.r1).toBeDefined();
        act(() => {
            result.current.updateRequirementRule("r1", {
                text: "用户可以提交订单并接收库存校验结果。",
            });
        });
        expect(result.current.requirementBaseline?.requirements).toEqual([]);
        expect(result.current.requirementQualityReport?.issues).toEqual([]);
        expect(result.current.requirementReviewCandidates).toEqual({});
        expect(updateRequirementRules).toHaveBeenCalledWith([
            expect.objectContaining({
                id: "r1",
                text: "用户可以提交订单并接收库存校验结果。",
            }),
        ], expect.objectContaining({
            requirementBaseline: expect.objectContaining({ requirements: [] }),
            requirementReviewCandidates: {},
            rulesBasedOnTextVersion: 0,
            rulesVersion: 2,
        }));
    });
    it("marks legacy fingerprints stale without upgrading saved models", async () => {
        const rule = createRule({
            id: "r1",
            category: "功能需求",
            text: "用户提交订单。",
            relatedDiagrams: ["usecase"],
        });
        const requirementText = "订单系统需求";
        const legacyFingerprint = JSON.stringify({
            rules: [
                {
                    text: rule.text,
                    relatedDiagrams: rule.relatedDiagrams,
                    category: rule.category,
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
            relationships: [{ "id": "participation:uc_submit", "type": "association", "sourceId": "actor_user", "targetId": "uc_submit" }],
        };
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
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
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(async () => createRunSnapshot()),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
    it("treats persisted selected diagram fields as stale draft state on workspace load", async () => {
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "订单系统需求",
                rules: [createRule({ relatedDiagrams: ["usecase", "class"] })],
                generatedDiagramTypes: ["usecase"],
                selectedDiagramTypes: ["class"],
                generatedDesignDiagramTypes: ["sequence"],
                selectedDesignDiagramTypes: ["table"],
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(async () => createRunSnapshot()),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
    it("treats manual rule edits as current rules while marking existing models stale", async () => {
        const requirementText = "订单系统需求";
        const originalRule = createRule({
            id: "r1",
            category: "功能需求",
            text: "用户提交订单。",
            relatedDiagrams: ["usecase"],
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
            relationships: [{ "id": "participation:uc_submit", "type": "association", "sourceId": "actor_user", "targetId": "uc_submit" }],
        };
        const updateRequirementRules = vi.fn(async () => { });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
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
            })),
            updateRequirementText: vi.fn(async () => { }),
            updateRequirementRules,
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(async () => createRunSnapshot()),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(result.current.requirementInputFingerprint).toBe(editedFingerprint);
        expect(result.current.isRulesStale).toBe(false);
        expect(result.current.staleDiagrams).toEqual(["usecase"]);
        expect(updateRequirementRules).toHaveBeenLastCalledWith(editedRules, expect.objectContaining({
            requirementInputFingerprint: editedFingerprint,
            rulesBasedOnTextVersion: 0,
            rulesVersion: 5,
        }));
    });
    it("keeps restored requirement models fresh when older workspaces lack per-diagram freshness metadata", async () => {
        const rule = createRule({
            id: "r1",
            category: "功能需求",
            text: "用户提交订单。",
            relatedDiagrams: ["usecase"],
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
            relationships: [{ "id": "participation:uc_submit", "type": "association", "sourceId": "actor_user", "targetId": "uc_submit" }],
        };
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
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
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(async () => createRunSnapshot()),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
    it("does not require rule traceability for use-case driven analysis models before design generation", async () => {
        const rule = createRule({
            id: "r1",
            category: "功能需求",
            text: "用户提交订单。",
            relatedDiagrams: ["usecase"],
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
            relationships: [{ "id": "participation:uc_submit", "type": "association", "sourceId": "actor_user", "targetId": "uc_submit" }],
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
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText,
                requirementBaseline: createRequirementBaseline([
                    createAtomicRequirement({ sourceRuleId: "r1" }),
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
                    analysis: activeFingerprint,
                },
                diagramVersions: { usecase: 1, analysis: 1 },
                rulesVersion: 1,
                rulesBasedOnTextVersion: 0,
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(async () => createRunSnapshot()),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
    it("targets missing analysis use cases while preserving existing analysis artifacts", async () => {
        const rule = createRule({
            id: "r1",
            category: "功能需求",
            text: "读者可以借书和检索图书。",
            relatedDiagrams: ["usecase"],
        });
        const requirementText = "图书馆系统需求";
        const activeFingerprint = snapshotInputFingerprint({
            requirementText,
            rules: [rule],
        });
        const baseline = createRequirementBaseline([
            createAtomicRequirement({ sourceRuleId: "r1" }),
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
            relationships: [{ "id": "participation:uc_borrow", "type": "association", "sourceId": "actor_reader", "targetId": "uc_borrow" }, { "id": "participation:uc_search", "type": "association", "sourceId": "actor_reader", "targetId": "uc_search" }],
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
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
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
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun,
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                onEvent({ type: "completed", snapshot: completedSnapshot });
            }),
            getRunSnapshot: vi.fn(async () => completedSnapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(startRunInputs[0]?.contextModels).toEqual(expect.arrayContaining([
            expect.objectContaining({
                diagramKind: "analysis",
                modelId: "analysis:uc_borrow",
            }),
        ]));
        expect(result.current.models["analysis:uc_borrow"]).toEqual(existingAnalysis);
        expect(result.current.models["analysis:uc_search"]).toEqual(generatedAnalysis);
        expect(result.current.plantUml["analysis:uc_borrow"]).toContain("borrow");
        expect(result.current.plantUml["analysis:uc_search"]).toContain("search");
        expect(result.current.svgArtifacts["analysis:uc_borrow"]?.svg).toContain("borrow");
        expect(result.current.svgArtifacts["analysis:uc_search"]?.svg).toContain("search");
    });
    it("keeps separately generated requirement diagrams fresh for design generation", async () => {
        const rule = createRule({
            relatedDiagrams: ["usecase", "class", "activity"],
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
            relationships: [{ "id": "participation:uc_submit", "type": "association", "sourceId": "actor_user", "targetId": "uc_submit" }],
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
            nodes: [{ name: "开始", id: "start", type: "start" }, { input: [], output: [], id: "submit", type: "activity", name: "提交订单" }, { name: "结束", id: "end", type: "end" }],
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
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "订单需求",
                rules: [rule],
                rulesVersion: 1,
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun,
            subscribeToRun: vi.fn(async (runId, onEvent) => {
                const snapshot = snapshots.get(runId);
                if (!snapshot)
                    throw new Error(`Missing ${runId}`);
                onEvent({ type: "completed", snapshot });
            }),
            getRunSnapshot: vi.fn(async (runId) => {
                const snapshot = snapshots.get(runId);
                if (!snapshot)
                    throw new Error(`Missing ${runId}`);
                return snapshot;
            }),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(async (snapshot) => ({
                id: snapshot.runId,
                createdAt: new Date().toISOString(),
                title: "test",
                snapshot,
                providerModel: "gpt-5.5",
            })),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
    it("summarizes preserved requirement models by model kind before supplement generation", async () => {
        const rule = createRule({
            id: "r1",
            category: "功能需求",
            text: "用户可以登记、认领和处理失物招领。管理员可以审核状态流转。",
            relatedDiagrams: [
                "usecase",
                "class",
                "activity",
                "deployment",
                "prototype",
                "analysis",
            ],
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
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
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
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => ({ runId: "run-activity" })),
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                onEvent({ type: "completed", snapshot });
            }),
            getRunSnapshot: vi.fn(async () => snapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(screen.queryByRole("dialog", { name: "确认生成" })).not.toBeInTheDocument();
        await act(async () => {
            await generation;
        });
    });
    it("auto-completes missing rule mappings without replacing rules or repairing review candidates", async () => {
        const existingRule = createRule({
            id: "fr1",
            category: "业务规则",
            text: "FR1. 此日历仅供公众使用，而非个人日历。",
            relatedDiagrams: ["usecase"],
        });
        const mappedRule: typeof existingRule = {
            ...existingRule,
            relatedDiagrams: ["usecase", "class"],
        };
        const ruleSnapshot = createRunSnapshot({
            runId: "run-rules",
            requirementText: "公开日历需求",
            rules: [mappedRule],
        });
        const classSnapshot = createRunSnapshot({
            runId: "run-class",
            requirementText: "公开日历需求",
            selectedDiagrams: ["class"],
            rules: [mappedRule],
            models: [
                {
                    diagramKind: "class",
                    title: "领域概念模型",
                    summary: "日历活动领域对象。",
                    notes: [],
                    classes: [],
                    interfaces: [],
                    enums: [],
                    relationships: [],
                },
            ],
        });
        let startRunCount = 0;
        const startRun = vi.fn(async () => {
            startRunCount += 1;
            return { runId: startRunCount === 1 ? "run-rules" : "run-class" };
        });
        const updateRequirementRules = vi.fn(async () => { });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "公开日历需求",
                rules: [existingRule],
                rulesVersion: 1,
            })),
            updateRequirementText: vi.fn(async () => { }),
            updateRequirementRules,
            startRun,
            subscribeToRun: vi.fn(async (runId, onEvent) => {
                onEvent({
                    type: "completed",
                    snapshot: runId === "run-rules" ? ruleSnapshot : classSnapshot,
                });
            }),
            getRunSnapshot: vi.fn(async (runId) => runId === "run-rules" ? ruleSnapshot : classSnapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
            generation = result.current.generateDiagrams(["class"]);
        });
        const confirmation = await screen.findByRole("dialog", {
            name: "确认生成需求模型",
        });
        expect(within(confirmation).getByText("需求规则映射补齐：领域概念模型")).toBeInTheDocument();
        await user.click(within(confirmation).getByRole("button", { name: "确认生成" }));
        await act(async () => {
            await generation;
        });
        expect({
            errorMessage: result.current.errorMessage,
            startRunCalls: startRun.mock.calls.length,
            task: result.current.visibleGenerationTask,
        }).toEqual(expect.objectContaining({
            errorMessage: null,
            startRunCalls: 2,
        }));
        expect(updateRequirementRules).toHaveBeenCalledWith([mappedRule], expect.objectContaining({
            requirementInputFingerprint: snapshotInputFingerprint({
                requirementText: "公开日历需求",
                rules: [mappedRule],
            }),
            rulesBasedOnTextVersion: 0,
            rulesVersion: 2,
        }));
        expect(result.current.rules).toEqual([mappedRule]);
        expect(result.current.rules[0]?.text).toBe(existingRule.text);
        expect(result.current.requirementBaseline).toBeNull();
        expect(result.current.requirementReviewCandidates).toEqual({});
    });
    it("blocks downstream requirement generation when auto-completed rule mappings cannot be saved", async () => {
        const existingRule = createRule({
            id: "fr1",
            category: "业务规则",
            text: "FR1. 此日历仅供公众使用，而非个人日历。",
            relatedDiagrams: ["usecase"],
        });
        const mappedRule: typeof existingRule = {
            ...existingRule,
            relatedDiagrams: ["usecase", "class"],
        };
        const ruleSnapshot = createRunSnapshot({
            runId: "run-rules",
            requirementText: "公开日历需求",
            rules: [mappedRule],
            requirementBaseline: createRequirementBaseline([
                createAtomicRequirement({ id: "REQ-FR1", sourceRuleId: "fr1" }),
            ]),
        });
        const startRun = vi.fn(async () => ({ runId: "run-rules" }));
        const updateRequirementRules = vi.fn(async () => {
            throw new Error("保存项目工作台失败");
        });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "公开日历需求",
                rules: [existingRule],
                rulesVersion: 1,
            })),
            updateRequirementText: vi.fn(async () => { }),
            updateRequirementRules,
            startRun,
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                onEvent({ type: "completed", snapshot: ruleSnapshot });
            }),
            getRunSnapshot: vi.fn(async () => ruleSnapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
            generation = result.current.generateDiagrams(["class"]);
        });
        await user.click(await screen.findByRole("button", { name: "确认生成" }));
        await act(async () => {
            await generation;
        });
        expect(startRun).toHaveBeenCalledTimes(1);
        expect(updateRequirementRules).toHaveBeenCalledWith([mappedRule], expect.objectContaining({
            requirementInputFingerprint: snapshotInputFingerprint({
                requirementText: "公开日历需求",
                rules: [mappedRule],
            }),
            rulesBasedOnTextVersion: 0,
            rulesVersion: 2,
        }));
        expect(result.current.rules).toEqual([existingRule]);
        expect(result.current.runStatus).toBe("failed");
        expect(result.current.errorMessage).toContain("需求复核结果未能保存");
        expect(result.current.visibleGenerationTask).toEqual(expect.objectContaining({
            runId: null,
            status: "failed",
            errorMessage: expect.stringContaining("需求复核结果未能保存"),
        }));
        expect(result.current.visibleGenerationTask?.subtasks).toContainEqual(expect.objectContaining({
            id: "persist_rule_mappings",
            status: "failed",
            errorMessage: expect.stringContaining("需求复核结果未能保存"),
        }));
        const failedDialog = await screen.findByRole("dialog", {
            name: "暂时无法开始生成",
        });
        expect(failedDialog).toHaveTextContent("需求复核结果未能保存");
    });
    it("blocks downstream design generation when auto-completed rule mappings cannot be saved", async () => {
        const existingRule = createRule({
            id: "fr1",
            category: "功能需求",
            text: "用户可以查看公开活动日历。",
            relatedDiagrams: ["usecase"],
        });
        const mappedRule: typeof existingRule = {
            ...existingRule,
            relatedDiagrams: ["usecase", "class"],
        };
        const usecaseModel: DiagramModelSpec = {
            diagramKind: "usecase",
            title: "用例模型",
            summary: "公开活动浏览。",
            notes: [],
            actors: [
                {
                    id: "actor_user",
                    name: "用户",
                    actorType: "human",
                    responsibilities: ["查看活动"],
                },
            ],
            useCases: [
                {
                    eventFlows: [], systemBoundaryId: "system",
                    id: "uc_view",
                    name: "查看活动",
                    goal: "查看公开活动日历",
                    preconditions: [],
                    postconditions: [],
                    primaryActorId: "actor_user",
                    supportingActorIds: [],
                },
            ],
            systemBoundaries: [{ id: "system", name: "活动系统" }],
            relationships: [{ "id": "participation:uc_view", "type": "association", "sourceId": "actor_user", "targetId": "uc_view" }],
        };
        const ruleSnapshot = createRunSnapshot({
            runId: "run-rules",
            requirementText: "公开日历需求",
            rules: [mappedRule],
            requirementBaseline: createRequirementBaseline([
                createAtomicRequirement({ id: "REQ-FR1", sourceRuleId: "fr1" }),
            ]),
        });
        const startRun = vi.fn(async () => ({ runId: "run-rules" }));
        const startDesignRun = vi.fn(async () => ({ runId: "design-run" }));
        const updateRequirementRules = vi.fn(async () => {
            throw new Error("保存项目工作台失败");
        });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "公开日历需求",
                requirementBaseline: createRequirementBaseline([
                    createAtomicRequirement({ id: "REQ-FR1", sourceRuleId: "fr1" }),
                ]),
                rules: [existingRule],
                rulesVersion: 1,
                diagramVersions: { usecase: 1 },
                generatedDiagramTypes: ["usecase"],
                models: { usecase: usecaseModel },
            })),
            updateRequirementText: vi.fn(async () => { }),
            updateRequirementRules,
            startRun,
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                onEvent({ type: "completed", snapshot: ruleSnapshot });
            }),
            getRunSnapshot: vi.fn(async () => ruleSnapshot),
            startDesignRun,
            subscribeToDesignRun: vi.fn(),
            getDesignRunSnapshot: vi.fn(),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        await user.click(within(confirmation).getByRole("button", { name: "确认生成" }));
        await act(async () => {
            await generation;
        });
        expect(startRun).toHaveBeenCalledTimes(1);
        expect(startDesignRun).not.toHaveBeenCalled();
        expect(updateRequirementRules).toHaveBeenCalledWith([mappedRule], expect.objectContaining({
            requirementInputFingerprint: snapshotInputFingerprint({
                requirementText: "公开日历需求",
                rules: [mappedRule],
            }),
            rulesVersion: 2,
        }));
        expect(result.current.runStatus).toBe("failed");
        expect(result.current.errorMessage).toContain("需求复核结果未能保存");
        expect(result.current.visibleGenerationTask).toEqual(expect.objectContaining({
            kind: "design",
            runId: null,
            status: "failed",
        }));
    });
    it("falls back to local rule mapping when the auto-complete run returns no target mapping", async () => {
        const existingRule = createRule({
            id: "fr1",
            category: "功能需求",
            text: "用户可以浏览和搜索公开活动页面。",
            relatedDiagrams: ["usecase"],
        });
        const dataRule = createRule({
            id: "dr1",
            category: "数据需求",
            text: "活动包含标题、地点、容量和报名截止时间。",
            relatedDiagrams: ["class"],
        });
        const ruleSnapshot = createRunSnapshot({
            runId: "run-rules",
            requirementText: "公开日历需求",
            rules: [
                createRule({
                    id: "generated-1",
                    text: "系统支持活动浏览。",
                    relatedDiagrams: ["usecase"],
                }),
            ],
            requirementBaseline: createRequirementBaseline([
                createAtomicRequirement(),
            ]),
        });
        const prototypeModel: DiagramModelSpec = {
            diagramKind: "prototype",
            title: "原型界面关系",
            summary: "活动浏览与搜索页面关系。",
            notes: [],
            nodes: [
                {
                    id: "screen-events",
                    name: "活动列表",
                    nodeType: "screen",
                    route: "/events",
                    sourceUseCaseIds: [],
                    sourceRequirementIds: ["fr1"],
                },
            ],
            relationships: [],
        };
        const prototypeSnapshot = createRunSnapshot({
            runId: "run-prototype",
            requirementText: "公开日历需求",
            selectedDiagrams: ["prototype"],
            rules: [
                { ...existingRule, relatedDiagrams: ["usecase", "prototype"] },
                dataRule,
            ],
            models: [prototypeModel],
        });
        let startRunCount = 0;
        const startRunInputs: StartRunInput[] = [];
        const startRun = vi.fn(async (input: StartRunInput) => {
            startRunInputs.push(input);
            startRunCount += 1;
            return { runId: startRunCount === 1 ? "run-rules" : "run-prototype" };
        });
        const updateRequirementRules = vi.fn(async () => { });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "公开日历需求",
                rules: [existingRule, dataRule],
                rulesVersion: 1,
            })),
            updateRequirementText: vi.fn(async () => { }),
            updateRequirementRules,
            startRun,
            subscribeToRun: vi.fn(async (runId, onEvent) => {
                onEvent({
                    type: "completed",
                    snapshot: runId === "run-rules" ? ruleSnapshot : prototypeSnapshot,
                });
            }),
            getRunSnapshot: vi.fn(async (runId) => runId === "run-rules" ? ruleSnapshot : prototypeSnapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
            generation = result.current.generateDiagrams(["prototype"]);
        });
        await user.click(await screen.findByRole("button", { name: "确认生成" }));
        await act(async () => {
            await generation;
        });
        expect(startRun).toHaveBeenCalledTimes(2);
        const modelRunInput = startRunInputs[1];
        expect(modelRunInput).toBeDefined();
        if (!modelRunInput)
            throw new Error("Expected prototype model run input");
        expect(modelRunInput.selectedDiagrams).toEqual(["prototype"]);
        expect(modelRunInput.rules.find((rule) => rule.id === "fr1")?.relatedDiagrams).toEqual(["usecase", "prototype"]);
        expect(modelRunInput.rules.find((rule) => rule.id === "dr1")?.relatedDiagrams).toEqual(["class"]);
        expect(updateRequirementRules).toHaveBeenCalledWith([
            expect.objectContaining({
                id: "fr1",
                relatedDiagrams: ["usecase", "prototype"],
            }),
            expect.objectContaining({
                id: "dr1",
                relatedDiagrams: ["class"],
            }),
        ], expect.objectContaining({
            requirementInputFingerprint: expect.stringMatching(/^fp:v3:/),
            rulesBasedOnTextVersion: 0,
            rulesVersion: 2,
        }));
    });
    it("does not apply failed requirement snapshots as generated models", async () => {
        const rule = createRule({
            id: "r1",
            text: "用户可以浏览活动页面。",
            relatedDiagrams: ["prototype"],
        });
        const failedSnapshot = createRunSnapshot({
            runId: "run-prototype-failed",
            requirementText: "公开日历需求",
            selectedDiagrams: ["prototype"],
            rules: [rule],
            diagramErrors: {
                prototype: {
                    stage: "generate_models",
                    error: {
                        code: "RUN_DEPENDENCY_MISSING",
                        message: "原型界面关系生成失败",
                        category: "generation",
                        retryable: false,
                    },
                },
            },
            currentStage: "generate_models",
            status: "failed",
            error: {
                code: "RUN_DEPENDENCY_MISSING",
                message: "原型界面关系生成失败",
                category: "generation",
                retryable: false,
            },
        });
        const saveRunHistory = vi.fn();
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "公开日历需求",
                rules: [rule],
                rulesVersion: 1,
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => ({ runId: "run-prototype-failed" })),
            subscribeToRun: vi.fn(async () => {
                throw new Error("原型界面关系生成失败");
            }),
            getRunSnapshot: vi.fn(async () => failedSnapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory,
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
            generation = result.current.generateDiagrams(["prototype"]);
        });
        await user.click(await screen.findByRole("button", { name: "确认生成" }));
        await act(async () => {
            await generation;
        });
        expect(result.current.generatedDiagrams).not.toContain("prototype");
        expect(result.current.models.prototype).toBeUndefined();
        expect(saveRunHistory).not.toHaveBeenCalled();
        expect(await screen.findByRole("dialog", { name: "任务遇到内部错误" })).toBeInTheDocument();
    });
    it("labels completed requirement snapshots with diagram errors as partially generated", async () => {
        const activityRule = createRule({
            id: "r-activity",
            text: "系统在活动开始前发送提醒。",
            relatedDiagrams: ["activity"],
        });
        const deploymentRule = createRule({
            id: "r-deployment",
            text: "系统记录关键操作审计日志。",
            relatedDiagrams: ["deployment"],
        });
        const partialSnapshot = createRunSnapshot({
            runId: "run-partial-requirements",
            requirementText: "活动日历需求",
            selectedDiagrams: ["activity", "deployment"],
            rules: [activityRule, deploymentRule],
            models: [
                {
                    diagramKind: "deployment",
                    title: "部署需求模型",
                    summary: "审计日志部署约束。",
                    notes: [],
                    nodes: [],
                    databases: [],
                    components: [],
                    externalSystems: [],
                    artifacts: [],
                    relationships: [],
                },
            ] as never,
            plantUml: [{ diagramKind: "deployment", source: "@startuml\n@enduml" }],
            svgArtifacts: [
                {
                    diagramKind: "deployment",
                    svg: "<svg><text>deployment</text></svg>",
                    renderMeta: createRenderMeta({ generatedAt: "2026-06-08T00:00:00.000Z" }),
                },
            ],
            diagramErrors: {
                activity: {
                    stage: "generate_models",
                    error: {
                        code: "PLATFORM_PROVIDER_TIMEOUT",
                        message: "当前模型服务响应超时，请稍后重试。",
                        category: "platform_provider",
                        retryable: true,
                    },
                },
            },
            currentStage: "render_svg",
            status: "completed",
            error: null,
        });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "活动日历需求",
                rules: [activityRule, deploymentRule],
                rulesVersion: 1,
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => ({ runId: "run-partial-requirements" })),
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                onEvent({ type: "completed", snapshot: partialSnapshot });
            }),
            getRunSnapshot: vi.fn(async () => partialSnapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
            generation = result.current.generateDiagrams(["activity", "deployment"]);
        });
        await user.click(await screen.findByRole("button", { name: "确认生成" }));
        await act(async () => {
            await generation;
        });
        const dialog = await screen.findByRole("dialog", {
            name: "需求模型部分生成",
        });
        expect(dialog).toHaveTextContent("有 1 个模型生成失败");
        expect(screen.queryByRole("dialog", { name: "需求模型已生成" })).not.toBeInTheDocument();
    });
    it("applies partial requirement artifacts and records history for cancelled snapshots", async () => {
        const activityRule = createRule({
            id: "r-activity",
            text: "系统在活动开始前发送提醒。",
            relatedDiagrams: ["activity"],
        });
        const deploymentRule = createRule({
            id: "r-deployment",
            text: "系统记录关键操作审计日志。",
            relatedDiagrams: ["deployment"],
        });
        const cancelledSnapshot = createRunSnapshot({
            runId: "run-cancelled-requirements",
            requirementText: "活动日历需求",
            selectedDiagrams: ["activity", "deployment"],
            rules: [activityRule, deploymentRule],
            models: [
                {
                    diagramKind: "deployment",
                    title: "部署需求模型",
                    summary: "审计日志部署约束。",
                    notes: [],
                    nodes: [],
                    databases: [],
                    components: [],
                    externalSystems: [],
                    artifacts: [],
                    relationships: [],
                },
            ] as never,
            plantUml: [{ diagramKind: "deployment", source: "@startuml\n@enduml" }],
            svgArtifacts: [
                {
                    diagramKind: "deployment",
                    svg: "<svg><text>deployment</text></svg>",
                    renderMeta: createRenderMeta({ generatedAt: "2026-06-08T00:00:00.000Z" }),
                },
            ],
            diagramErrors: {
                activity: {
                    stage: "generate_models",
                    error: {
                        code: "PLATFORM_PROVIDER_TIMEOUT",
                        message: "当前模型服务响应超时，请稍后重试。",
                        category: "platform_provider",
                        retryable: true,
                    },
                },
            },
            currentStage: "generate_models",
            status: "cancelled",
            error: null,
        });
        let historyItems: RunHistoryItem[] = [];
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "活动日历需求",
                rules: [activityRule, deploymentRule],
                rulesVersion: 1,
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => ({ runId: "run-cancelled-requirements" })),
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                onEvent({
                    type: "cancelled",
                    stage: "generate_models",
                    message: "任务已取消",
                });
            }),
            getRunSnapshot: vi.fn(async () => cancelledSnapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(async (snapshot) => {
                const item: RunHistoryItem = {
                    id: snapshot.runId,
                    createdAt: "2026-06-20T00:00:00.000Z",
                    title: "已取消的需求模型生成",
                    snapshot,
                    providerModel: "local-test",
                    status: snapshot.status,
                };
                historyItems = [item];
                return item;
            }),
            listRunHistory: vi.fn(async () => historyItems),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
            generation = result.current.generateDiagrams(["activity", "deployment"]);
        });
        await user.click(await screen.findByRole("button", { name: "确认生成" }));
        await act(async () => {
            await generation;
        });
        expect(result.current.runStatus).toBe("cancelled");
        expect(result.current.generatedDiagrams).toEqual(["deployment"]);
        expect(result.current.models.deployment?.diagramKind).toBe("deployment");
        expect(result.current.diagramErrors.activity?.error.message).toBe("当前模型服务响应超时，请稍后重试。");
        expect(repository.saveRunHistory).toHaveBeenCalledWith(cancelledSnapshot, expect.any(Object));
        expect(result.current.historyItems).toHaveLength(1);
        expect(result.current.historyItems[0]?.status).toBe("cancelled");
        expect(await screen.findByRole("dialog", { name: "任务已取消" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "生成失败" })).not.toBeInTheDocument();
    });
    it("completes rules generation without a repair phase and never blocks downstream generation", async () => {
        const rule = createRule({
            id: "r1",
            text: "系统应允许用户提交订单。",
            relatedDiagrams: ["usecase"],
        });
        const beforeRequirement = createAtomicRequirement({
            id: "REQ-001",
            sourceRuleId: "r1",
            actor: null,
            confidence: 0.52,
            status: "pending-review",
            fieldProvenance: {
                actor: {
                    source: "ai-suggested",
                    status: "pending-review",
                    value: null,
                    rationale: "原文缺少明确参与者。",
                },
            },
        });
        const baseline = createRequirementBaseline([beforeRequirement], {
            qualityReport: {
                runId: "run-rules",
                status: "pending-review",
                summary: "存在待确认字段。",
                issues: [
                    {
                        id: "issue-actor",
                        requirementId: "REQ-001",
                        severity: "warning",
                        code: "missing-actor",
                        message: "缺少参与者。",
                        blocksDownstream: true,
                    },
                ],
                blockingIssueIds: ["issue-actor"],
                reviewRequiredRequirementIds: ["REQ-001"],
            },
        });
        const ruleSnapshot = createRunSnapshot({
            runId: "run-rules",
            requirementText: "订单需求",
            rules: [rule],
            requirementBaseline: baseline,
        });
        const diagramSnapshot = createRunSnapshot({
            runId: "run-usecase",
            requirementText: "订单需求",
            selectedDiagrams: ["usecase"],
            rules: [rule],
            models: [
                {
                    diagramKind: "usecase",
                    title: "用例模型",
                    summary: "用户提交订单。",
                    notes: [],
                    actors: [],
                    useCases: [],
                    systemBoundaries: [],
                    relationships: [],
                },
            ],
        });
        let startRunCount = 0;
        const startRun = vi.fn(async () => {
            startRunCount += 1;
            return { runId: startRunCount === 1 ? "run-rules" : "run-usecase" };
        });
        const snapshots = new Map([
            ["run-rules", ruleSnapshot],
            ["run-usecase", diagramSnapshot],
        ]);
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({ requirementText: "订单需求" })),
            updateRequirementText: vi.fn(async () => { }),
            startRun,
            subscribeToRun: vi.fn(async (runId, onEvent) => {
                const snapshot = snapshots.get(runId);
                if (!snapshot)
                    throw new Error(`Missing ${runId}`);
                onEvent({ type: "completed", snapshot });
            }),
            getRunSnapshot: vi.fn(async (runId) => {
                const snapshot = snapshots.get(runId);
                if (!snapshot)
                    throw new Error(`Missing ${runId}`);
                return snapshot;
            }),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(async (snapshot) => ({
                id: snapshot.runId,
                createdAt: "2026-05-27T00:00:00.000Z",
                title: "test",
                snapshot,
                providerModel: "gpt-5.5",
            })),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
        };
        const { result } = renderHook(() => useWorkspaceSession(), {
            wrapper: ({ children }) => withWorkspaceProviders(children, repository),
        });
        const user = userEvent.setup();
        await waitFor(() => {
            expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
            expect(result.current.workspaceInitialized).toBe(true);
        });
        await act(async () => {
            await result.current.generateRules();
        });
        // Extracted rules count as generated: no repair request, no repair subtask, no review gate.
        expect(result.current.visibleGenerationTask?.subtasks.some((subtask) => subtask.label === "修复需求规则")).toBe(false);
        const completionDialog = await screen.findByRole("dialog", {
            name: "需求规则已生成",
        });
        await user.click(within(completionDialog).getByRole("button", { name: "我知道了" }));
        startRun.mockClear();
        let allowedGeneration: Promise<void> | null = null;
        act(() => {
            allowedGeneration = result.current.generateDiagrams(["usecase"]);
        });
        await user.click(await screen.findByRole("button", { name: "确认生成" }));
        await act(async () => {
            await allowedGeneration;
        });
        expect(startRun).toHaveBeenCalledTimes(1);
        expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ selectedDiagrams: ["usecase"] }));
    });
    it("does not block diagram generation for non-blocking requirement quality hints", async () => {
        const rule = createRule({
            id: "r1",
            text: "系统应允许用户提交订单。",
            relatedDiagrams: ["usecase"],
        });
        const requirement = createAtomicRequirement({
            id: "REQ-001",
            sourceRuleId: "r1",
            status: "accepted",
        });
        const baseline = createRequirementBaseline([requirement], {
            qualityReport: {
                runId: "run-rules",
                status: "pending-review",
                summary: "发现非阻断质量提示，可继续生成。",
                issues: [
                    {
                        id: "issue-hint",
                        requirementId: "REQ-001",
                        severity: "warning",
                        code: "non-verifiable",
                        message: "包含非阻断质量提示。",
                        blocksDownstream: false,
                    },
                ],
                blockingIssueIds: [],
                reviewRequiredRequirementIds: [],
            },
        });
        const diagramSnapshot = createRunSnapshot({
            runId: "run-usecase",
            requirementText: "订单需求",
            selectedDiagrams: ["usecase"],
            rules: [rule],
            requirementBaseline: baseline,
            models: [
                {
                    diagramKind: "usecase",
                    title: "用例模型",
                    summary: "用户提交订单。",
                    notes: [],
                    actors: [],
                    useCases: [],
                    systemBoundaries: [],
                    relationships: [],
                },
            ],
        });
        const startRun = vi.fn(async () => ({ runId: "run-usecase" }));
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "订单需求",
                rules: [rule],
                requirementBaseline: baseline,
                requirementQualityReport: baseline.qualityReport,
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun,
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                onEvent({ type: "completed", snapshot: diagramSnapshot });
            }),
            getRunSnapshot: vi.fn(async () => diagramSnapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(async (snapshot) => ({
                id: snapshot.runId,
                createdAt: "2026-05-27T00:00:00.000Z",
                title: "test",
                snapshot,
                providerModel: "gpt-5.5",
            })),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
        };
        const { result } = renderHook(() => useWorkspaceSession(), {
            wrapper: ({ children }) => withWorkspaceProviders(children, repository),
        });
        const user = userEvent.setup();
        await waitFor(() => {
            expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
            expect(result.current.workspaceInitialized).toBe(true);
        });
        expect(result.current.designGenerationBlockedReason).toBeNull();
        let generation: Promise<void> | null = null;
        act(() => {
            generation = result.current.generateDiagrams(["usecase"]);
        });
        await user.click(await screen.findByRole("button", { name: "确认生成" }));
        await act(async () => {
            await generation;
        });
        expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ selectedDiagrams: ["usecase"] }));
    });
    it("blocks design generation when existing sequence diagrams do not cover current use cases", async () => {
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
            relationships: [{ "id": "participation:uc_view", "type": "association", "sourceId": "actor_user", "targetId": "uc_view" }, { "id": "participation:uc_submit", "type": "association", "sourceId": "actor_user", "targetId": "uc_submit" }],
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
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "订单需求",
                requirementBaseline: createRequirementBaseline([
                    createAtomicRequirement(),
                ]),
                rules: [createRule({ relatedDiagrams: ["usecase", "class"] })],
                rulesVersion: 1,
                diagramVersions: { usecase: 1, class: 1 },
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
            })),
            updateRequirementText: vi.fn(async () => { }),
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
            clearRunHistory: vi.fn(async () => { }),
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
        const blockedDialog = await screen.findByRole("dialog", {
            name: "设计依赖需更新",
        });
        expect(within(blockedDialog).getByText("已有用例实现设计覆盖不足，请先手动更新用例实现设计")).toBeInTheDocument();
        await user.click(within(blockedDialog).getByRole("button", { name: "我知道了" }));
        await act(async () => {
            await generation;
        });
        expect(startDesignRun).not.toHaveBeenCalled();
    });
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
        const saveRequirementModelEdit = vi.fn(async () => { });
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
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
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
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(),
            renderPlantUml: vi.fn(),
            renderStructuredModel,
            saveRequirementModelEdit,
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
            await result.current.saveRequirementModelEdit("usecase", editedUseCaseModel);
        });
        expect((result.current.models.usecase as UseCaseDiagramSpec | undefined)
            ?.actors[0]?.name).toBe("授课教师");
        expect(saveRequirementModelEdit).toHaveBeenCalledWith("usecase", editedUseCaseModel, expect.objectContaining({ status: "dirty" }), {
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
        });
        expect(result.current.manualModelEditStatus.usecase?.status).toBe("dirty");
        expect(result.current.manualModelEditStatus.usecase?.warning).toMatch(/可能与前置需求映射不一致/);
        expect(result.current.requirementTraceabilityStale).toBe(true);
        expect(result.current.designGenerationBlockedReason).toBeNull();
        await act(async () => {
            await result.current.rerenderRequirementModel("usecase");
        });
        expect(renderStructuredModel).toHaveBeenCalledWith(editedUseCaseModel, "requirements");
        expect(result.current.plantUml.usecase).toContain("授课教师");
        expect(result.current.svgArtifacts.usecase?.svg).toContain("授课教师");
        expect(result.current.manualModelEditStatus.usecase?.status).toBe("rerendered");
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
        const saveRequirementModelEdit = vi.fn(async () => { });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
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
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(),
            renderPlantUml: vi.fn(),
            saveRequirementModelEdit,
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(saveRequirementModelEdit).toHaveBeenCalledWith("class", editedClassModel, expect.objectContaining({ status: "dirty" }), {
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
        });
    });
    it("keeps only the tail of long streamed LLM diagnostics in memory", async () => {
        const longPrefix = "a".repeat(30010);
        const snapshot = createRunSnapshot({
            runId: "run-long-stream",
            requirementText: "订单系统需求",
            rules: [createRule()],
        });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => ({ runId: "run-long-stream" })),
            subscribeToRun: vi.fn(async (_runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
                onEvent({ type: "queued" });
                onEvent({
                    type: "llm_chunk",
                    stage: "extract_rules",
                    chunk: longPrefix,
                });
                onEvent({ type: "llm_chunk", stage: "extract_rules", chunk: "TAIL" });
                onEvent({ type: "completed", snapshot });
            }),
            getRunSnapshot: vi.fn(async () => snapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
        };
        const { result } = renderHook(() => useWorkspaceSession(), {
            wrapper: ({ children }) => withWorkspaceProviders(children, repository),
        });
        await waitFor(() => {
            expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
            expect(result.current.workspaceInitialized).toBe(true);
        });
        act(() => {
            result.current.setRequirementText("订单系统需求");
        });
        await act(async () => {
            await result.current.generateRules();
        });
        expect(result.current.currentRunDiagnostics.streamText).toHaveLength(30000);
        expect(result.current.currentRunDiagnostics.streamText.endsWith("TAIL")).toBe(true);
        expect(result.current.currentRunDiagnostics.chunkCount).toBe(2);
    });
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
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
                    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    byteLength: 8,
                    missingArtifacts: [],
                    currentStage: "render_document_file",
                    status: "completed",
                    error: null,
                }),
            ],
        ]);
        const subscribers = new Map<string, {
            onEvent: Parameters<NonNullable<WorkspaceRepository["subscribeToDocumentRun"]>>[1];
            resolve: () => void;
        }>();
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "订单系统需求",
                models: { usecase: requirementModel },
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
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(),
            startDocumentRun: vi.fn(async (input) => ({
                runId: input.documentKind === "requirementsSpec" ? "doc-req" : "doc-design",
            })),
            subscribeToDocumentRun: vi.fn(async (runId, onEvent) => new Promise<void>((resolve) => {
                subscribers.set(runId, { onEvent, resolve });
            })),
            getDocumentRunSnapshot: vi.fn(async (runId) => snapshots.get(runId)!),
            downloadDocumentRun: vi.fn(async (runId, defaultFileName) => ({
                blob: new Blob(["docx"]),
                fileName: defaultFileName ?? snapshots.get(runId)?.fileName ?? "说明书.docx",
            })),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(async (snapshot) => ({
                id: snapshot.runId,
                createdAt: new Date().toISOString(),
                title: "document",
                snapshot,
                providerModel: "gpt-5.5",
            })),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(result.current.generationTasks.some((task) => task.status === "queued")).toBe(true);
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
        expect(repository.downloadDocumentRun).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(result.current.generationTasks).toHaveLength(2);
            expect(result.current.generationTasks.every((task) => task.status === "completed")).toBe(true);
        });
        expect(repository.saveRunHistory).toHaveBeenCalledTimes(2);
        expect(result.current.currentRunDiagnostics.runId).toBe("doc-design");
        expect(result.current.runMessage).toBe("说明书生成完成");
        const successDialog = await screen.findByRole("dialog", {
            name: "说明书已生成",
        });
        expect(within(successDialog).getByText("软件设计说明书已生成。")).toBeInTheDocument();
        expect(within(successDialog).queryByText("需求规格说明书已生成。")).not.toBeInTheDocument();
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
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            byteLength: 8,
            missingArtifacts: ["用例图：缺少可嵌入图片源"],
            currentStage: "render_document_file",
            status: "completed",
            error: null,
        });
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "订单系统需求",
                models: { usecase: requirementModel },
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(),
            startDocumentRun: vi.fn(async () => ({ runId: "doc-warning" })),
            subscribeToDocumentRun: vi.fn(async (_runId, onEvent) => {
                onEvent({ type: "queued" });
                onEvent({ type: "completed", snapshot });
            }),
            getDocumentRunSnapshot: vi.fn(async () => snapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(async (savedSnapshot) => ({
                id: savedSnapshot.runId,
                createdAt: new Date().toISOString(),
                title: "document",
                snapshot: savedSnapshot,
                providerModel: "gpt-5.5",
            })),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(result.current.runMessage).toBe("说明书生成完成，但有 1 项图源缺失，请复核");
        expect(result.current.generationTasks[0]?.message).toBe("说明书生成完成，但有 1 项图源缺失，请复核");
        expect(repository.saveRunHistory).toHaveBeenCalledWith(expect.objectContaining({
            missingArtifacts: ["用例图：缺少可嵌入图片源"],
        }), expect.any(Object));
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
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            byteLength: 8,
            missingArtifacts: [],
            currentStage: "render_document_file",
            status: "completed",
            error: null,
        });
        const subscription = deferred<void>();
        let onDocumentEvent: Parameters<NonNullable<WorkspaceRepository["subscribeToDocumentRun"]>>[1] | null = null;
        const repository: WorkspaceRepository = {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "订单系统需求",
                models: { usecase: requirementModel },
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(),
            startDocumentRun: vi.fn(async () => ({ runId: "doc-stale" })),
            subscribeToDocumentRun: vi.fn(async (_runId, onEvent) => {
                onDocumentEvent = onEvent;
                return subscription.promise;
            }),
            getDocumentRunSnapshot: vi.fn(async () => snapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(async (savedSnapshot) => ({
                id: savedSnapshot.runId,
                createdAt: new Date().toISOString(),
                title: "document",
                snapshot: savedSnapshot,
                providerModel: "gpt-5.5",
            })),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(toastMessage).toHaveBeenCalledWith("结果基于生成开始时的内容，期间修改不会自动合并到本次结果");
        expect(repository.saveRunHistory).toHaveBeenCalledWith(expect.objectContaining({ runId: "doc-stale" }), expect.any(Object));
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
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "订单系统需求",
                rules: [createRule()],
                models: { usecase: usecaseModel },
                designModels: { "sequence:uc_view": sequenceModel },
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(),
            startDocumentRun,
            subscribeToDocumentRun: vi.fn(),
            getDocumentRunSnapshot: vi.fn(),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(result.current.errorMessage).toBe("有 1 项设计模型依赖无效，请先更新设计模型。");
        expect(await screen.findByRole("dialog", { name: "暂时无法开始生成" })).toBeInTheDocument();
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
            relationships: [{ "id": "participation:uc_borrow", "type": "association", "sourceId": "actor_librarian", "targetId": "uc_borrow" }],
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
                    relationalConstraints: [{ "id": "pk_test", "type": "primary-key", "columnIds": ["id"] }],
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
                    relatedDiagrams: ["usecase"],
                }),
                createRule({
                    id: "r2",
                    text: "系统需要记录图书。",
                    relatedDiagrams: ["class"],
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
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "图书馆管理系统",
                rules: snapshot.rules,
                requirementBaseline: createRequirementBaseline([
                    createAtomicRequirement(),
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
                    "class:design-class-diagram": designInputFingerprint([usecaseModel, classRequirementModel], snapshot.requirementModelTraceability),
                },
            })),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(),
            subscribeToRun: vi.fn(),
            getRunSnapshot: vi.fn(),
            startDesignRun: vi.fn(async () => ({ runId: "design-table-run" })),
            subscribeToDesignRun: vi.fn(async (_runId, onEvent) => {
                onEvent({ type: "queued" });
                onEvent({ type: "completed", snapshot });
            }),
            getDesignRunSnapshot: vi.fn(async () => snapshot),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
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
        expect(repository.startDesignRun).toHaveBeenCalledWith(expect.objectContaining({
            selectedDiagrams: ["table"],
            existingDesignModels: expect.arrayContaining([
                expect.objectContaining({ diagramKind: "sequence" }),
                expect.objectContaining({ diagramKind: "class" }),
            ]),
            existingDesignPlantUml: expect.arrayContaining([
                expect.objectContaining({ diagramKind: "sequence" }),
                expect.objectContaining({ diagramKind: "class" }),
            ]),
        }));
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
it.each(["ordered", "overlap"] as const)("updates requirement menus and contents during a %s batch without waiting for completion", async (timing) => {
    const rules = [createRule({ relatedDiagrams: ["usecase", "class"] })];
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
        if (timing === "ordered")
            firstRead.resolve(first);
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
    if (timing === "overlap")
        await act(async () => { firstRead.resolve(first); });
    expect(result.current.models.class?.title).toBe("新领域模型");
    await act(async () => { emit({ type: "completed", snapshot: { ...snapshot, status: "completed" } }); pending.resolve(); await generation; });
});
