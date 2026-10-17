// Verifies requirement authoring, rule editing, quality checks, and generation action guards.
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { requestOpenRequirementRule } from "../../../shared/lib/app-navigation";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtomicRequirement, RequirementBaseline, } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import { createRule, createRunSnapshot, createWorkspaceRecord, withWorkspaceProviders, } from "../../../test/workspace-test-utils";
import { snapshotInputFingerprint } from "../../../shared/lib/fingerprint";
import { ApiClientError } from "../../../services/api-client";
import { TextRequirementView } from "./text-requirement-page";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { useWorkspaceSession } from "../../workspace-session/state";
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
describe("TextRequirementView", () => {
    it("blocks real rule generation without a model and leaves selection available", async () => {
        localStorage.clear();
        const repository = createMockWorkspaceRepository({ requirementText: "用户可以提交订单" });
        repository.getProjectAccess = async () => ({ capabilities: ["update_project", "start_runs"], generationExecutionMode: "provider" });
        repository.startRun = vi.fn();
        render(withWorkspaceProviders(<TextRequirementView view="system"/>, repository));
        const button = await screen.findByRole("button", { name: "提取需求规则" });
        await waitFor(() => expect(screen.getByRole("combobox", { name: "选择模型" })).toBeEnabled());
        expect(button).toBeDisabled();
        expect(screen.queryByText("未选择模型供应商")).not.toBeInTheDocument();
        await userEvent.setup().click(button);
        expect(repository.startRun).not.toHaveBeenCalled();
        act(() => patchUserSettings({ providerConfigId: "provider-1", defaultModel: "model-1", providerModelOptions: ["model-1"] }));
        expect(button).toBeEnabled();
        act(() => patchUserSettings({ defaultModel: "" }));
        expect(button).toBeDisabled();
    });
    beforeEach(() => {
        storeManagedUserSettings();
        vi.spyOn(window, "confirm").mockReturnValue(true);
    });
    afterEach(() => {
        localStorage.clear();
    });
    async function chooseSelectOption(user: ReturnType<typeof userEvent.setup>, combobox: HTMLElement, optionName: string) {
        await user.click(combobox);
        await user.click(await screen.findByRole("option", { name: optionName }));
    }
    function createBaseRepository(overrides: Partial<WorkspaceRepository> = {}): WorkspaceRepository {
        return {
            loadWorkspace: vi.fn(async () => createWorkspaceRecord()),
            updateRequirementText: vi.fn(async () => { }),
            startRun: vi.fn(async () => ({ runId: "run-test" })),
            subscribeToRun: vi.fn(async () => { }),
            getRunSnapshot: vi.fn(async () => createRunSnapshot()),
            renderPlantUml: vi.fn(),
            testProviderSettings: vi.fn(),
            saveRunHistory: vi.fn(),
            listRunHistory: vi.fn(async () => []),
            deleteRunHistory: vi.fn(async () => []),
            clearRunHistory: vi.fn(async () => { }),
            ...overrides,
        };
    }
    function createAtomicRequirement(overrides: Partial<AtomicRequirement> = {}): AtomicRequirement {
        return {
            id: "REQ-001",
            sourceRuleId: "r1",
            sourceFragment: "系统应允许用户提交订单。",
            sourceLocation: { section: "input", startOffset: 0, endOffset: 12 },
            type: "functional",
            actor: null,
            subject: "系统",
            action: "允许提交",
            object: "订单",
            condition: null,
            outcome: "系统创建订单",
            confidence: 0.56,
            status: "pending-review",
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
            requirements,
            assumptions: [],
            conflicts: [],
            qualityReport: {
                runId: "run-baseline",
                status: "pending-review",
                summary: "存在待确认字段。",
                issues: requirements[0]
                    ? [
                        {
                            id: "issue-actor",
                            requirementId: requirements[0].id,
                            severity: "warning",
                            code: "missing-actor",
                            message: "缺少参与者。",
                            blocksDownstream: true,
                        },
                    ]
                    : [],
                blockingIssueIds: ["issue-actor"],
                reviewRequiredRequirementIds: requirements[0]
                    ? [requirements[0].id]
                    : [],
            },
            ...overrides,
        };
    }
    it("opens the rule named by a generation blocker even when the page mounts afterward", async () => {
        const rules = [
            createRule({ id: "r1", text: "系统应允许用户提交订单。" }),
            createRule({ id: "r2", text: "系统应显示公开活动。" }),
        ];
        const requirement = createAtomicRequirement({ id: "REQ-002", sourceRuleId: "r2" });
        const baseline = createRequirementBaseline([requirement]);
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                rules, rulesVersion: 1, requirementBaseline: baseline,
                requirementQualityReport: baseline.qualityReport,
            })),
        });
        act(() => requestOpenRequirementRule("r2"));
        render(withWorkspaceProviders(<TextRequirementView view="system"/>, repository));
        const table = await screen.findByRole("table");
        await waitFor(() => expect(within(table).getByText("r2")).toBeInTheDocument());
        expect(within(table).queryByText("r1")).not.toBeInTheDocument();
        expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });
    it("renders the empty state with an unsaved requirement draft", async () => {
        const updateRequirementText = vi.fn(async () => { });
        const repository = createBaseRepository({ updateRequirementText });
        const user = userEvent.setup();
        const { container } = render(withWorkspaceProviders(<TextRequirementView />, repository));
        const requirementInput = await screen.findByPlaceholderText("例如：师生登录后可查询校园会议室，选择日期和时间段提交预约。同一会议室同一时间段不能重复预约；时间冲突时提示原因。预约人可取消自己的预约，管理员可维护会议室信息并处理异常预约。");
        expect(screen.getByRole("heading", { name: "系统业务需求" }).closest('[data-slot="card"]')).not.toBeInTheDocument();
        expect(requirementInput).toBeInTheDocument();
        expect(requirementInput).toHaveClass("h-80", "field-sizing-fixed", "resize-none", "overflow-y-auto");
        expect(requirementInput).not.toHaveClass("field-sizing-content", "resize-y");
        const inputGuidance = screen.getByText("请描述谁使用系统、需要完成哪些功能，以及业务限制和异常处理。平台会先提取需求规则，再逐步生成模型、图表和说明书。");
        expect(screen.queryByText("暂不支持粘贴完整代码后直接生成作业报告，或从代码逆向生成 UML 图。")).not.toBeInTheDocument();
        expect(inputGuidance).toBeVisible();
        expect(requirementInput).toHaveAttribute("aria-describedby", inputGuidance.id);
        expect(screen.getByText("需求分析提取")).toBeInTheDocument();
        expect(screen.getByTestId("requirements-input-toolbar")).toHaveClass("min-w-0", "flex-wrap", "sm:flex-nowrap");
        expect(screen.queryByText("AI 需求助手")).not.toBeInTheDocument();
        expect(screen.queryByText("AI 智能辅助")).not.toBeInTheDocument();
        expect(screen.queryByText("探索与灵感")).not.toBeInTheDocument();
        expect(screen.queryByText("帮我细化功能")).not.toBeInTheDocument();
        expect(screen.queryByText("检查逻辑冲突")).not.toBeInTheDocument();
        expect(screen.queryByText("生成业务规则")).not.toBeInTheDocument();
        expect(screen.queryByText("电商系统")).not.toBeInTheDocument();
        expect(screen.queryByText("社交应用")).not.toBeInTheDocument();
        expect(screen.queryByText("健身追踪")).not.toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(screen.getByText("目标模型")).toBeInTheDocument();
        expect(screen.queryByText(/将自动补齐：需求规则/)).not.toBeInTheDocument();
        expect(screen.getAllByText("请先输入需求描述或添加需求规则").length).toBeGreaterThan(0);
        expect(container.querySelector('[data-workspace-density="assistant-template-grid"]')).not.toBeInTheDocument();
        const modelGrid = container.querySelector('[data-workspace-density="compact-grid"]');
        expect(modelGrid).toBeInTheDocument();
        expect(modelGrid).toHaveAttribute("data-mobile-card-density", "model-targets");
        expect(modelGrid).toHaveClass("grid-cols-2");
        expect(modelGrid?.className).toContain("min-[1900px]:grid-cols-6");
        await user.type(requirementInput, "创建一个订单系统");
        expect(requirementInput).toHaveValue("创建一个订单系统");
        expect(inputGuidance).toBeVisible();
        expect(screen.queryByText("暂不支持粘贴完整代码后直接生成作业报告，或从代码逆向生成 UML 图。")).not.toBeInTheDocument();
        expect(screen.getByText(/需求文本尚未保存到项目。/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "清空" })).not.toBeInTheDocument();
        expect(updateRequirementText).not.toHaveBeenCalled();
    });
    it("shows rule autofill only when source requirement text exists", async () => {
        const user = userEvent.setup();
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "创建一个订单系统",
                rules: [],
            })),
        });
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        await screen.findByText("目标模型");
        expect(screen.queryByText(/将自动补齐：需求规则/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "查看领域概念模型自动补齐说明" }));
        expect(screen.getByText(/将自动补齐：需求规则/)).toBeVisible();
        expect(screen.queryByText("请先输入需求描述或添加需求规则")).not.toBeInTheDocument();
    });
    it("starts a rules-only run through session actions", async () => {
        const startRun = vi.fn(async () => ({ runId: "run-rules" }));
        const subscribeToRun = vi.fn(async (_runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
            onEvent({ type: "queued" });
            onEvent({
                type: "completed",
                snapshot: createRunSnapshot({
                    runId: "run-rules",
                    requirementText: "创建一个订单系统",
                    rules: [createRule()],
                }),
            });
        });
        const getRunSnapshot = vi.fn(async () => createRunSnapshot({
            runId: "run-rules",
            requirementText: "创建一个订单系统",
            rules: [createRule()],
        }));
        const repository = createBaseRepository({
            startRun,
            subscribeToRun,
            getRunSnapshot,
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        await user.type(await screen.findByPlaceholderText("例如：师生登录后可查询校园会议室，选择日期和时间段提交预约。同一会议室同一时间段不能重复预约；时间冲突时提示原因。预约人可取消自己的预约，管理员可维护会议室信息并处理异常预约。"), "创建一个订单系统");
        await user.click(screen.getByRole("button", { name: "提取需求规则" }));
        await waitFor(() => {
            expect(startRun).toHaveBeenCalledWith(expect.objectContaining({
                requirementText: "创建一个订单系统",
                selectedDiagrams: [],
            }));
        });
        expect(await screen.findByRole("dialog", { name: "需求规则已生成" })).toBeInTheDocument();
        expect(screen.getByText("生成完成。")).toBeInTheDocument();
    });
    it("shows the exact ignored source after a mixed-input rules run", async () => {
        const requirementText = "学生可以预约座位。今天天气真好。";
        const ignored = "今天天气真好。";
        const startOffset = requirementText.indexOf(ignored);
        const snapshot = createRunSnapshot({
            runId: "run-mixed-input",
            requirementText,
            rules: [createRule({ text: "学生可以预约座位。", sourceFragment: "学生可以预约座位。" })],
            inputScreening: {
                ignoredSpans: [{ startOffset, endOffset: startOffset + ignored.length, reason: "irrelevant" }],
            },
        });
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({ requirementText })),
            subscribeToRun: vi.fn(async (_runId, onEvent) => {
                onEvent({ type: "queued" });
                onEvent({ type: "completed", snapshot });
            }),
            getRunSnapshot: vi.fn(async () => snapshot),
        });
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        await userEvent.setup().click(await screen.findByRole("button", { name: "提取需求规则" }));
        expect(await screen.findByText(ignored)).toBeVisible();
        expect(screen.getByRole("dialog", { name: "需求规则已生成" })).toHaveTextContent("无关");
    });
    it("asks before replacing existing requirement rules", async () => {
        const startRun = vi.fn(async () => ({ runId: "run-replace-rules" }));
        const subscribeToRun = vi.fn(async (_runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
            const snapshot = createRunSnapshot({
                runId: "run-replace-rules",
                requirementText: "创建一个订单系统",
                rules: [createRule({ id: "r2", text: "系统应校验库存。" })],
            });
            onEvent({ type: "queued" });
            onEvent({ type: "completed", snapshot });
        });
        const getRunSnapshot = vi.fn(async () => createRunSnapshot({
            runId: "run-replace-rules",
            requirementText: "创建一个订单系统",
            rules: [createRule({ id: "r2", text: "系统应校验库存。" })],
        }));
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "创建一个订单系统",
                rules: [createRule({ id: "r1", text: "系统应允许提交订单。" })],
            })),
            startRun,
            subscribeToRun,
            getRunSnapshot,
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const submitButton = await screen.findByRole("button", { name: "提取需求规则" });
        await waitFor(() => expect(submitButton).toBeEnabled());
        await user.click(submitButton);
        const dialog = await screen.findByRole("dialog", {
            name: "确认替换需求规则",
        });
        expect(within(dialog).getByText(/全量替换当前 1 条需求规则/u)).toBeInTheDocument();
        await user.click(within(dialog).getByRole("button", { name: "取消" }));
        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: "确认替换需求规则" })).not.toBeInTheDocument();
        });
        expect(startRun).not.toHaveBeenCalled();
        await waitFor(() => expect(submitButton).toBeEnabled());
        expect(screen.getByRole("textbox", { name: "系统业务需求" })).toHaveValue("创建一个订单系统");
        await user.click(submitButton);
        await user.click(within(await screen.findByRole("dialog", { name: "确认替换需求规则" }))
            .getByRole("button", { name: "确认替换" }));
        await waitFor(() => {
            expect(startRun).toHaveBeenCalledWith(expect.objectContaining({
                requirementText: "创建一个订单系统",
                selectedDiagrams: [],
            }));
        });
    });
    it("shows a provider failure with a settings action and no purchase navigation", async () => {
        const startRun = vi.fn(async () => {
            throw new ApiClientError("模型服务不可用", 403, {
                error: { code: "PROVIDER_CONFIG_UNAVAILABLE", category: "provider", retryable: false },
            });
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, createBaseRepository({ startRun })));
        await user.type(await screen.findByRole("textbox", { name: "系统业务需求" }), "创建一个订单系统");
        await user.click(screen.getByRole("button", { name: "提取需求规则" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("button", { name: "查看连接配置" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "购买权益" })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "账单" })).not.toBeInTheDocument();
    });
    it("starts a diagram run through session actions", async () => {
        const startRun = vi.fn(async () => ({ runId: "run-diagrams" }));
        const snapshot = createRunSnapshot({
            runId: "run-diagrams",
            requirementText: "创建一个订单系统",
            selectedDiagrams: ["usecase"],
            rules: [createRule()],
            models: [
                {
                    diagramKind: "usecase",
                    title: "订单系统用例",
                    summary: "主要角色与用例",
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
                            type: "association",
                            sourceId: "actor_user",
                            targetId: "usecase_submit_order",
                        },
                    ],
                },
            ],
            plantUml: [
                { diagramKind: "usecase", source: "@startuml\nactor 用户\n@enduml" },
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
            ],
        });
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "创建一个订单系统",
                rules: [createRule()],
                rulesVersion: 1,
                selectedDiagramTypes: ["usecase"],
            })),
            startRun,
            subscribeToRun: vi.fn(async (_runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
                onEvent({ type: "queued" });
                onEvent({ type: "completed", snapshot });
            }),
            getRunSnapshot: vi.fn(async () => snapshot),
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        await user.click(await screen.findByRole("checkbox", { name: /用例模型/ }));
        const generateButton = await screen.findByRole("button", {
            name: "生成",
        });
        await waitFor(() => {
            expect(generateButton).toBeEnabled();
        });
        await user.click(generateButton);
        await user.click(await screen.findByRole("button", { name: "确认生成" }));
        await waitFor(() => {
            expect(startRun).toHaveBeenCalledWith(expect.objectContaining({
                selectedDiagrams: ["usecase"],
                rules: [createRule()],
            }));
        });
        expect(screen.queryByText("SRS 摘要")).not.toBeInTheDocument();
        expect(screen.queryByText("模型结果")).not.toBeInTheDocument();
    });
    it("omits advanced trace proof controls even when requirement models have trace records", async () => {
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "创建一个订单系统",
                rules: [
                    createRule({
                        id: "r1",
                        text: "普通读者可以查询自己借出的书目。",
                        relatedDiagrams: ["usecase"],
                    }),
                ],
                selectedDiagramTypes: ["usecase"],
                generatedDiagramTypes: ["usecase"],
                models: {
                    usecase: {
                        diagramKind: "usecase",
                        title: "图书馆用例模型",
                        summary: "读者自助查询",
                        notes: [],
                        actors: [
                            {
                                id: "actor_reader",
                                name: "普通读者",
                                actorType: "human",
                                responsibilities: ["查询自己借出的书目"],
                            },
                        ],
                        useCases: [
                            {
                                eventFlows: [],
                                id: "uc_find_own_loans",
                                name: "查询自己借出的书目",
                                goal: "返回当前读者借阅清单",
                                preconditions: ["普通读者已登录"],
                                postconditions: ["系统展示该读者当前借阅清单"],
                                primaryActorId: "actor_reader",
                                supportingActorIds: [],
                            },
                        ],
                        systemBoundaries: [
                            { id: "boundary_library", name: "图书馆系统" },
                        ],
                        relationships: [],
                    },
                },
                requirementModelTraceability: [
                    {
                        ruleId: "r1",
                        target: {
                            diagramKind: "usecase",
                            elementId: "uc_find_own_loans",
                            elementKind: "usecase",
                            label: "查询自己借出的书目",
                        },
                    },
                ],
            })),
        });
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        await screen.findByText("目标模型");
        expect(screen.queryByText("需求模型 AI 修复记录")).not.toBeInTheDocument();
        expect(screen.queryByText(/需求规则 r1 需要解释其在用例模型中的覆盖关系/u)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /查看需求模型追踪证明/u })).not.toBeInTheDocument();
        expect(screen.queryByText("高级选项")).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "需求模型追踪证明" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "生成" })).toHaveClass("h-7", "px-2.5");
    });
    it("keeps target diagrams selectable when existing rules need AI mapping completion", async () => {
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "创建一个订单系统",
                rules: [
                    createRule({
                        id: "r1",
                        relatedDiagrams: ["usecase"],
                    }),
                ],
                rulesVersion: 1,
                selectedDiagramTypes: ["class"],
            })),
        });
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        expect(await screen.findByRole("checkbox", { name: /用例模型/ })).toBeEnabled();
        const classDiagramCheckbox = screen.getByRole("checkbox", {
            name: /领域概念模型/,
        });
        expect(classDiagramCheckbox).toBeEnabled();
        expect(classDiagramCheckbox).not.toBeChecked();
        await userEvent.click(classDiagramCheckbox);
        expect(classDiagramCheckbox).toBeChecked();
        expect(screen.queryByText(/将自动补齐：规则映射/)).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "查看领域概念模型自动补齐说明" }));
        expect(screen.getByText(/将自动补齐：规则映射/)).toBeVisible();
        expect(screen.getByText("1/7")).toBeInTheDocument();
    });
    it("allows analysis model selection from generated use case event flows without requirement rules", async () => {
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "创建一个订单系统",
                rules: [],
                rulesVersion: 0,
                selectedDiagramTypes: [],
                generatedDiagramTypes: ["usecase"],
                diagramVersions: { usecase: 0 },
                models: {
                    usecase: {
                        diagramKind: "usecase",
                        title: "用例模型",
                        summary: "用户提交订单。",
                        notes: [],
                        actors: [],
                        useCases: [],
                        systemBoundaries: [],
                        relationships: [],
                    },
                },
            })),
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const analysisCheckbox = await screen.findByRole("checkbox", {
            name: /需求分析模型/,
        });
        expect(analysisCheckbox).toBeEnabled();
        expect(screen.getByText("基于用例事件流的需求交互分析")).toHaveClass("truncate");
        expect(screen.getByText("基于用例模型事件流生成，不要求需求规则直接映射。")).toHaveClass("truncate");
        expect(screen.queryByText("需先选择或生成用例模型")).not.toBeInTheDocument();
        await user.click(analysisCheckbox);
        await waitFor(() => {
            expect(analysisCheckbox).toBeChecked();
        });
        expect(screen.getByText("1/7")).toBeInTheDocument();
    });
    it("labels only the new selected models, without untouched model counts", async () => {
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "创建一个订单系统",
                rules: [
                    createRule({ id: "r1", relatedDiagrams: ["usecase"] }),
                    createRule({ id: "r2", relatedDiagrams: ["class"] }),
                    createRule({ id: "r3", relatedDiagrams: ["activity"] }),
                ],
                selectedDiagramTypes: ["activity"],
                generatedDiagramTypes: ["usecase", "class"],
            })),
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        await user.click(await screen.findByRole("checkbox", { name: /总体业务流程/ }));
        expect(await screen.findByRole("button", {
            name: "生成",
        })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /移除/ })).not.toBeInTheDocument();
    });
    it("keeps stale generated requirement models selectable after requirement text changes", async () => {
        const oldRequirementText = "用户可以提交订单。";
        const rule = createRule({
            id: "r1",
            text: "用户可以提交订单。",
            relatedDiagrams: ["usecase"],
        });
        const oldFingerprint = snapshotInputFingerprint({
            requirementText: oldRequirementText,
            rules: [rule],
        });
        const startRun = vi.fn(async () => ({ runId: "run-should-not-start" }));
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: oldRequirementText,
                rules: [rule],
                rulesVersion: 1,
                rulesBasedOnTextVersion: 0,
                requirementInputFingerprint: oldFingerprint,
                generatedDiagramTypes: ["usecase"],
                diagramInputFingerprints: { usecase: oldFingerprint },
                models: {
                    usecase: {
                        diagramKind: "usecase",
                        title: "订单用例模型",
                        summary: "用户提交订单。",
                        notes: [],
                        actors: [],
                        useCases: [],
                        systemBoundaries: [],
                        relationships: [],
                    },
                },
            })),
            startRun,
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const sourceText = await screen.findByPlaceholderText("例如：师生登录后可查询校园会议室，选择日期和时间段提交预约。同一会议室同一时间段不能重复预约；时间冲突时提示原因。预约人可取消自己的预约，管理员可维护会议室信息并处理异常预约。");
        await user.type(sourceText, "并支持退款。");
        expect(screen.getByText(/需求文本尚未保存到项目。/)).toBeInTheDocument();
        const useCaseCheckbox = screen.getByRole("checkbox", { name: /用例模型/ });
        expect(useCaseCheckbox).toBeEnabled();
        await user.click(useCaseCheckbox);
        expect(useCaseCheckbox).toBeChecked();
        const generateButton = screen.getByRole("button", {
            name: "生成",
        });
        expect(generateButton).toBeDisabled();
        expect(generateButton).toHaveAttribute("title", "需求规则已过期，请先更新需求规则");
        expect(startRun).not.toHaveBeenCalled();
    });
    it("surfaces pending auto rule-mapping reviews on requirement model cards", async () => {
        const updateAutoGeneratedUpstreamReviews = vi.fn(async () => { });
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "校园失物招领需求",
                rules: [
                    createRule({
                        id: "r1",
                        text: "管理员可以处理争议和查看审计日志。",
                        relatedDiagrams: ["deployment"],
                    }),
                ],
                autoGeneratedUpstreamReviews: {
                    "requirement-rule:mapping:deployment": {
                        id: "requirement-rule:mapping:deployment",
                        artifactType: "requirement-rule",
                        artifactId: "mapping:deployment",
                        label: "部署需求模型规则映射",
                        reason: "生成所选模型时缺少上游规则映射，系统自动补齐关联关系。",
                        sourceRunId: "run-rules",
                        status: "pending",
                        createdAt: "2026-06-08T15:14:14.176Z",
                    },
                },
            })),
            updateAutoGeneratedUpstreamReviews,
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const deploymentCard = await screen.findByRole("button", {
            name: "选择部署需求模型",
        });
        expect(within(deploymentCard).getByText("待审")).toBeInTheDocument();
        expect(within(deploymentCard).queryByText(/部署需求模型规则映射/)).not.toBeInTheDocument();
        await user.click(within(deploymentCard).getByRole("button", {
            name: "查看部署需求模型自动补齐说明",
        }));
        expect(await screen.findByText("部署需求模型规则映射")).toBeVisible();
        await user.click(screen.getByRole("button", {
            name: "采纳部署需求模型自动补齐",
        }));
        await waitFor(() => {
            expect(updateAutoGeneratedUpstreamReviews).toHaveBeenCalledWith({
                "requirement-rule:mapping:deployment": expect.objectContaining({
                    status: "accepted",
                }),
            });
        });
    });
    it("keeps generated rules without hint details as read-only status text", async () => {
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "创建一个订单系统",
                rules: [
                    createRule({
                        id: "r1",
                        text: "系统应提供订单提交能力。",
                    }),
                ],
                requirementBaseline: {
                    runId: "run-clean-rule",
                    sourceDocumentId: "inline-requirement",
                    createdAt: "2026-05-24T00:00:00.000Z",
                    assumptions: [],
                    conflicts: [],
                    qualityReport: {
                        runId: "run-clean-rule",
                        status: "passed",
                        summary: "需求质量检查通过。",
                        issues: [],
                        blockingIssueIds: [],
                        reviewRequiredRequirementIds: [],
                    },
                    requirements: [
                        {
                            id: "REQ-001",
                            sourceRuleId: "r1",
                            sourceFragment: "系统应提供订单提交能力。",
                            sourceLocation: {
                                section: "input",
                                startOffset: 0,
                                endOffset: 12,
                            },
                            type: "functional",
                            actor: "用户",
                            subject: "用户",
                            action: "提交订单",
                            object: "订单",
                            condition: null,
                            outcome: "系统保存订单",
                            confidence: 0.9,
                            status: "accepted",
                            criticality: "medium",
                            acceptanceCriteria: ["用户可以提交订单。"],
                            priority: "should",
                            fieldProvenance: {},
                        },
                    ],
                },
            })),
        });
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const row = await screen.findByRole("row", {
            name: /r1.*系统应提供订单提交能力/u,
        });
        expect(within(row).getByText("已生成")).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: /查看需求提示详情/u })).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "需求规则修复确认" })).not.toBeInTheDocument();
    });
    it.each([false, true])("toggles the whole model card without navigation, generated=%s", async (generated) => {
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "创建一个订单系统",
                rules: [
                    createRule({
                        id: "r1",
                        relatedDiagrams: ["usecase"],
                    }),
                ],
                rulesVersion: 1,
                generatedDiagramTypes: generated ? ["usecase"] : [],
                models: generated ? { usecase: { diagramKind: "usecase", title: "用例模型", summary: "订单用例", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] } } : {},
            })),
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const useCaseCheckbox = await screen.findByRole("checkbox", {
            name: /用例模型/,
        });
        const useCaseCard = screen.getByRole("button", { name: "选择用例模型" });
        expect(within(useCaseCard).queryByRole("button", { name: /^打开/ })).not.toBeInTheDocument();
        expect(useCaseCard).toHaveClass("h-[212px]", "sm:h-[236px]");
        expect(useCaseCard).toHaveAttribute("data-slot", "spotlight-card");
        expect(useCaseCheckbox).not.toBeChecked();
        const group = screen.getByRole("group", { name: "全选 / 全不选" });
        await user.click(within(group).getByRole("button", { name: "全选" }));
        expect(useCaseCheckbox).toBeChecked();
        for (const checkbox of screen.getAllByRole("checkbox")) {
            if (checkbox.hasAttribute("disabled") || checkbox.getAttribute("aria-disabled") === "true")
                expect(checkbox).not.toBeChecked();
        }
        await user.click(within(group).getByRole("button", { name: "全不选" }));
        expect(useCaseCheckbox).not.toBeChecked();
        await user.click(useCaseCard);
        expect(useCaseCheckbox).toBeChecked();
        await user.keyboard("{Enter}");
        expect(useCaseCheckbox).not.toBeChecked();
    });
    it("toggles target diagram cards that will auto-fill when no rules exist", async () => {
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "创建一个订单系统",
                rules: [],
                rulesVersion: 0,
            })),
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const classDiagramCheckbox = await screen.findByRole("checkbox", {
            name: /领域概念模型/,
        });
        expect(classDiagramCheckbox).toBeEnabled();
        await user.click(screen.getByRole("button", { name: "选择领域概念模型" }));
        expect(classDiagramCheckbox).toBeChecked();
    });
    it("keeps rule id jumps from toggling target diagram selection", async () => {
        Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
            configurable: true,
            value: vi.fn(),
        });
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                rules: [
                    createRule({
                        id: "r1",
                        relatedDiagrams: ["usecase"],
                    }),
                ],
                rulesVersion: 1,
            })),
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const useCaseCheckbox = await screen.findByRole("checkbox", {
            name: /用例模型/,
        });
        const useCaseCard = screen.getByRole("button", { name: "选择用例模型" });
        expect(useCaseCheckbox).not.toBeChecked();
        expect(within(useCaseCard).queryByText("r1")).not.toBeInTheDocument();
        await user.click(within(useCaseCard).getByRole("button", {
            name: "查看用例模型关联需求规则",
        }));
        await user.click(screen.getByRole("button", { name: "定位需求规则 r1" }));
        expect(useCaseCheckbox).not.toBeChecked();
    });
    it("allows correcting the type of an existing requirement rule", async () => {
        const updateRequirementRules = vi.fn(async () => { });
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                rules: [
                    createRule({
                        id: "r1",
                        category: "非功能需求",
                        text: "用户可以提交订单。",
                        relatedDiagrams: ["usecase"],
                    }),
                ],
                rulesVersion: 1,
            })),
            updateRequirementRules,
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        await chooseSelectOption(user, await screen.findByRole("combobox", { name: "需求类型 r1" }), "功能需求");
        await waitFor(() => {
            expect(updateRequirementRules).toHaveBeenLastCalledWith([
                expect.objectContaining({
                    id: "r1",
                    category: "功能需求",
                }),
            ], expect.objectContaining({
                requirementInputFingerprint: expect.stringMatching(/^fp:v3:/),
                rulesBasedOnTextVersion: 0,
                rulesVersion: 2,
            }));
        });
    });
    it("keeps a selected target diagram when its last linked rule is deleted", async () => {
        const updateRequirementRules = vi.fn(async () => { });
        const usecaseRule = createRule({
            id: "r1",
            text: "用户可以提交订单。",
            relatedDiagrams: ["usecase"],
        });
        const classRule = createRule({
            id: "r2",
            text: "系统必须保存订单实体。",
            relatedDiagrams: ["class"],
        });
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "创建一个订单系统",
                rules: [usecaseRule, classRule],
                rulesVersion: 1,
                selectedDiagramTypes: ["class"],
            })),
            updateRequirementRules,
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const classDiagramCheckbox = await screen.findByRole("checkbox", {
            name: /领域概念模型/,
        });
        await user.click(classDiagramCheckbox);
        expect(classDiagramCheckbox).toBeChecked();
        vi.mocked(window.confirm).mockReturnValue(false);
        await user.click(screen.getByRole("button", { name: "删除需求项 r2" }));
        expect(updateRequirementRules).not.toHaveBeenCalled();
        expect(screen.getByDisplayValue(classRule.text)).toBeInTheDocument();
        vi.mocked(window.confirm).mockReturnValue(true);
        await user.click(screen.getByRole("button", { name: "删除需求项 r2" }));
        await waitFor(() => {
            expect(updateRequirementRules).toHaveBeenLastCalledWith([usecaseRule], expect.objectContaining({
                requirementInputFingerprint: expect.stringMatching(/^fp:v3:/),
                rulesBasedOnTextVersion: 0,
                rulesVersion: 2,
            }));
            expect(classDiagramCheckbox).toBeChecked();
            expect(classDiagramCheckbox).toBeEnabled();
        });
        expect(screen.queryByText(/将自动补齐：规则映射/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "查看领域概念模型自动补齐说明" }));
        expect(screen.getByText(/将自动补齐：规则映射/)).toBeVisible();
    });
    it("keeps generation in the background without opening diagnostics overlay", async () => {
        let completeRun!: () => void;
        const snapshot = createRunSnapshot({
            runId: "run-stream",
            requirementText: "创建一个订单系统",
            rules: [createRule()],
        });
        const repository = createBaseRepository({
            startRun: vi.fn(async () => ({ runId: "run-stream" })),
            subscribeToRun: vi.fn(async (_runId: string, onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1]) => {
                onEvent({ type: "queued" });
                onEvent({ type: "stage_started", stage: "extract_rules" });
                onEvent({
                    type: "llm_chunk",
                    stage: "extract_rules",
                    chunk: '{"rules":',
                });
                onEvent({
                    type: "llm_chunk",
                    stage: "extract_rules",
                    chunk: '[{"id":"r1"}]',
                });
                await new Promise<void>((resolve) => {
                    completeRun = () => {
                        onEvent({ type: "completed", snapshot });
                        resolve();
                    };
                });
            }),
            getRunSnapshot: vi.fn(async () => snapshot),
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        await user.type(await screen.findByPlaceholderText("例如：师生登录后可查询校园会议室，选择日期和时间段提交预约。同一会议室同一时间段不能重复预约；时间冲突时提示原因。预约人可取消自己的预约，管理员可维护会议室信息并处理异常预约。"), "创建一个订单系统");
        await user.click(screen.getByRole("button", { name: "提取需求规则" }));
        expect(await screen.findByRole("button", { name: "停止生成" })).toBeEnabled();
        expect(screen.queryByRole("button", { name: "提取需求规则" })).not.toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "系统业务需求" })).toBeDisabled();
        expect(screen.queryByText("查看详情")).not.toBeInTheDocument();
        expect(screen.queryByText(/Run ID：/)).not.toBeInTheDocument();
        expect(screen.queryByText(/\{"rules":\[\{"id":"r1"\}\]/)).not.toBeInTheDocument();
        expect(screen.queryByText("extract_rules 收到模型输出")).not.toBeInTheDocument();
        await act(async () => { completeRun(); });
        const completedDialog = await screen.findByRole("dialog", { name: "需求规则已生成" });
        await user.click(within(completedDialog).getByRole("button", { name: "我知道了" }));
        expect(await screen.findByRole("button", { name: "提取需求规则" })).toBeEnabled();
        expect(screen.getByRole("textbox", { name: "系统业务需求" })).toBeEnabled();
    });
    it("renders requirement rules as an editable-text table", async () => {
        const updateRequirementRules = vi.fn(async () => { });
        const originalRule = createRule({
            id: "r1",
            category: "业务规则",
            text: "用户必须登录后才能访问主要功能。",
            relatedDiagrams: ["usecase", "activity"],
        });
        const baselineRequirement = createAtomicRequirement({
            id: "REQ-001",
            sourceRuleId: originalRule.id,
            sourceFragment: originalRule.text,
        });
        const baseline = createRequirementBaseline([baselineRequirement]);
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                rules: [originalRule],
                rulesVersion: 1,
                requirementBaseline: baseline,
                requirementQualityReport: baseline.qualityReport,
                requirementReviewCandidates: {
                    r1: {
                        ruleId: "r1",
                        beforeRequirement: baselineRequirement,
                        afterRequirement: null,
                        repairRationale: null,
                        blockingReasons: ["缺少参与者"],
                        status: "failed",
                        errorMessage: "无法自动补齐。",
                        createdAt: "2026-06-21T00:00:00.000Z",
                    },
                },
                selectedDiagramTypes: ["usecase"],
            })),
            updateRequirementRules,
        });
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const table = await screen.findByRole("table");
        expect(screen.queryByText("AI 需求助手")).not.toBeInTheDocument();
        expect(screen.queryByText("探索与灵感")).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText("例如：师生登录后可查询校园会议室，选择日期和时间段提交预约。同一会议室同一时间段不能重复预约；时间冲突时提示原因。预约人可取消自己的预约，管理员可维护会议室信息并处理异常预约。")).toHaveClass("h-[240px]", "field-sizing-fixed", "resize-none", "overflow-y-auto");
        expect(within(table).getByRole("columnheader", { name: "编号" })).toBeInTheDocument();
        expect(within(table).getByRole("columnheader", { name: "类型" })).toBeInTheDocument();
        expect(within(table).getByRole("columnheader", {
            name: "需求文本内容（可编辑）",
        })).toBeInTheDocument();
        expect(within(table).getByDisplayValue("用户必须登录后才能访问主要功能。")).toHaveClass("px-2", "md:px-3");
        expect(within(table).queryByRole("columnheader", { name: "相关图" })).not.toBeInTheDocument();
        expect(within(table).getByRole("columnheader", { name: "操作" })).toBeInTheDocument();
        expect(within(table).getByText("r1")).toBeInTheDocument();
        expect(within(table).getByText("业务规则")).toBeInTheDocument();
        expect(within(table).getByText("已生成")).toBeInTheDocument();
        expect(within(table).getByRole("combobox", { name: "需求类型 r1" })).toBeInTheDocument();
        expect(within(table).queryByRole("checkbox")).not.toBeInTheDocument();
        const textEditor = within(table).getByDisplayValue("用户必须登录后才能访问主要功能。") as HTMLInputElement;
        expect(textEditor.tagName).toBe("INPUT");
        expect(textEditor.type).toBe("text");
        fireEvent.change(textEditor, { target: { value: "游客可以查看公开活动列表。" } });
        await waitFor(() => {
            expect(updateRequirementRules).toHaveBeenLastCalledWith([
                {
                    ...originalRule,
                    text: "游客可以查看公开活动列表。",
                },
            ], expect.objectContaining({
                requirementInputFingerprint: expect.stringMatching(/^fp:v3:/),
                requirementBaseline: expect.objectContaining({
                    schemaVersion: 2,
                    requirements: [],
                    rules: [expect.objectContaining({ id: originalRule.id, text: "游客可以查看公开活动列表。", origin: "manual-edited" })],
                }),
                requirementReviewCandidates: {},
                rulesBasedOnTextVersion: 0,
                rulesVersion: expect.any(Number),
            }));
        });
        expect(within(table).queryByText("修复失败待重试")).not.toBeInTheDocument();
        expect(within(table).queryByText("有待确认提示")).not.toBeInTheDocument();
        expect(within(table).getByText("已生成")).toBeInTheDocument();
    });
    it("keeps requirement text editable on the same page as generated rules", async () => {
        const updateRequirementText = vi.fn(async () => { });
        const originalRule = createRule({
            id: "r1",
            text: "系统应提供订单提交能力。",
            relatedDiagrams: ["usecase"],
        });
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "创建一个订单系统",
                rules: [originalRule],
                rulesVersion: 1,
                rulesBasedOnTextVersion: 0,
                selectedDiagramTypes: ["usecase"],
            })),
            updateRequirementText,
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        expect(await screen.findByRole("table")).toBeInTheDocument();
        const sourceText = screen.getByPlaceholderText("例如：师生登录后可查询校园会议室，选择日期和时间段提交预约。同一会议室同一时间段不能重复预约；时间冲突时提示原因。预约人可取消自己的预约，管理员可维护会议室信息并处理异常预约。");
        expect(sourceText).toHaveValue("创建一个订单系统");
        expect(sourceText).toHaveClass("h-[240px]", "field-sizing-fixed", "resize-none", "overflow-y-auto");
        expect(screen.queryByRole("button", { name: "返回修改描述" })).not.toBeInTheDocument();
        await user.type(sourceText, "，并支持退款");
        expect(sourceText).toHaveClass("h-[240px]", "field-sizing-fixed", "resize-none", "overflow-y-auto");
        expect(updateRequirementText).not.toHaveBeenCalled();
        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getByText(/需求文本尚未保存到项目。/)).toBeInTheDocument();
    });
    it("treats manual requirement rule edits as refreshed rules for model generation", async () => {
        const updateRequirementRules = vi.fn(async () => { });
        const requirementText = "订单系统需求";
        const originalRule = createRule({
            id: "r1",
            category: "功能需求",
            text: "用户提交订单。",
            relatedDiagrams: ["usecase"],
        });
        const staleRule = {
            ...originalRule,
            text: "用户可以提交订单。",
        };
        const editedRule = {
            ...originalRule,
            text: "用户可以提交订单并收到确认消息。",
        };
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText,
                rules: [staleRule],
                selectedDiagramTypes: [],
                rulesVersion: 4,
                rulesBasedOnTextVersion: 0,
                requirementInputFingerprint: snapshotInputFingerprint({
                    requirementText,
                    rules: [originalRule],
                }),
            })),
            updateRequirementRules,
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const table = await screen.findByRole("table");
        expect(screen.getByText("需求规则或复核结果已变化，下游模型可能需要更新。")).toBeInTheDocument();
        const ruleEditor = within(table).getByDisplayValue(staleRule.text);
        fireEvent.change(ruleEditor, { target: { value: editedRule.text } });
        const editedFingerprint = snapshotInputFingerprint({
            requirementText,
            rules: [editedRule],
        });
        await waitFor(() => {
            expect(updateRequirementRules).toHaveBeenLastCalledWith([editedRule], expect.objectContaining({
                requirementInputFingerprint: editedFingerprint,
                rulesBasedOnTextVersion: 0,
                rulesVersion: expect.any(Number),
            }));
        });
        expect(screen.queryByText("需求规则或复核结果已变化，下游模型可能需要更新。")).not.toBeInTheDocument();
        const useCaseCheckbox = screen.getByRole("checkbox", { name: /用例模型/ });
        expect(useCaseCheckbox).toBeEnabled();
        await user.click(useCaseCheckbox);
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "生成" })).toBeEnabled();
        });
    });
    it("uses selectable page sizes and filters requirement rules by text and type", async () => {
        const rules = Array.from({ length: 26 }, (_, index) => createRule({
            id: `r${index + 1}`,
            text: `规则 ${index + 1}`,
            category: index % 2 === 0 ? "业务规则" : "数据需求",
            relatedDiagrams: ["usecase"],
        }));
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                rules,
                rulesVersion: 1,
                selectedDiagramTypes: ["usecase"],
            })),
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const table = await screen.findByRole("table");
        expect(within(table).getByDisplayValue("规则 1")).toBeInTheDocument();
        expect(within(table).getByDisplayValue("规则 10")).toBeInTheDocument();
        expect(within(table).queryByDisplayValue("规则 11")).not.toBeInTheDocument();
        expect(screen.getAllByTestId("requirement-rule-row-slot")).toHaveLength(10);
        expect(screen.getByLabelText("1-10 / 26")).toBeInTheDocument();
        expect(screen.getByTestId("requirement-rule-pagination")).toHaveClass("sticky", "bottom-0");
        await chooseSelectOption(user, screen.getByRole("combobox", { name: "每页条数" }), "25");
        expect(within(table).getByDisplayValue("规则 25")).toBeInTheDocument();
        expect(within(table).queryByDisplayValue("规则 26")).not.toBeInTheDocument();
        expect(screen.getAllByTestId("requirement-rule-row-slot")).toHaveLength(25);
        expect(screen.getByLabelText("1-25 / 26")).toBeInTheDocument();
        await chooseSelectOption(user, screen.getByRole("combobox", { name: "每页条数" }), "10");
        await user.click(screen.getByRole("button", { name: "下一页" }));
        expect(within(table).queryByDisplayValue("规则 1")).not.toBeInTheDocument();
        expect(within(table).getByDisplayValue("规则 11")).toBeInTheDocument();
        expect(within(table).getByDisplayValue("规则 20")).toBeInTheDocument();
        expect(screen.getByLabelText("11-20 / 26")).toBeInTheDocument();
        await user.type(screen.getByPlaceholderText("搜索规则..."), "26");
        expect(within(table).getByDisplayValue("规则 26")).toBeInTheDocument();
        expect(within(table).queryByDisplayValue("规则 20")).not.toBeInTheDocument();
        expect(screen.getByLabelText("1-1 / 1")).toBeInTheDocument();
        expect(screen.getAllByTestId("requirement-rule-row-slot")).toHaveLength(10);
        await user.clear(screen.getByPlaceholderText("搜索规则..."));
        await chooseSelectOption(user, screen.getByRole("combobox", { name: "需求类型筛选" }), "数据需求");
        expect(within(table).getByDisplayValue("规则 2")).toBeInTheDocument();
        expect(within(table).getByDisplayValue("规则 20")).toBeInTheDocument();
        expect(within(table).queryByDisplayValue("规则 1")).not.toBeInTheDocument();
        expect(screen.getByLabelText("1-10 / 13")).toBeInTheDocument();
    });
    it("keeps generated requirement text and rules table constrained on mobile width", async () => {
        const rules = Array.from({ length: 5 }, (_, index) => createRule({
            id: `r${index + 1}`,
            text: `此日历规则 ${index + 1} 用于验证移动端规则表完整缩放显示。`,
            category: index % 2 === 0 ? "业务规则" : "功能需求",
            relatedDiagrams: ["usecase"],
        }));
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "此日历仅供公众使用，而非个人日历。此日历用于显示面向公众的活动安排。",
                rules,
                rulesVersion: 1,
                selectedDiagramTypes: ["usecase"],
            })),
        });
        const { container } = render(withWorkspaceProviders(<TextRequirementView />, repository));
        const shell = container.querySelector(".min-w-0.max-w-full.overflow-x-hidden") as HTMLElement;
        expect(shell).toHaveClass("min-w-0", "max-w-full", "overflow-x-hidden");
        const sourceText = await screen.findByPlaceholderText("例如：师生登录后可查询校园会议室，选择日期和时间段提交预约。同一会议室同一时间段不能重复预约；时间冲突时提示原因。预约人可取消自己的预约，管理员可维护会议室信息并处理异常预约。");
        expect(sourceText).toHaveClass("w-full");
        const table = await screen.findByTestId("requirement-rules-compact-table");
        expect(table).toHaveClass("w-full", "table-fixed", "text-[12px]");
        expect(table).not.toHaveStyle({ width: "max(100%, 960px)" });
        const numberHeader = within(table).getByRole("columnheader", {
            name: "编号",
        });
        const typeHeader = within(table).getByRole("columnheader", {
            name: "类型",
        });
        const actionHeader = within(table).getByRole("columnheader", {
            name: "操作",
        });
        expect(numberHeader).toHaveClass("text-center");
        expect(numberHeader).toHaveClass("w-[32px]");
        expect(typeHeader).toHaveClass("w-[112px]", "text-center");
        expect(actionHeader).toHaveClass("w-[28px]", "text-center");
        expect(within(table).getByRole("columnheader", { name: "状态" })).toHaveClass("w-[84px]");
        expect(within(table).getByRole("columnheader", { name: "状态" })).toBeInTheDocument();
        expect(within(table).getByRole("columnheader", {
            name: "需求文本内容（可编辑）",
        })).toBeInTheDocument();
        const firstRuleCell = within(table)
            .getByText("r1")
            .closest("td") as HTMLElement;
        const typeControl = within(table).getByRole("combobox", {
            name: "需求类型 r1",
        });
        const typeCell = typeControl.closest("td") as HTMLElement;
        const deleteButton = within(table).getByRole("button", {
            name: "删除需求项 r1",
        });
        const actionCell = deleteButton.closest("td") as HTMLElement;
        expect(firstRuleCell).toHaveClass("text-center");
        expect(typeCell).toHaveClass("text-center");
        expect(typeControl).toHaveClass("w-auto", "min-w-[6.5rem]", "*:data-[slot=select-value]:justify-center");
        expect(actionCell).toHaveClass("text-center");
        expect(deleteButton).toHaveClass("mx-auto");
        const tableSection = table.closest("section");
        expect(tableSection).toHaveClass("min-w-0", "max-w-full", "overflow-hidden");
        expect(table).toBeInTheDocument();
    });
    it("keeps status and related diagram cells compact in fixed-width rows", async () => {
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                rules: [
                    createRule({
                        id: "r10",
                        text: "普通读者只能使用查找自己已借出书目的功能。",
                        relatedDiagrams: ["usecase", "class", "activity"],
                    }),
                ],
                requirementBaseline: {
                    runId: "run-compact-rule-row",
                    sourceDocumentId: "inline-requirement",
                    createdAt: "2026-05-24T00:00:00.000Z",
                    assumptions: [],
                    conflicts: [],
                    qualityReport: {
                        runId: "run-compact-rule-row",
                        status: "passed",
                        summary: "系统已补齐结构化字段。",
                        issues: [],
                        blockingIssueIds: [],
                        reviewRequiredRequirementIds: [],
                    },
                    requirements: [
                        {
                            id: "REQ-010",
                            sourceRuleId: "r10",
                            sourceFragment: "普通读者只能使用查找自己已借出书目的功能。",
                            sourceLocation: {
                                section: "input",
                                startOffset: 0,
                                endOffset: 21,
                            },
                            type: "business-rule",
                            actor: "普通读者",
                            subject: "普通读者",
                            action: "查找",
                            object: "自己已借出的书目",
                            condition: "登录身份为普通读者",
                            outcome: "系统返回自己的借出书目",
                            confidence: 0.74,
                            status: "accepted",
                            criticality: "critical",
                            acceptanceCriteria: ["普通读者只能查看自己已借出的书目。"],
                            priority: "must",
                            fieldProvenance: {
                                actor: {
                                    source: "ai-suggested",
                                    status: "accepted",
                                    value: "普通读者",
                                },
                                object: {
                                    source: "ai-suggested",
                                    status: "accepted",
                                    value: "自己已借出的书目",
                                },
                                condition: {
                                    source: "ai-suggested",
                                    status: "accepted",
                                    value: "登录身份为普通读者",
                                },
                            },
                        },
                    ],
                },
            })),
        });
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const row = await screen.findByRole("row", {
            name: /r10.*普通读者只能使用查找自己已借出书目的功能/u,
        });
        const cells = within(row).getAllByRole("cell");
        expect(cells[2]).toHaveClass("px-1.5", "md:px-4");
        expect(within(cells[2]).getByText("已生成")).toBeInTheDocument();
        expect(within(cells[2]).queryByText("3项")).not.toBeInTheDocument();
        expect(within(cells[2]).queryByText("3项提示")).not.toBeInTheDocument();
        expect(cells).toHaveLength(5);
        expect(within(row).queryByText("用例模型")).not.toBeInTheDocument();
        expect(within(row).queryByText("领域概念模型")).not.toBeInTheDocument();
        expect(within(row).queryByText("界面关系")).not.toBeInTheDocument();
    });
    it("shows a rule's details from the view action without review states", async () => {
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                rules: [createRule({ id: "r11", text: "师生可以扫码报修设备故障。", relatedDiagrams: ["usecase"] })],
                requirementBaseline: createRequirementBaseline([
                    createAtomicRequirement({
                        id: "REQ-011",
                        sourceRuleId: "r11",
                        sourceFragment: "师生可以扫码报修设备故障。",
                        actor: "师生",
                        action: "扫码报修",
                        status: "pending-review",
                    }),
                ]),
            })),
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        const row = await screen.findByRole("row", { name: /r11/u });
        expect(within(row).getByText("已生成")).toBeInTheDocument();
        expect(within(row).queryByText("有待确认提示")).not.toBeInTheDocument();
        await user.click(within(row).getByRole("button", { name: "查看需求项 r11" }));
        const dialog = await screen.findByRole("dialog", { name: "需求规则详情" });
        expect(within(dialog).getByText("师生可以扫码报修设备故障。")).toBeInTheDocument();
        expect(within(dialog).getByText("扫码报修")).toBeInTheDocument();
        expect(within(dialog).queryByRole("button", { name: "智能修复" })).not.toBeInTheDocument();
    });
    it("creates a requirement rule from the add-rule dialog", async () => {
        const updateRequirementRules = vi.fn(async () => { });
        const existingRule = createRule({
            id: "r1",
            category: "业务规则",
            text: "游客可以查看公开活动。",
            relatedDiagrams: ["usecase"],
        });
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                rules: [existingRule],
                rulesVersion: 1,
                selectedDiagramTypes: ["usecase"],
            })),
            updateRequirementRules,
        });
        const user = userEvent.setup();
        render(withWorkspaceProviders(<TextRequirementView />, repository));
        await user.click(await screen.findByRole("button", { name: /新增需求项/ }));
        const dialog = await screen.findByRole("dialog", { name: "新增需求项" });
        const submitButton = within(dialog).getByRole("button", {
            name: "创建需求项",
        });
        expect(submitButton).toBeDisabled();
        await chooseSelectOption(user, within(dialog).getByRole("combobox"), "数据需求");
        // Related models are inferred from the type and text; the dialog no longer asks for them.
        expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
        await user.type(within(dialog).getByPlaceholderText("填写这条需求项的具体内容"), "系统必须保存活动报名记录。");
        await user.click(submitButton);
        await waitFor(() => {
            expect(updateRequirementRules).toHaveBeenLastCalledWith([
                existingRule,
                {
                    id: "r2",
                    category: "数据需求",
                    text: "系统必须保存活动报名记录。",
                    relatedDiagrams: ["class"],
                },
            ], expect.objectContaining({
                requirementInputFingerprint: expect.stringMatching(/^fp:v3:/),
                rulesBasedOnTextVersion: 0,
                rulesVersion: 2,
            }));
        });
        expect(screen.queryByRole("dialog", { name: "新增需求项" })).not.toBeInTheDocument();
        await waitFor(() => {
            const table = screen.getByRole("table");
            expect(within(table).getByText("r2")).toBeInTheDocument();
            expect(within(table).getByText("数据需求")).toBeInTheDocument();
            expect(within(table).getByDisplayValue("系统必须保存活动报名记录。")).toBeInTheDocument();
        });
    });
    it("keeps requirement authoring on the system requirements page only", async () => {
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "维修预约系统",
                rules: [createRule({ id: "R1", text: "客户可以预约维修。" })],
            })),
        });
        render(withWorkspaceProviders(<TextRequirementView view="system"/>, repository));
        expect(await screen.findByRole("heading", { name: "系统需求" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "系统业务需求" })).toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "系统业务需求" })).toHaveAccessibleDescription(/请描述谁使用系统/);
        const rulesToolbar = screen.getByTestId("requirement-rules-toolbar");
        expect(rulesToolbar).toHaveClass("min-w-0", "overflow-hidden");
        expect(rulesToolbar.firstElementChild?.firstElementChild).toHaveClass("min-w-0", "flex-nowrap");
        expect(within(rulesToolbar).queryByRole("heading", { name: /需求规则/u })).not.toBeInTheDocument();
        expect(within(rulesToolbar).getByPlaceholderText("搜索规则...")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "目标模型" })).not.toBeInTheDocument();
    });
    it("keeps requirement authoring controls off the requirement models page", async () => {
        const user = userEvent.setup();
        const requirementBaseline = createRequirementBaseline([
            createAtomicRequirement(),
        ]);
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "维修预约系统",
                rules: [createRule({ id: "R1", text: "客户可以预约维修。" })],
                requirementBaseline,
            })),
        });
        render(withWorkspaceProviders(<TextRequirementView view="models"/>, repository));
        expect(await screen.findByRole("heading", { name: "需求模型" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "目标模型" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "系统业务需求" })).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: /需求规则/u })).not.toBeInTheDocument();
        expect(screen.queryByText("请先确认需求规则修复结果")).not.toBeInTheDocument();
        const useCaseCard = screen.getByRole("button", { name: "选择用例模型" });
        expect(within(useCaseCard).queryByText("R1")).not.toBeInTheDocument();
        await user.click(within(useCaseCard).getByRole("button", {
            name: "查看用例模型关联需求规则",
        }));
        expect(screen.getByText("客户可以预约维修。")).toBeVisible();
        expect(screen.queryByRole("button", { name: "定位需求规则 R1" })).not.toBeInTheDocument();
    });
    it("opens the stale use-case model from requirement model guidance", async () => {
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "用户可以提交订单。",
                rules: [createRule({ relatedDiagrams: ["usecase", "analysis"] })],
                rulesVersion: 2,
                generatedDiagramTypes: ["usecase"],
                diagramVersions: { usecase: 1 },
                models: {
                    usecase: {
                        diagramKind: "usecase", title: "订单用例模型", summary: "用户提交订单。",
                        notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [],
                    },
                },
            })),
        });
        function SelectionProbe() {
            const { selection } = useWorkspaceShell();
            const { setSelectedDiagrams } = useWorkspaceSession();
            return <>
        <output data-testid="workspace-selection">{selection.kind === "diagram" ? selection.diagram : selection.kind}</output>
        <button onClick={() => setSelectedDiagrams(["analysis"])}>select analysis target</button>
      </>;
        }
        const user = userEvent.setup();
        render(withWorkspaceProviders(<><TextRequirementView view="models"/><SelectionProbe /></>, repository));
        await screen.findByRole("heading", { name: "需求模型" });
        await user.click(screen.getByRole("button", { name: "select analysis target" }));
        expect(screen.queryByText(/1 个模型需要更新/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "仅更新过时模型" })).not.toBeInTheDocument();
        await user.click(await screen.findByRole("button", { name: /需要处理/ }));
        const guidance = screen.getByRole("dialog", { name: "需求模型暂时无法生成" });
        expect(within(guidance).getByText(/1 个模型需要更新/)).toBeVisible();
        await user.click(within(guidance).getByRole("button", { name: "前往需求模型" }));
        expect(screen.getByTestId("workspace-selection")).toHaveTextContent("usecase");
    });
    it("removes the zero-rule card while allowing generation from existing requirement text", async () => {
        const user = userEvent.setup();
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "客户可以预约维修。",
                rules: [],
                selectedDiagramTypes: ["usecase"],
            })),
        });
        render(withWorkspaceProviders(<TextRequirementView view="models"/>, repository));
        expect(await screen.findByRole("heading", { name: "目标模型" })).toBeVisible();
        await act(async () => { });
        await user.click(screen.getByRole("button", { name: "选择用例模型" }));
        expect(screen.queryByText(/尚无有效需求规则/)).not.toBeInTheDocument();
        await waitFor(() => {
            expect(screen.queryByRole("button", { name: /有 \d+ 项需要处理/ })).not.toBeInTheDocument();
            expect(screen.getByRole("button", { name: "生成" })).toBeEnabled();
        });
    });
    it("opens a model-generation blocker only on request when its source is missing", async () => {
        const user = userEvent.setup();
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "",
                rules: [],
                selectedDiagramTypes: ["usecase"],
            })),
        });
        render(withWorkspaceProviders(<TextRequirementView view="models"/>, repository));
        await act(async () => { });
        const blocked = await screen.findByRole("button", { name: /有 1 项需要处理/ });
        expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
        expect(screen.queryByText(/尚无有效需求规则/)).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "需求模型暂时无法生成" })).not.toBeInTheDocument();
        await user.click(blocked);
        const dialog = await screen.findByRole("dialog", { name: "需求模型暂时无法生成" });
        expect(within(dialog).getByText(/请先输入需求描述或添加需求规则/)).toBeVisible();
        expect(within(dialog).getByRole("button", { name: "前往系统需求" })).toBeVisible();
    });
    it("does not show a guidance button when no target model is selected", async () => {
        const repository = createBaseRepository({
            loadWorkspace: vi.fn(async () => createWorkspaceRecord({
                requirementText: "客户可以预约维修。",
                rules: [],
                selectedDiagramTypes: [],
            })),
        });
        render(withWorkspaceProviders(<TextRequirementView view="models"/>, repository));
        expect(await screen.findByRole("heading", { name: "目标模型" })).toBeVisible();
        await act(async () => { });
        expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
        expect(screen.queryByRole("button", { name: /有 \d+ 项需要处理/ })).not.toBeInTheDocument();
    });
});
