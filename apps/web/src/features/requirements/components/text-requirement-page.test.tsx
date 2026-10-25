// Verifies requirement authoring, rule editing, quality checks, and generation action guards.
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { requestOpenRequirementRule } from "../../../shared/lib/app-navigation";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequirementBaseline } from "@uml-platform/contracts";
import { captureWorkspaceGuard } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository/index";
import {
  createRule,
  createRunSnapshot,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../../tests/helpers/workspace-test-utils";
import { snapshotInputFingerprint } from "../../../shared/lib/fingerprint";
import { TextRequirementView } from "./text-requirement-page";
import { createRenderMeta } from "../../../../tests/fixtures/contract-fixtures";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { useWorkspaceSession } from "../../workspace-session/state";

// Published source fixtures carry current receipts; tests can override a receipt to exercise staleness.
function createCurrentWorkspaceRecord(overrides: Parameters<typeof createWorkspaceRecord>[0] = {}) {
  const workspace = createWorkspaceRecord(overrides);
  const fingerprint = snapshotInputFingerprint({ requirementText: workspace.requirementText, rules: workspace.rules });
  return { ...workspace,
    requirementInputFingerprint: Object.hasOwn(overrides, "requirementInputFingerprint") ? workspace.requirementInputFingerprint : fingerprint,
    diagramInputFingerprints: {
      ...Object.fromEntries(Object.values(workspace.models).filter(Boolean).flatMap(model => [[model!.diagramKind, fingerprint], [model!.modelId ?? model!.diagramKind, fingerprint]])),
      ...workspace.diagramInputFingerprints,
    },
  };
}
function createCurrentMockWorkspaceRepository(seed: Parameters<typeof createWorkspaceRecord>[0] = {}) {
  return createMockWorkspaceRepository(createCurrentWorkspaceRecord(seed));
}

function storeManagedUserSettings() {
  localStorage.setItem(
    "uml-lab-settings",
    JSON.stringify({
      providerConfigId: "provider-config-1",
      defaultModel: "gpt-5.5",
      providerModelOptions: ["gpt-5.5"],
      autoGenerate: false,
      showStaleBanner: true,
    }),
  );
}

describe("TextRequirementView", () => {
  it("keeps usecase and analysis mutually exclusive in either selection order and in bulk selection", async () => {
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "用户提交订单", rules: [createRule({ type: "functional" })], selectedDiagramTypes: [],
      generatedDiagramTypes: ["usecase", "analysis"],
      models: { usecase: { diagramKind: "usecase", title: "订单用例", summary: "订单业务", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] },
        "analysis:order": { diagramKind: "analysis", modelId: "analysis:order", sourceUseCaseId: "order", sourceUseCaseName: "提交订单", title: "提交订单分析", summary: "业务交互", notes: [], participants: [], messages: [], fragments: [] } },
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));
    const usecase = await screen.findByRole("checkbox", { name: "用例模型" });
    const analysis = screen.getByRole("checkbox", { name: "需求分析模型" });
    const group = screen.getByRole("group", { name: "全选 / 全不选" });
    await user.click(usecase);
    expect(analysis).toHaveAttribute("aria-disabled", "true");
    await user.click(analysis);
    const analysisCard = screen.getByRole("button", { name: "选择需求分析模型" });
    act(() => analysisCard.focus());
    await user.keyboard("{Enter} ");
    expect(analysis).not.toBeChecked();
    expect(within(analysisCard).getByText(/上下游模型不能在同一批生成/)).toBeVisible();
    await user.click(usecase);
    await user.click(analysis);
    expect(usecase).toHaveAttribute("aria-disabled", "true");
    await user.click(within(group).getByRole("button", { name: "全选" }));
    expect(analysis).toBeChecked();
    expect(usecase).not.toBeChecked();
    await user.click(within(group).getByRole("button", { name: "全不选" }));
    await user.click(within(group).getByRole("button", { name: "全选" }));
    expect(usecase).toBeChecked();
    expect(analysis).not.toBeChecked();
  });

  it("blocks analysis without a saved usecase even after selecting usecase or selecting all", async () => {
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "用户可以提交订单", rules: [createRule({ type: "functional" })],
      selectedDiagramTypes: [], models: {}, generatedDiagramTypes: [],
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));
    const analysis = await screen.findByRole("checkbox", { name: "需求分析模型" });
    expect(analysis).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("img", { name: "缺少上游模型：用例模型，请先生成" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "用例模型" }));
    expect(analysis).toHaveAttribute("aria-disabled", "true");
    await user.click(analysis);
    expect(analysis).not.toBeChecked();
    await user.click(within(screen.getByRole("group", { name: "全选 / 全不选" })).getByRole("button", { name: "全选" }));
    expect(analysis).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "用例模型" })).toBeChecked();
  });

  it("blocks an externally supplied analysis selection and directs missing-upstream guidance to requirement models", async () => {
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "用户可以提交订单", rules: [createRule({ type: "functional" })],
      selectedDiagramTypes: ["analysis"], models: {}, generatedDiagramTypes: [],
    });
    repository.startRun = vi.fn();
    const user = userEvent.setup();
    function SelectionProbe() {
      const { setSelectedDiagrams } = useWorkspaceSession();
      return <button onClick={() => setSelectedDiagrams(["analysis"])}>select unavailable analysis</button>;
    }
    render(withWorkspaceProviders(<><TextRequirementView view="models" /><SelectionProbe /></>, repository));
    await screen.findByRole("heading", { name: "需求模型" });
    await user.click(screen.getByRole("button", { name: "select unavailable analysis" }));
    const generate = screen.getByRole("button", { name: "生成" });
    expect(generate).toBeDisabled();
    expect(screen.getByText("缺少上游模型：用例模型，请先生成")).toBeVisible();
    await user.click(generate);
    expect(repository.startRun).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /需要处理/ }));
    const guidance = screen.getByRole("dialog", { name: "需求模型暂时无法生成" });
    expect(within(guidance).getByRole("button", { name: "前往需求模型" })).toBeInTheDocument();
  });

  it("select all includes candidate-fed models but skips analysis with stale use-case events", async () => {
    const repository = createCurrentMockWorkspaceRepository({
      requirementText: "用户可以提交订单", rules: [createRule({  })],
      rulesVersion: 2, rulesBasedOnTextVersion: 0,
      generatedDiagramTypes: ["usecase"], diagramVersions: { usecase: 1 },
        diagramInputFingerprints: { usecase: "stale:previous-rule-input" },
      models: { usecase: { diagramKind: "usecase", title: "订单用例", summary: "订单业务", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] } },
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));
    const group = await screen.findByRole("group", { name: "全选 / 全不选" });
    await user.click(within(group).getByRole("button", { name: "全选" }));
    expect(screen.getByRole("checkbox", { name: "用例模型" })).toBeChecked();
    for (const label of ["需求分析模型"]) {
      const checkbox = screen.getByRole("checkbox", { name: label });
      expect(checkbox).toHaveAttribute("aria-disabled", "true");
      expect(checkbox).not.toBeChecked();
    }
  });

  it("blocks real rule generation without a model and leaves selection available", async () => {
    localStorage.clear();
    const repository = createCurrentMockWorkspaceRepository({ requirementText: "用户可以提交订单" });
    repository.getProjectAccess = async () => ({ capabilities: ["update_project", "start_runs"], generationExecutionMode: "provider" });
    repository.startRun = vi.fn();
    render(withWorkspaceProviders(<TextRequirementView view="system" />, repository));
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

  async function chooseSelectOption(
    user: ReturnType<typeof userEvent.setup>,
    combobox: HTMLElement,
    optionName: string,
  ) {
    await user.click(combobox);
    await user.click(await screen.findByRole("option", { name: optionName }));
  }

  function createBaseRepository(
    overrides: Partial<WorkspaceRepository> = {},
  ): WorkspaceRepository {
    return {
      loadWorkspace: vi.fn(async () => createCurrentWorkspaceRecord()),

      startRun: vi.fn(async () => ({ runId: "run-test" })),
      subscribeToRun: vi.fn(async () => {}),
      getRunSnapshot: vi.fn(async () => createRunSnapshot()),


      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

      ...overrides,
    };
  }

  function createBaselineRule(
    overrides: Partial<RequirementBaseline["rules"][number]> = {},
  ): RequirementBaseline["rules"][number] {
    return { requirementId: "REQ-001", id: "r1", text: "系统应允许用户提交订单。", sourceFragment: "系统应允许用户提交订单。", type: "functional" as const, ...overrides };
  }

  function createRequirementBaseline(
    requirements: RequirementBaseline["rules"][number][],
    overrides: Partial<RequirementBaseline> = {},
  ): RequirementBaseline {
    return {
      id: "baseline-test",
      version: 1,
      sourceInputFingerprint: "test-source-input",
      runId: "run-baseline",
      createdAt: "2026-05-27T00:00:00.000Z",
      schemaVersion: 3 as const,

      rules: (requirements),
      ...overrides,
    };
  }

  it("opens the rule named by a generation blocker even when the page mounts afterward", async () => {
    const rules = [
      createRule({ id: "r1", text: "系统应允许用户提交订单。" }),
      createRule({ id: "r2", text: "系统应显示公开活动。" }),
    ];
    const requirement = createBaselineRule({ requirementId: "REQ-002", id: "r2" });
    const baseline = createRequirementBaseline([requirement]);
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () => createCurrentWorkspaceRecord({
        rules, rulesVersion: 1, requirementBaseline: baseline,
      })),
    });
    act(() => requestOpenRequirementRule("r2"));
    render(withWorkspaceProviders(<TextRequirementView view="system" />, repository));
    const table = await screen.findByRole("table");
    await waitFor(() => expect(within(table).getByDisplayValue(rules[1]!.text)).toBeInTheDocument());
    expect(within(table).queryByDisplayValue(rules[0]!.text)).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("renders the empty state with an unsaved requirement draft", async () => {
    const updateRequirementText = vi.fn(async () => {});
    const repository = createBaseRepository({  });

    const user = userEvent.setup();
    const { container } = render(
      withWorkspaceProviders(<TextRequirementView />, repository),
    );

    const requirementInput = await screen.findByPlaceholderText(
      /^请描述谁使用系统[\s\S]*例如：师生登录后/u,
    );
    expect(screen.getByRole("heading", { name: "系统业务需求" }).closest('[data-slot="card"]')).not.toBeInTheDocument();
    expect(requirementInput).toBeInTheDocument();
    expect(requirementInput).toHaveValue("");
    const inputGuidance = screen.getByText("请描述谁使用系统、需要完成哪些功能，以及业务限制和异常处理。平台会先提取需求规则，再逐步生成模型、图表和说明书。");
    const attachmentGuidance = screen.getByText("支持上传 TXT、Markdown 文本附件；使用支持视觉的模型时，还可上传 PNG、JPEG、WebP 图片。");
    expect(attachmentGuidance).toBeVisible();
    expect(requirementInput).toHaveAttribute("placeholder", expect.stringMatching(/^请描述谁使用系统[\s\S]+\n\n例如：/u));

    expect(requirementInput).toHaveAttribute("aria-describedby", `${inputGuidance.id} ${attachmentGuidance.id}`);
    expect(screen.getByText("需求分析提取")).toBeInTheDocument();
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
    expect(
      screen.getAllByRole("img", { name: /请先添加或生成需求规则/ }).length,
    ).toBeGreaterThan(0);
    expect(
      container.querySelector(
        '[data-workspace-density="assistant-template-grid"]',
      ),
    ).not.toBeInTheDocument();
    const modelGrid = container.querySelector(
      '[data-workspace-density="compact-grid"]',
    );
    expect(modelGrid).toBeInTheDocument();

    await user.type(requirementInput, "创建一个订单系统");
    expect(requirementInput).toHaveValue("创建一个订单系统");
    expect(inputGuidance).toBeVisible();
    expect(attachmentGuidance).toBeVisible();
    expect(screen.getByText(/需求文本尚未保存到项目。/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "清空" })).not.toBeInTheDocument();
    expect(updateRequirementText).not.toHaveBeenCalled();
  });

  it("requires rules to be added even when source requirement text exists", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [],
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await screen.findByText("目标模型");
    expect(screen.queryByText(/将自动补齐：需求规则/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看领域概念模型自动补齐说明" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "领域概念模型缺少上游需求规则，请先添加或生成需求规则。" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "领域概念模型" })).toHaveAttribute("aria-disabled", "true");
  });

  it("starts a rules-only run through session actions", async () => {
    const startRun = vi.fn(async () => ({ runId: "run-rules" }));
    const subscribeToRun = vi.fn(
      async (
        _runId: string,
        onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1],
      ) => {
        onEvent({ type: "queued" });
        onEvent({
          type: "completed",
          snapshot: createRunSnapshot({
            runId: "run-rules",
            requirementText: "创建一个订单系统",
            rules: [createRule()],
          }),
        });
      },
    );
    const getRunSnapshot = vi.fn(async () =>
      createRunSnapshot({
        runId: "run-rules",
        requirementText: "创建一个订单系统",
        rules: [createRule()],
      }),
    );

    const repository = createBaseRepository({
      startRun,
      subscribeToRun,
      getRunSnapshot,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await user.type(
      await screen.findByPlaceholderText(
        /^请描述谁使用系统[\s\S]*例如：师生登录后/u,
      ),
      "创建一个订单系统",
    );
    await user.click(screen.getByRole("button", { name: "提取需求规则" }));

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          requirementText: "创建一个订单系统",
          selectedDiagrams: [],
        }),
      );
    });
    expect(
      await screen.findByRole("dialog", { name: "需求规则已生成" }),
    ).toBeInTheDocument();
    expect(screen.getByText("生成完成。")).toBeInTheDocument();
  });

  it("shows freshly extracted rules immediately when the saved source was normalized", async () => {
    const workspace = createCurrentWorkspaceRecord({ requirementText: "" });
    const rule = createRule({ text: "学生可以预约座位。" });
    const snapshot = createRunSnapshot({ runId: "normalized-page-rules", requirementText: rule.text, rules: [rule],
      outputManifest: [{ kind: "rule", id: rule.id }] });
    snapshot.workspaceGuard = captureWorkspaceGuard({ snapshot }, { ...workspace });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () => workspace),
      startRun: vi.fn(async () => ({ runId: snapshot.runId })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => { onEvent({ type: "completed", snapshot }); }),
      getRunSnapshot: vi.fn(async () => snapshot),
    });
    render(withWorkspaceProviders(<TextRequirementView view="system" />, repository));
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "系统业务需求" }), `  ${rule.text}  `);
    await user.click(screen.getByRole("button", { name: "提取需求规则" }));
    await screen.findByRole("dialog", { name: "需求规则已生成" });
    expect(screen.getByRole("table", { hidden: true })).toBeInTheDocument();
    expect(within(screen.getByRole("table", { hidden: true })).getByDisplayValue(rule.text)).toBeInTheDocument();
    expect(repository.loadWorkspace).toHaveBeenCalledTimes(1);
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
      loadWorkspace: vi.fn(async () => createCurrentWorkspaceRecord({ requirementText })),
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
    const subscribeToRun = vi.fn(
      async (
        _runId: string,
        onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1],
      ) => {
        const snapshot = createRunSnapshot({
          runId: "run-replace-rules",
          requirementText: "创建一个订单系统",
          rules: [createRule({ id: "r2", text: "系统应校验库存。" })],
        });
        onEvent({ type: "queued" });
        onEvent({ type: "completed", snapshot });
      },
    );
    const getRunSnapshot = vi.fn(async () =>
      createRunSnapshot({
        runId: "run-replace-rules",
        requirementText: "创建一个订单系统",
        rules: [createRule({ id: "r2", text: "系统应校验库存。" })],
      }),
    );
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [createRule({ id: "r1", text: "系统应允许提交订单。" })],
        }),
      ),
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
    await user.click(
      within(await screen.findByRole("dialog", { name: "确认替换需求规则" }))
        .getByRole("button", { name: "确认替换" }),
    );

    await waitFor(() => {
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          requirementText: "创建一个订单系统",
          selectedDiagrams: [],
        }),
      );
    });
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
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [createRule()],
          rulesVersion: 1,
          selectedDiagramTypes: ["usecase"],
        }),
      ),
      startRun,
      subscribeToRun: vi.fn(
        async (
          _runId: string,
          onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1],
        ) => {
          onEvent({ type: "queued" });
          onEvent({ type: "completed", snapshot });
        },
      ),
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
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedDiagrams: ["usecase"],
          rules: [createRule()],
        }),
      );
    });

    expect(screen.queryByText("SRS 摘要")).not.toBeInTheDocument();
    expect(screen.queryByText("模型结果")).not.toBeInTheDocument();
  });

  it("omits advanced trace proof controls even when requirement models have trace records", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [
            createRule({
              id: "r1",
              text: "普通读者可以查询自己借出的书目。",

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
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await screen.findByText("目标模型");
    expect(screen.queryByText("需求模型 AI 修复记录")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/需求规则 r1 需要解释其在用例模型中的覆盖关系/u),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /查看需求模型追踪证明/u })).not.toBeInTheDocument();
    expect(screen.queryByText("高级选项")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "需求模型追踪证明" })).not.toBeInTheDocument();
  });

  it("accepts candidate inputs without an existing model association", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [
            createRule({
              id: "r1",

            }),
          ],
          rulesVersion: 1,
          selectedDiagramTypes: ["class"],
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    expect(
      await screen.findByRole("checkbox", { name: /用例模型/ }),
    ).toBeEnabled();
    const classDiagramCheckbox = screen.getByRole("checkbox", {
      name: /领域概念模型/,
    });
    expect(classDiagramCheckbox).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(classDiagramCheckbox);
    expect(classDiagramCheckbox).toBeChecked();
    expect(screen.queryByRole("button", { name: "查看领域概念模型自动补齐说明" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "领域概念模型缺少上游需求规则，请先添加或生成需求规则。" })).not.toBeInTheDocument();
    expect(screen.getByText("1/7")).toBeInTheDocument();
  });

  it("blocks analysis selection without saved requirement rules", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
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
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const analysisCheckbox = await screen.findByRole("checkbox", {
      name: /需求分析模型/,
    });
    expect(analysisCheckbox).toHaveAttribute("aria-disabled", "true");
    await user.click(analysisCheckbox);
    expect(analysisCheckbox).not.toBeChecked();
    expect(screen.getAllByRole("img", { name: /请先添加或生成需求规则/ }).length).toBeGreaterThan(0);
  });

  it("labels only the new selected models, without untouched model counts", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [
            createRule({ id: "r1",  }),
            createRule({ id: "r2",  }),
            createRule({ id: "r3",  }),
          ],
          selectedDiagramTypes: ["activity"],
          generatedDiagramTypes: ["usecase", "class"],
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await user.click(
      await screen.findByRole("checkbox", { name: /总体业务流程/ }),
    );

    expect(
      await screen.findByRole("button", {
        name: "生成",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /移除/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps generated requirement models selectable while text edits remain a draft", async () => {
    const oldRequirementText = "用户可以提交订单。";
    const rule = createRule({
      id: "r1",
      text: "用户可以提交订单。",

    });
    const oldFingerprint = snapshotInputFingerprint({
      requirementText: oldRequirementText,
      rules: [rule],
    });
    const startRun = vi.fn(async () => ({ runId: "run-should-not-start" }));
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: oldRequirementText,
          rules: [rule],
          rulesVersion: 1,
          rulesBasedOnTextVersion: 0,
          requirementInputFingerprint: oldFingerprint,
          generatedDiagramTypes: ["usecase"],
          diagramInputFingerprints: { usecase: oldFingerprint },
          svgArtifacts: { usecase: { diagramKind: "usecase", svg: "<svg/>", renderMeta: createRenderMeta() } },
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
        }),
      ),
      startRun,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const sourceText = await screen.findByPlaceholderText(
      /^请描述谁使用系统[\s\S]*例如：师生登录后/u,
    );
    expect(screen.getByRole("img", { name: "用例模型：已生成" })).toBeInTheDocument();
    await user.click(sourceText);
    fireEvent.change(sourceText, { target: { value: oldRequirementText + "并支持退款。" } });
    expect(screen.getByRole("img", { name: "用例模型：已生成" })).toBeInTheDocument();

    expect(
      screen.getByText(/需求文本尚未保存到项目。/),
    ).toBeInTheDocument();
    const useCaseCheckbox = screen.getByRole("checkbox", { name: /用例模型/ });
    expect(useCaseCheckbox).toBeEnabled();

    await user.click(useCaseCheckbox);

    expect(useCaseCheckbox).toBeChecked();
    const generateButton = screen.getByRole("button", {
      name: "生成",
    });
    expect(generateButton).toBeDisabled();
    expect(generateButton).toHaveAttribute(
      "title",
      "需求文本有未提交的修改，请先生成需求规则。",
    );
    expect(startRun).not.toHaveBeenCalled();
    await user.click(sourceText);
    await user.keyboard("{Control>}z{/Control}");
    expect(sourceText).toHaveValue(oldRequirementText);
    expect(generateButton).toBeEnabled();
    expect(screen.getByRole("img", { name: "用例模型：已生成" })).toBeInTheDocument();
  });

  it("surfaces pending auto rule-mapping reviews on requirement model cards", async () => {
    const updateAutoGeneratedUpstreamReviews = vi.fn(async () => {});
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "校园失物招领需求",
          rules: [
            createRule({
              id: "r1",
              text: "管理员可以处理争议和查看审计日志。",

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
        }),
      ),
      updateAutoGeneratedUpstreamReviews,
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const deploymentCard = await screen.findByRole("button", {
      name: "选择部署需求模型",
    });
    expect(within(deploymentCard).getByText("待审")).toBeInTheDocument();
    expect(within(deploymentCard).queryByText(/部署需求模型规则映射/)).not.toBeInTheDocument();

    await user.click(
      within(deploymentCard).getByRole("button", {
        name: "查看部署需求模型自动补齐说明",
      }),
    );
    expect(await screen.findByText("部署需求模型规则映射")).toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "采纳部署需求模型自动补齐",
      }),
    );

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
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [
            createRule({
              id: "r1",
              text: "系统应提供订单提交能力。",
            }),
          ],
          requirementBaseline: {
      id: "baseline-test",
      version: 1,
      sourceInputFingerprint: "test-source-input",
            runId: "run-clean-rule",
            createdAt: "2026-05-24T00:00:00.000Z",
            schemaVersion: 3 as const,

      rules: ([
              { requirementId: "REQ-001", id: "r1", text: "系统应提供订单提交能力。", sourceFragment: "系统应提供订单提交能力。", type: "functional" as const },
            ]),
          },
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const row = await screen.findByRole("row", {
      name: /系统应提供订单提交能力/u,
    });
    expect(within(row).queryByText(/用例模型/)).not.toBeInTheDocument();
    expect(
      within(row).queryByRole("button", { name: /查看需求提示详情/u }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "需求规则修复确认" }),
    ).not.toBeInTheDocument();
  });

  it.each([false, true])("toggles the whole model card without navigation, generated=%s", async (generated) => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [
            createRule({
              id: "r1",

            }),
          ],
          rulesVersion: 1,
          generatedDiagramTypes: generated ? ["usecase"] : [],
          models: generated ? { usecase: { diagramKind: "usecase", title: "用例模型", summary: "订单用例", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] } } : {},
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const useCaseCheckbox = await screen.findByRole("checkbox", {
      name: /用例模型/,
    });
    const useCaseCard = screen.getByRole("button", { name: "选择用例模型" });
    expect(within(useCaseCard).queryByRole("button", { name: /^打开/ })).not.toBeInTheDocument();
    expect(useCaseCheckbox).not.toBeChecked();

    const group = screen.getByRole("group", { name: "全选 / 全不选" });
    await user.click(within(group).getByRole("button", { name: "全选" }));
    expect(useCaseCheckbox).toBeChecked();
    await user.click(within(group).getByRole("button", { name: "全不选" }));
    expect(useCaseCheckbox).not.toBeChecked();

    await user.click(useCaseCard);

    expect(useCaseCheckbox).toBeChecked();

    await user.keyboard("{Enter}");

    expect(useCaseCheckbox).not.toBeChecked();
  });

  it("keeps target diagram cards blocked when no rules exist", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [],
          rulesVersion: 0,
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const classDiagramCheckbox = await screen.findByRole("checkbox", {
      name: /领域概念模型/,
    });
    expect(classDiagramCheckbox).toHaveAttribute("aria-disabled", "true");

    await user.click(screen.getByRole("button", { name: "选择领域概念模型" }));

    expect(classDiagramCheckbox).not.toBeChecked();
  });

  it("keeps rule id jumps from toggling target diagram selection", async () => {
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          rules: [
            createRule({
              id: "r1",

            }),
          ],
          rulesVersion: 1,
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const useCaseCheckbox = await screen.findByRole("checkbox", {
      name: /用例模型/,
    });
    const useCaseCard = screen.getByRole("button", { name: "选择用例模型" });
    expect(useCaseCheckbox).not.toBeChecked();
    expect(within(useCaseCard).queryByText("r1")).not.toBeInTheDocument();

    await user.click(
      within(useCaseCard).getByRole("button", {
        name: "查看用例模型关联需求规则",
      }),
    );
    await user.click(screen.getByRole("button", { name: "定位需求规则 r1" }));

    expect(useCaseCheckbox).not.toBeChecked();
  });

  it("allows correcting the type of an existing requirement rule", async () => {
    const updateRequirementRules = vi.fn(async () => {});
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          rules: [
            createRule({
              id: "r1",
              type: "quality" as const,
              text: "用户可以提交订单。",

            }),
          ],
          rulesVersion: 1,
        }),
      ),
      updateRequirementRules,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await chooseSelectOption(
      user,
      await screen.findByRole("combobox", { name: "需求类型 r1" }),
      "功能需求",
    );

    await waitFor(() => {
      expect(updateRequirementRules).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({
            id: "r1",
            type: "functional" as const,
          }),
        ],
        expect.objectContaining({
          requirementInputFingerprint: expect.stringMatching(/^fp:v3:/),
          rulesBasedOnTextVersion: 0,
          rulesVersion: 2,
        }),
      );
    });
  });

  it("keeps remaining rules as candidates after deleting a rule", async () => {
    const updateRequirementRules = vi.fn(async () => {});
    const usecaseRule = createRule({
      id: "r1",
      text: "用户可以提交订单。",

    });
    const classRule = createRule({
      id: "r2",
      text: "系统必须保存订单实体。",

    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [usecaseRule, classRule],
          rulesVersion: 1,
          selectedDiagramTypes: ["class"],
        }),
      ),
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
      expect(updateRequirementRules).toHaveBeenLastCalledWith(
        [usecaseRule],
        expect.objectContaining({
          requirementInputFingerprint: expect.stringMatching(/^fp:v3:/),
          rulesBasedOnTextVersion: 0,
          rulesVersion: 2,
        }),
      );
      expect(classDiagramCheckbox).toBeChecked();
      expect(classDiagramCheckbox).not.toHaveAttribute("aria-disabled", "true");
    });
    expect(screen.queryByRole("button", { name: "查看领域概念模型自动补齐说明" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "领域概念模型缺少上游需求规则，请先添加或生成需求规则。" })).not.toBeInTheDocument();
  });

  it("shows the rule table immediately after first extraction from an unpersisted empty project", async () => {
    const rule = createRule({ id: "first-rule", text: "用户可以提交订单。" });
    const snapshot = createRunSnapshot({ runId: "first-project-rules", requirementText: rule.text, rules: [rule],
      outputManifest: [{ kind: "rule", id: rule.id }] });
    // The server has no workspace fields yet; the browser hydrates rules as [].
    snapshot.workspaceGuard = captureWorkspaceGuard({ snapshot }, {});
    const loadWorkspace = vi.fn(async () => createWorkspaceRecord());
    const repository = createBaseRepository({
      loadWorkspace,
      startRun: vi.fn(async () => ({ runId: snapshot.runId })),
      subscribeToRun: vi.fn(async (_runId, onEvent) => { onEvent({ type: "completed", snapshot }); }),
      getRunSnapshot: vi.fn(async () => snapshot),
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView view="system" />, repository));
    const input = await screen.findByRole("textbox", { name: "系统业务需求" });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.type(input, rule.text);
    await user.click(screen.getByRole("button", { name: "提取需求规则" }));
    await screen.findByRole("dialog", { name: "需求规则已生成" });
    const table = screen.getByRole("table", { hidden: true });
    expect(within(table).getByDisplayValue(rule.text)).toBeInTheDocument();
    expect(loadWorkspace).toHaveBeenCalledTimes(1);
    expect(repository.getRunSnapshot).not.toHaveBeenCalled();
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
      subscribeToRun: vi.fn(
        async (
          _runId: string,
          onEvent: Parameters<WorkspaceRepository["subscribeToRun"]>[1],
        ) => {
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
        },
      ),
      getRunSnapshot: vi.fn(async () => snapshot),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    await user.type(
      await screen.findByPlaceholderText(
        /^请描述谁使用系统[\s\S]*例如：师生登录后/u,
      ),
      "创建一个订单系统",
    );
    await user.click(screen.getByRole("button", { name: "提取需求规则" }));

    expect(await screen.findByRole("button", { name: "停止生成" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "提取需求规则" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "系统业务需求" })).toBeDisabled();
    expect(screen.queryByText("查看详情")).not.toBeInTheDocument();
    expect(screen.queryByText(/Run ID：/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/\{"rules":\[\{"id":"r1"\}\]/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("extract_rules 收到模型输出"),
    ).not.toBeInTheDocument();

    await act(async () => { completeRun(); });
    const completedDialog = await screen.findByRole("dialog", { name: "需求规则已生成" });
    await user.click(within(completedDialog).getByRole("button", { name: "我知道了" }));
    expect(await screen.findByRole("button", { name: "提取需求规则" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "系统业务需求" })).toBeEnabled();
  });

  it("renders requirement rules as an editable-text table", async () => {
    const updateRequirementRules = vi.fn(async () => {});
    const originalRule = createRule({
      id: "r1",
      type: "business-rule" as const,
      text: "用户必须登录后才能访问主要功能。",

    });
    const baselineRequirement = createBaselineRule({ requirementId: "REQ-001", id: originalRule.id, text: originalRule.text, sourceFragment: originalRule.text });
    const baseline = createRequirementBaseline([baselineRequirement]);
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          rules: [originalRule],
          rulesVersion: 1,
          requirementBaseline: baseline,

          selectedDiagramTypes: ["usecase"],
        }),
      ),
      updateRequirementRules,
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const table = await screen.findByRole("table");
    expect(screen.queryByText("AI 需求助手")).not.toBeInTheDocument();
    expect(screen.queryByText("探索与灵感")).not.toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "编号" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "类型" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", {
        name: "需求文本内容（可编辑）",
      }),
    ).toBeInTheDocument();
    expect(
      within(table).queryByRole("columnheader", { name: "相关图" }),
    ).not.toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "操作" }),
    ).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(within(table).queryByText("r1")).not.toBeInTheDocument();
    expect(within(table).getByText("业务规则")).toBeInTheDocument();
    expect(within(table).getAllByRole("columnheader").map(header => header.textContent)).toEqual([
      "编号", "类型", "需求文本内容（可编辑）", "操作",
    ]);
    expect(
      within(table).getByRole("combobox", { name: "需求类型 r1" }),
    ).toBeInTheDocument();
    expect(within(table).queryByRole("checkbox")).not.toBeInTheDocument();

    const textEditor = within(table).getByDisplayValue(
      "用户必须登录后才能访问主要功能。",
    ) as HTMLInputElement;
    expect(textEditor.tagName).toBe("INPUT");
    expect(textEditor.type).toBe("text");
    fireEvent.change(textEditor, { target: { value: "游客可以查看公开活动列表。" } });

    await waitFor(() => {
      expect(updateRequirementRules).toHaveBeenLastCalledWith(
        [
          {
            ...originalRule,
            text: "游客可以查看公开活动列表。",
          },
        ],
        expect.objectContaining({
          requirementInputFingerprint: expect.stringMatching(/^fp:v3:/),
          requirementBaseline: expect.objectContaining({
            id: expect.stringMatching(/^baseline:/),
            version: expect.any(Number),
            sourceInputFingerprint: expect.stringMatching(/^fp:v3:/),

            schemaVersion: 3,
            rules: [expect.objectContaining({ id: originalRule.id, text: "游客可以查看公开活动列表。" })],
          }),

          rulesBasedOnTextVersion: 0,
          rulesVersion: expect.any(Number),
        }),
      );
    });
    expect(within(table).queryByText("修复失败待重试")).not.toBeInTheDocument();
    expect(within(table).queryByText("有待确认提示")).not.toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "对应模型" })).not.toBeInTheDocument();
  });

  it("keeps requirement text editable on the same page as generated rules", async () => {
    const updateRequirementText = vi.fn(async () => {});
    const originalRule = createRule({
      id: "r1",
      text: "系统应提供订单提交能力。",

    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText: "创建一个订单系统",
          rules: [originalRule],
          rulesVersion: 1,
          rulesBasedOnTextVersion: 0,
          selectedDiagramTypes: ["usecase"],
        }),
      ),

    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    const sourceText = screen.getByPlaceholderText(
      /^请描述谁使用系统[\s\S]*例如：师生登录后/u,
    );
    // The composer synchronizes its runtime after the workspace has populated the rules table.
    await waitFor(() => expect(sourceText).toHaveValue("创建一个订单系统"));
    expect(
      screen.queryByRole("button", { name: "返回修改描述" }),
    ).not.toBeInTheDocument();

    await user.type(sourceText, "，并支持退款");
    expect(updateRequirementText).not.toHaveBeenCalled();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByText(/需求文本尚未保存到项目。/),
    ).toBeInTheDocument();
  });

  it("treats manual requirement rule edits as refreshed rules for model generation", async () => {
    const updateRequirementRules = vi.fn(async () => {});
    const requirementText = "订单系统需求";
    const originalRule = createRule({
      id: "r1",
      type: "functional" as const,
      text: "用户提交订单。",

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
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText,
          rules: [staleRule],
          selectedDiagramTypes: [],
          rulesVersion: 4,
          rulesBasedOnTextVersion: 0,
          requirementInputFingerprint: snapshotInputFingerprint({
            requirementText,
            rules: [originalRule],
          }),
        }),
      ),
      updateRequirementRules,
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const table = await screen.findByRole("table");
    expect(
      screen.getByText("需求规则或复核结果已变化，下游模型可能需要更新。"),
    ).toBeInTheDocument();

    const ruleEditor = within(table).getByDisplayValue(staleRule.text);
    fireEvent.change(ruleEditor, { target: { value: editedRule.text } });

    const editedFingerprint = snapshotInputFingerprint({
      requirementText,
      rules: [editedRule],
    });
    await waitFor(() => {
      expect(updateRequirementRules).toHaveBeenLastCalledWith(
        [editedRule],
        expect.objectContaining({
          requirementInputFingerprint: editedFingerprint,
          rulesBasedOnTextVersion: 0,
          rulesVersion: expect.any(Number),
        }),
      );
    });
    expect(
      screen.queryByText("需求规则或复核结果已变化，下游模型可能需要更新。"),
    ).not.toBeInTheDocument();
    const useCaseCheckbox = screen.getByRole("checkbox", { name: /用例模型/ });
    expect(useCaseCheckbox).toBeEnabled();
    await user.click(useCaseCheckbox);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "生成" })).toBeEnabled();
    });
  });

  it("uses selectable page sizes and filters requirement rules by text and type", async () => {
    const rules = Array.from({ length: 26 }, (_, index) =>
      createRule({
        id: `persistent-source-rule-${index + 1}`,
        text: `规则 ${index + 1}`,
        type: index % 2 === 0 ? "business-rule" : "functional",

      }),
    );
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          rules,
          rulesVersion: 1,
          selectedDiagramTypes: ["usecase"],
        }),
      ),
    });

    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const table = await screen.findByRole("table");
    expect(within(table).getByDisplayValue("规则 1")).toBeInTheDocument();
    expect(within(table).getByDisplayValue("规则 10")).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "10" })).toBeInTheDocument();
    expect(within(table).queryByText(rules[0]!.id)).not.toBeInTheDocument();
    expect(within(table).queryByDisplayValue("规则 11")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("requirement-rule-row-slot")).toHaveLength(10);
    expect(screen.getByLabelText("1-10 / 26")).toBeInTheDocument();
    await chooseSelectOption(
      user,
      screen.getByRole("combobox", { name: "每页条数" }),
      "25",
    );
    expect(within(table).getByDisplayValue("规则 25")).toBeInTheDocument();
    expect(within(table).queryByDisplayValue("规则 26")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("requirement-rule-row-slot")).toHaveLength(25);
    expect(screen.getByLabelText("1-25 / 26")).toBeInTheDocument();

    await chooseSelectOption(
      user,
      screen.getByRole("combobox", { name: "每页条数" }),
      "10",
    );

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(within(table).queryByDisplayValue("规则 1")).not.toBeInTheDocument();
    expect(within(table).getByDisplayValue("规则 11")).toBeInTheDocument();
    expect(within(table).getByDisplayValue("规则 20")).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "11" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "20" })).toBeInTheDocument();
    expect(screen.getByLabelText("11-20 / 26")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("搜索规则..."), "26");
    expect(within(table).getByDisplayValue("规则 26")).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(within(table).queryByDisplayValue("规则 20")).not.toBeInTheDocument();
    expect(screen.getByLabelText("1-1 / 1")).toBeInTheDocument();
    expect(screen.getAllByTestId("requirement-rule-row-slot")).toHaveLength(10);

    await user.clear(screen.getByPlaceholderText("搜索规则..."));
    await chooseSelectOption(
      user,
      screen.getByRole("combobox", { name: "需求类型筛选" }),
      "功能需求",
    );
    expect(within(table).getByDisplayValue("规则 2")).toBeInTheDocument();
    expect(within(table).getByDisplayValue("规则 20")).toBeInTheDocument();
    expect(within(table).queryByDisplayValue("规则 1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("1-10 / 13")).toBeInTheDocument();
  });

  it("keeps generated requirement text and rules table constrained on mobile width", async () => {
    const rules = Array.from({ length: 5 }, (_, index) =>
      createRule({
        id: `r${index + 1}`,
        text: `此日历规则 ${index + 1} 用于验证移动端规则表完整缩放显示。`,
        type: index % 2 === 0 ? "business-rule" : "functional",

      }),
    );
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          requirementText:
            "此日历仅供公众使用，而非个人日历。此日历用于显示面向公众的活动安排。",
          rules,
          rulesVersion: 1,
          selectedDiagramTypes: ["usecase"],
        }),
      ),
    });

    render(
withWorkspaceProviders(<TextRequirementView />,repository)
);

    const table = await screen.findByTestId("requirement-rules-compact-table");
    expect(
      within(table).queryByRole("columnheader", { name: "对应模型" }),
    ).not.toBeInTheDocument();
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    const placeholderRows = table.querySelectorAll('tr[aria-hidden="true"]');
    expect(placeholderRows.length).toBeGreaterThan(0);
    for (const row of placeholderRows) {
      expect(within(row as HTMLElement).getByRole("cell", { hidden: true })).toHaveAttribute("colspan", "4");
    }
    expect(
      within(table).getByRole("columnheader", {
        name: "需求文本内容（可编辑）",
      }),
    ).toBeInTheDocument();
    expect(table).toBeInTheDocument();
  });

  it("keeps rule rows compact without status or related model cells", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          rules: [
            createRule({
              id: "r10",
              text: "普通读者只能使用查找自己已借出书目的功能。",

            }),
          ],
          requirementBaseline: {
      id: "baseline-test",
      version: 1,
      sourceInputFingerprint: "test-source-input",
            runId: "run-compact-rule-row",
            createdAt: "2026-05-24T00:00:00.000Z",
            schemaVersion: 3 as const,

      rules: ([
              { requirementId: "REQ-010", id: "r10", text: "普通读者只能使用查找自己已借出书目的功能。", sourceFragment: "普通读者只能使用查找自己已借出书目的功能。", type: "functional" as const },
            ]),
          },
        }),
      ),
    });

    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const row = await screen.findByRole("row", {
      name: /普通读者只能使用查找自己已借出书目的功能/u,
    });
    const cells = within(row).getAllByRole("cell");
    expect(within(cells[2]).getByRole("textbox")).toHaveValue("普通读者只能使用查找自己已借出书目的功能。");
    expect(within(cells[2]).queryByText("3项")).not.toBeInTheDocument();
    expect(within(cells[2]).queryByText("3项提示")).not.toBeInTheDocument();

    expect(cells).toHaveLength(4);
    expect(within(row).queryByText(/用例模型/)).not.toBeInTheDocument();
    expect(within(row).queryByText("领域概念模型")).not.toBeInTheDocument();
    expect(within(row).queryByText("界面关系")).not.toBeInTheDocument();
  });

  it("shows a rule's details from the view action without review states", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          rules: [createRule({ id: "r11", text: "师生可以扫码报修设备故障。",  })],
          requirementBaseline: createRequirementBaseline([
            createBaselineRule({ requirementId: "REQ-011", id: "r11", text: "师生可以扫码报修设备故障。", sourceFragment: "师生可以扫码报修设备故障。" }),
          ]),
        }),
      ),
    });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TextRequirementView />, repository));

    const row = await screen.findByRole("row", { name: /师生可以扫码报修设备故障/u });
    expect(within(row).queryByText(/用例模型/)).not.toBeInTheDocument();
    expect(within(row).queryByText("有待确认提示")).not.toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "查看需求项 r11" }));
    const dialog = await screen.findByRole("dialog", { name: "需求规则详情" });
    expect(within(dialog).getByText("师生可以扫码报修设备故障。")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "需求类型" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "智能修复" })).not.toBeInTheDocument();
  });

  it("creates a requirement rule from the add-rule dialog", async () => {
    const updateRequirementRules = vi.fn(async () => {});
    const existingRule = createRule({
      id: "r1",
      type: "business-rule" as const,
      text: "游客可以查看公开活动。",

    });
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () =>
        createCurrentWorkspaceRecord({
          rules: [existingRule],
          rulesVersion: 1,
          selectedDiagramTypes: ["usecase"],
        }),
      ),
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

    await chooseSelectOption(
      user,
      within(dialog).getByRole("combobox", { name: "需求类型" }),
      "功能需求",
    );
    await chooseSelectOption(user, within(dialog).getByRole("combobox", { name: "需求类型" }), "数据需求");
    await user.type(
      within(dialog).getByPlaceholderText("填写这条需求项的具体内容"),
      "系统必须保存活动报名记录。",
    );
    await user.click(submitButton);

    await waitFor(() => {
      expect(updateRequirementRules).toHaveBeenLastCalledWith(
        [
          existingRule,
          {
            id: "r2",

            type: "data" as const,
            text: "系统必须保存活动报名记录。",

          },
        ],
        expect.objectContaining({
          requirementInputFingerprint: expect.stringMatching(/^fp:v3:/),
          rulesBasedOnTextVersion: 0,
          rulesVersion: 2,
        }),
      );
    });
    expect(
      screen.queryByRole("dialog", { name: "新增需求项" }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      const table = screen.getByRole("table");
      expect(within(table).getByRole("cell", { name: "2" })).toBeInTheDocument();
      expect(within(table).getByText("数据需求")).toBeInTheDocument();
      expect(
        within(table).getByDisplayValue("系统必须保存活动报名记录。"),
      ).toBeInTheDocument();
    });
  });

  it("keeps requirement authoring on the system requirements page only", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () => createCurrentWorkspaceRecord({
        requirementText: "维修预约系统",
        rules: [createRule({ id: "R1", text: "客户可以预约维修。" })],
      })),
    });
    render(withWorkspaceProviders(<TextRequirementView view="system" />, repository));
    expect(await screen.findByRole("heading", { name: "系统需求" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "系统业务需求" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "系统业务需求" })).toHaveAccessibleDescription(/请描述谁使用系统/);
    const rulesToolbar = screen.getByTestId("requirement-rules-toolbar");
    expect(within(rulesToolbar).queryByRole("heading", { name: /需求规则/u })).not.toBeInTheDocument();
    expect(within(rulesToolbar).getByPlaceholderText("搜索规则...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "目标模型" })).not.toBeInTheDocument();
  });

  it("keeps requirement authoring controls off the requirement models page", async () => {
    const user = userEvent.setup();
    const requirementBaseline = createRequirementBaseline([
      createBaselineRule(),
    ]);
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () => createCurrentWorkspaceRecord({
        requirementText: "维修预约系统",
        rules: [createRule({ id: "R1", text: "客户可以预约维修。" })],
        requirementBaseline,
      })),
    });
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));
    expect(await screen.findByRole("heading", { name: "需求模型" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "目标模型" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "系统业务需求" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /需求规则/u })).not.toBeInTheDocument();
    expect(screen.queryByText("请先确认需求规则修复结果")).not.toBeInTheDocument();
    const useCaseCard = screen.getByRole("button", { name: "选择用例模型" });
    expect(within(useCaseCard).queryByText("R1")).not.toBeInTheDocument();
    expect(within(useCaseCard).queryByText(/固定关联/)).not.toBeInTheDocument();
    await user.click(
      within(useCaseCard).getByRole("button", {
        name: "查看用例模型关联需求规则",
      }),
    );
    expect(screen.getByText("客户可以预约维修。")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "定位需求规则 R1" }),
    ).not.toBeInTheDocument();
  });

  it("opens the stale use-case model from requirement model guidance", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () => createCurrentWorkspaceRecord({
        requirementText: "用户可以提交订单。",
        rules: [createRule({  })],
        rulesVersion: 2,
        generatedDiagramTypes: ["usecase"],
        diagramVersions: { usecase: 1 },
        diagramInputFingerprints: { usecase: "stale:previous-rule-input" },
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
        <output data-testid="workspace-selection">{
          selection.kind === "diagram" ? selection.diagram : selection.kind
        }</output>
        <button onClick={() => setSelectedDiagrams(["analysis"])}>select analysis target</button>
      </>;
    }
    const user = userEvent.setup();
    render(withWorkspaceProviders(<><TextRequirementView view="models" /><SelectionProbe /></>, repository));
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

  it("requires saved rules before generating models from existing requirement text", async () => {
    const user = userEvent.setup();
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () => createCurrentWorkspaceRecord({
        requirementText: "客户可以预约维修。",
        rules: [],
        selectedDiagramTypes: ["usecase"],
      })),
    });
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));

    expect(await screen.findByRole("heading", { name: "目标模型" })).toBeVisible();
    await act(async () => {});
    await user.click(screen.getByRole("button", { name: "选择用例模型" }));
    expect(screen.queryByText(/尚无有效需求规则/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
    expect(screen.getAllByRole("img", { name: /请先添加或生成需求规则/ }).length).toBeGreaterThan(0);
  });

  it("opens a model-generation blocker only on request when its source is missing", async () => {
    const user = userEvent.setup();
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () => createCurrentWorkspaceRecord({
        requirementText: "",
        rules: [],
        selectedDiagramTypes: ["usecase"],
      })),
    });
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));

    await act(async () => {});
    const blocked = await screen.findByRole("button", { name: /有 1 项需要处理/ });
    expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
    expect(screen.queryByText(/尚无有效需求规则/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "需求模型暂时无法生成" })).not.toBeInTheDocument();
    await user.click(blocked);
    const dialog = await screen.findByRole("dialog", { name: "需求模型暂时无法生成" });
    expect(within(dialog).getByText(/请先添加或生成需求规则/)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "前往系统需求" })).toBeVisible();
  });

  it("does not show a guidance button when no target model is selected", async () => {
    const repository = createBaseRepository({
      loadWorkspace: vi.fn(async () => createCurrentWorkspaceRecord({
        requirementText: "客户可以预约维修。",
        rules: [],
        selectedDiagramTypes: [],
      })),
    });
    render(withWorkspaceProviders(<TextRequirementView view="models" />, repository));

    expect(await screen.findByRole("heading", { name: "目标模型" })).toBeVisible();
    await act(async () => {});
    expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /有 \d+ 项需要处理/ })).not.toBeInTheDocument();
  });
});
