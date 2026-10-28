// Verifies diagram detail editing, rerendering, trace highlighting, and export interactions.
import { createRenderMeta } from "@test/fixtures/contract-fixtures";
import { snapshotInputFingerprint, tableDiagramSpecSchema } from "@uml-platform/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository/index";
import {
  createBusinessFlowArtifact,
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../../tests/helpers/workspace-test-utils";
import { BusinessFlowDiagramView, ContextDiagramView, DesignDiagramView, DiagramView } from "./diagram-detail-page";

// Problem categories are collapsed by default; inspect their content after expanding them.
function expandCheckRecord(scope: HTMLElement) {
  scope.querySelectorAll('[data-slot="collapsible-trigger"][aria-expanded="false"]').forEach((trigger) => {
    fireEvent.click(trigger);
  });
  scope.querySelectorAll("details").forEach((details) => {
    (details as HTMLDetailsElement).open = true;
  });
}

const { toastMessage, toastError } = vi.hoisted(() => ({
  toastMessage: vi.fn(),
  toastError: vi.fn(),
}));
const { downloadTextFileMock } = vi.hoisted(() => ({
  downloadTextFileMock: vi.fn(),
}));

vi.mock("../../../shared/ui/floating-alert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/ui/floating-alert")>();
  return { ...actual, floatingAlert: {
    ...actual.floatingAlert,
    message: toastMessage,
    error: toastError,
    success: vi.fn(),
  } };
});

vi.mock("../../../shared/lib/download", () => ({
  downloadTextFile: downloadTextFileMock,
}));

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") {
    return blob.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Failed to read blob")));
    reader.readAsText(blob);
  });
}

describe("DiagramView", () => {
  beforeEach(() => {
    toastMessage.mockClear();
    toastError.mockClear();
    downloadTextFileMock.mockClear();
  });

  function createRepository(
    workspace = createWorkspaceRecord(),
  ): WorkspaceRepository {
    return {
      loadWorkspace: vi.fn(async () => workspace),

      startRun: vi.fn(),
      subscribeToRun: vi.fn(),
      getRunSnapshot: vi.fn(),

      renderStructuredModel: vi.fn(async (model) => ({
        plantUmlSource: `@startuml\n' ${model.title}\n@enduml`,
        svg: `<svg><text>${model.diagramKind}</text></svg>`,
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: model.title.length,
          durationMs: 1,
        },
      })),
      saveRequirementModelEdit: vi.fn(async () => {}),
      saveDesignModelEdit: vi.fn(async () => {}),
      saveManualModelRerender: vi.fn(async () => {}),

      saveRunHistory: vi.fn(),
      listRunHistory: vi.fn(async () => []),
      deleteRunHistory: vi.fn(async () => []),

    };
  }

  async function selectComboboxOption(
    scope: HTMLElement,
    label: string,
    optionName: string,
  ) {
    await userEvent.click(within(scope).getByRole("combobox", { name: label }));
    await userEvent.click(await screen.findByRole("option", { name: optionName }));
  }

  function stubCompactViewport(matches: boolean) {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
      })),
    });
    return () => {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    };
  }

  it("shows a generation error in the notice dialog when a diagram has no SVG", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
          generatedDiagramTypes: ["activity"],
          diagramErrors: {
            activity: {
              stage: "render_svg",
              error: {
                code: "RUN_RENDER_FAILED",
                message: "PlantUML repair failed for activity: Syntax Error?",
                category: "render",
                retryable: true,
              },
            },
          },
        }),
    );

    render(withWorkspaceProviders(<DiagramView type="activity" />, repository));

    const noticeButton = await screen.findByRole("button", { name: /提示（\d+）/ });
    const heading = screen.getByRole("heading", { name: "总体业务流程", level: 1 });
    expect(heading.parentElement).toContainElement(noticeButton);
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByText("总体业务流程 生成失败")).not.toBeInTheDocument();
    await userEvent.click(noticeButton);
    const notice = await screen.findByRole("dialog", { name: "模型提示" });
    expect(within(notice).getByText("总体业务流程 生成失败")).toBeInTheDocument();
    expect(
      within(notice).getByText("图形渲染失败，请检查模型结果后重试。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/PlantUML repair failed|Syntax Error/u),
    ).not.toBeInTheDocument();
  });

  it.each([false, true])("shows saved visual summaries without requiring acceptance: confirmed=%s", async (confirmed) => {
    const workspace = createWorkspaceRecord({
      generatedDiagramTypes: ["usecase"],
      models: { usecase: {
        diagramKind: "usecase", title: "用例模型", summary: "用例模型", notes: [],
        actors: [], useCases: [], systemBoundaries: [], relationships: [],
      } },
      svgArtifacts: { usecase: {
        diagramKind: "usecase",
        svg: "<svg><text>ok</text></svg>",
        renderMeta: { engine: "plantuml", generatedAt: new Date().toISOString(), sourceLength: 1, durationMs: 1 },
      } },
      visualReviews: { "requirements:usecase": { findings: [{ id: "unreadable", modelId: "usecase", layer: "image", category: "check_execution", code: "unreadable", observation: "标签不可读", evidence: [], verification: "inconclusive", repairable: false }],
        status: "pending_review", issues: ["标签不可读", "连线交叉"], reason: "视觉检查仍有问题，请人工确认", attempts: 3, structureAttempts: 1, repairAttempts: 0, checkedAt: new Date().toISOString(), confirmedAt: confirmed ? new Date().toISOString() : undefined,
      } },
    });
    const repository = createRepository(workspace);

    const { unmount } = render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));
    const noticeButton = await screen.findByRole("button", { name: /提示（\d+）/ });
    const heading = screen.getByRole("heading", { name: "用例模型", level: 1 });
    expect(heading.parentElement).toContainElement(noticeButton);
    expect(heading.parentElement).toContainElement(screen.getByRole("button", { name: "编辑" }));
    expect(screen.queryByText("标签不可读")).not.toBeInTheDocument();
    await userEvent.click(noticeButton);
    const notice = await screen.findByRole("dialog", { name: "模型提示" });
    expandCheckRecord(notice);
    expect(within(notice).getByText("标签不可读")).toBeVisible();
    expect(within(notice).queryByText("连线交叉")).not.toBeInTheDocument();
    expect(within(notice).queryByRole("heading", { name: "检查未完成或异常（1）" })).not.toBeInTheDocument();
    expect(within(notice).queryByText(/结构核对.*次|图片检查.*次|纠错尝试.*次/)).not.toBeInTheDocument();
    expect(within(notice).queryByRole("button", { name: "确认当前图" })).not.toBeInTheDocument();
    expect(within(notice).getByText("视觉检查仍有问题，请人工确认")).toBeVisible();
    if (confirmed) expect(within(notice).getByText("内容已人工确认，原检查结论与结构问题仍保留。")).toBeVisible();

    const saved = await repository.loadWorkspace();
    expect(saved.visualReviews?.["requirements:usecase"]).toEqual(workspace.visualReviews?.["requirements:usecase"]);
    expect(Boolean(saved.visualReviews?.["requirements:usecase"].confirmedAt)).toBe(confirmed);
    unmount();
    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));
    await userEvent.click(await screen.findByRole("button", { name: /提示（\d+）/ }));
    const reopened = await screen.findByRole("dialog", { name: "模型提示" });
    expandCheckRecord(reopened);
    expect(within(reopened).getByText("视觉检查仍有问题，请人工确认")).toBeVisible();
  });

  it("hides the model notice button when the visual review has no problems", async () => {
    const repository = createRepository(createWorkspaceRecord({
      requirementText: "用户可以登录系统。",
      diagramInputFingerprints: { usecase: snapshotInputFingerprint({ requirementText: "用户可以登录系统。", rules: [] }) },
      generatedDiagramTypes: ["usecase"],
      models: { usecase: { diagramKind: "usecase", title: "用例模型", summary: "用例模型", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] } },
      svgArtifacts: { usecase: { diagramKind: "usecase", svg: "<svg />", renderMeta: { engine: "test", generatedAt: "now", sourceLength: 1, durationMs: 1 } } },
      visualReviews: { "requirements:usecase": { findings: [], status: "passed", issues: [], reason: "结构核对通过", attempts: 1, checkedAt: "check-passed" } },
    }));
    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));
    await screen.findByRole("button", { name: "编辑" });
    expect(screen.queryByRole("button", { name: /提示（\d+）/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "模型提示" })).not.toBeInTheDocument();
  });

  it("uses the same notice dialog in the compact model layout", async () => {
    const restoreViewport = stubCompactViewport(true);
    try {
      const repository = createRepository(createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        models: { usecase: { diagramKind: "usecase", title: "用例模型", summary: "用例模型", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] } },
        svgArtifacts: { usecase: { diagramKind: "usecase", svg: "<svg />", renderMeta: { engine: "test", generatedAt: "now", sourceLength: 1, durationMs: 1 } } },
        visualReviews: { "requirements:usecase": { findings: [{ id: "unreadable", modelId: "usecase", layer: "image", category: "check_execution", code: "unreadable", observation: "标签不可读", evidence: [], verification: "inconclusive", repairable: false }], status: "pending_review", issues: ["标签不可读"], reason: "请人工确认", attempts: 3, checkedAt: "check-mobile" } },
      }));
      render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));
      const button = await screen.findByRole("button", { name: /提示（\d+）/ });
      const heading = screen.getByRole("heading", { name: "用例模型", level: 1 });
      expect(heading.parentElement).toContainElement(button);
      expect(heading.parentElement).toContainElement(screen.getByRole("button", { name: "编辑" }));
      expect(screen.queryByText("标签不可读")).not.toBeInTheDocument();
      await userEvent.click(button);
      const notice = await screen.findByRole("dialog", { name: "模型提示" });
      expandCheckRecord(notice);
      expect(within(notice).getByText("请人工确认")).toBeVisible();
      expect(within(notice).getByText("标签不可读")).toBeVisible();
      expect(within(notice).queryByRole("button", { name: "确认当前图" })).not.toBeInTheDocument();
      expect(screen.queryByText(/手动修改会更新当前模型结构/)).not.toBeInTheDocument();
    } finally {
      restoreViewport();
    }
  });

  it("offers PlantUML export without exposing source tabs or inline source", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        rules: [
          createRule({
            id: "r1",
            text: "用户可以查看公开活动。",

          }),
        ],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg><text textLength="20" lengthAdjust="spacingAndGlyphs">ok</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    expect(await screen.findByText("预览")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /PlantUML/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/@startuml/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "下载" }));
    expect(await screen.findByRole("menuitem", { name: "PlantUML" })).toBeInTheDocument();
    expect(screen.queryByText("溯源·需求规则")).not.toBeInTheDocument();
    expect(screen.queryByText("用户可以查看公开活动。")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /JSON/i })).not.toBeInTheDocument();
  });

  it("shows structured model details before PlantUML and SVG are available", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例模型",
            summary: "公开活动日历用例",
            notes: [],
            actors: [{ responsibilities: [], id: "visitor", name: "未注册用户", actorType: "human" }],
            useCases: [
              {
                id: "uc_view_events",
                name: "查看活动安排",
                goal: "查看公开活动",
                preconditions: ["日历为公开日历"],
                postconditions: ["活动安排已展示"],
                supportingActorIds: [],
                eventFlows: [
                  {
                    flowType: "main",
                    id: "flow-main",
                    name: "基本事件流",
                    steps: [
                      {
                        order: 1,
                        actor: "actor",
                        actorAction: "打开公开日历",
                        systemAction: "显示活动列表",
                        expectedResult: "活动列表可见",
                      },
                    ],
                  },
                ],
              },
            ],
            systemBoundaries: [],
            relationships: [],
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    await waitFor(() => expect(screen.getByRole("heading", { name: "用例模型", level: 1 })).toBeInTheDocument());
    expect(screen.getByText("尚未生成 SVG")).toBeInTheDocument();
    const preview = screen.getByTestId("diagram-preview-section");
    expect(within(preview).queryByText("系统边界、角色与用例关系")).not.toBeInTheDocument();
    expect(within(preview).queryByText("PlantUML 源码尚未生成")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "下载" }));
    expect(await screen.findByRole("menuitem", { name: /PlantUML/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText(/尚未生成。请回到/)).not.toBeInTheDocument();
    expect(screen.getByText("查看活动安排")).toBeInTheDocument();
  });

  it("shows full use case event flow steps in the focused detail panel", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例模型",
            summary: "注册用户维护公开活动",
            notes: [],
            actors: [{ responsibilities: [], id: "registered_user", name: "注册用户", actorType: "human" }],
            useCases: [
              {
                id: "uc_edit_event",
                name: "编辑公开活动",
                goal: "注册用户可以维护公开活动",
                preconditions: ["用户已注册"],
                postconditions: ["活动信息已保存"],
                primaryActorId: "registered_user",
                supportingActorIds: [],
                eventFlows: [
                  {
                    id: "flow-main",
                    name: "主事件流",
                    flowType: "main",
                    trigger: "用户打开活动编辑页",
                    steps: [
                      {
                        order: 1,
                        actor: "actor",
                        actorAction: "填写活动标题和时间",
                        systemAction: "校验活动时间是否公开可见",
                        expectedResult: "活动草稿通过校验",
                        sourceRequirementId: "FR3",
                      },
                      {
                        order: 2,
                        actor: "system",
                        systemAction: "保存活动并刷新公开日历",
                        expectedResult: "公众可查看更新后的活动",
                        sourceRequirementId: "FR2",
                      },
                    ],
                  },
                  {
                    id: "flow-duplicate",
                    name: "信息重复",
                    flowType: "alternative",
                    condition: "活动时间与标题重复",
                    steps: [
                      {
                        order: 1,
                        actor: "system",
                        systemAction: "提示活动信息重复",
                        expectedResult: "用户停留在编辑页修改信息",
                        sourceRequirementId: "FR3",
                      },
                    ],
                  },
                ],
              },
            ],
            systemBoundaries: [],
            relationships: [],
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(
        <DiagramView
          type="usecase"
          highlightedElement={{ kind: "usecase", id: "uc_edit_event" }}
        />,
        repository,
      ),
    );

    expect(await screen.findByText("焦点元素")).toBeInTheDocument();
    expect(screen.getAllByText("主事件流").length).toBeGreaterThan(0);
    expect(screen.getByText("备选事件流 · 信息重复")).toBeInTheDocument();
    expect(screen.getByText("1. 填写活动标题和时间")).toBeInTheDocument();
    expect(screen.getByText("校验活动时间是否公开可见")).toBeInTheDocument();
    expect(screen.getByText("保存活动并刷新公开日历")).toBeInTheDocument();
    expect(screen.getByText("提示活动信息重复")).toBeInTheDocument();
    expect(screen.getAllByText("FR3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("注册用户").length).toBeGreaterThan(0);
    expect(screen.queryByText("registered_user")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭焦点" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回模型概览" })).not.toBeInTheDocument();
  });

  it("shows class attribute details and explicit missing localized names in the focus panel", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "订单领域对象",
            notes: [],
            classes: [
              {
                constraints: [],
                id: "cls_order",
                name: "Order",
                description: "订单聚合",
                classKind: "entity",
                attributes: [
                  {
                    name: "amount",
                    chineseName: "订单金额",
                    englishName: "amount",
                    type: "decimal",
                    visibility: "private",
                    constraints: [],
                  },
                  {
                    name: "createdAt",
                    type: "DateTime",
                    visibility: "private",
                    constraints: [],
                  },
                ],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [],
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(
        <DiagramView type="class" highlightedElement={{ kind: "class", id: "cls_order" }} />,
        repository,
      ),
    );

    const panel = await screen.findByRole("complementary", { name: "焦点元素详情" });
    expect(within(panel).getByText("属性明细")).toBeInTheDocument();
    expect(within(panel).getByText("2个")).toBeInTheDocument();
    expect(panel).toHaveTextContent("中文名称：未标明");
    expect(panel).toHaveTextContent("英文名称：Order");
    expect(panel).toHaveTextContent("名称：amount");
    expect(panel).toHaveTextContent("中文名称：订单金额");
    expect(panel).toHaveTextContent("类型：decimal");
    expect(panel).toHaveTextContent("名称：createdAt");
    expect(panel).toHaveTextContent("类型：DateTime");
    expect(panel).not.toHaveTextContent("属性:2个");
  });

  it("loads requirement diagram details by model id", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["analysis"],
        models: {
          "analysis:submit-order": {
            diagramKind: "analysis",
            modelId: "analysis:submit-order",
            sourceUseCaseId: "submit-order",
            sourceUseCaseName: "提交订单",
            title: "提交订单需求分析模型",
            summary: "提交订单事件流",
            notes: [],
            participants: [
              { id: "customer", name: "客户", participantType: "actor" },
            ],
            messages: [],
            fragments: [],
          },
        },
        plantUml: {
          "analysis:submit-order": "@startuml\nactor 客户\n@enduml",
        },
        svgArtifacts: {
          "analysis:submit-order": {
            diagramKind: "analysis",
            modelId: "analysis:submit-order",
            svg: "<svg><text>提交订单需求分析模型 SVG</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(
        <DiagramView type="analysis" modelId="analysis:submit-order" />,
        repository,
      ),
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "提交订单需求分析模型", level: 1 })).toBeInTheDocument());
    expect(screen.queryByText("来源：用例模型事件流（用例：提交订单）")).not.toBeInTheDocument();
    expect(screen.queryByText("来源：需求规则（未标明）")).not.toBeInTheDocument();
    expect(screen.getByText("提交订单需求分析模型 SVG")).toBeInTheDocument();
  });

  it("does not show requirement rule sources below the requirement model summary", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        rules: [
          createRule({
            id: "r1",
            text: "系统应管理图书信息。",

          }),
          createRule({
            id: "r2",
            text: "系统应维护读者借阅记录。",

          }),
          createRule({
            id: "r3",
            text: "系统应支持借出图书。",

          }),
        ],
        plantUml: {
          class: "@startuml\nclass Book\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "图书馆核心概念",
            notes: [],
            classes: [],
            interfaces: [],
            enums: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>class</text></svg>",
            renderMeta: createRenderMeta({ engine: "plantuml" }),
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    await waitFor(() => expect(screen.getByRole("heading", { name: "领域概念模型", level: 1 })).toBeInTheDocument());
    expect(screen.queryByText("来源：需求规则（R1、R2）")).not.toBeInTheDocument();
    expect(screen.queryByText("来源：需求规则（R1、R2、R3）")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新生成当前图" })).not.toBeInTheDocument();
  });

  it("does not show design model sources below the detail summary", async () => {
    const sequenceWithName = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["sequence"],
        designPlantUml: { "sequence:borrow": "@startuml\n@enduml" },
        designModels: {
          "sequence:borrow": {
            diagramKind: "sequence",
            modelId: "sequence:borrow",
            sourceUseCaseId: "uc_borrow",
            sourceUseCaseName: "借出图书",
            title: "借出图书用例实现设计",
            summary: "借出图书流程",
            notes: [],
            participants: [],
            messages: [],
            fragments: [],
          },
        },
        designSvgArtifacts: {
          "sequence:borrow": {
            diagramKind: "sequence",
            modelId: "sequence:borrow",
            svg: "<svg><text>borrow</text></svg>",
            renderMeta: createRenderMeta({ engine: "plantuml" }),
          },
        },
      }),
    );
    const namedView = render(
      withWorkspaceProviders(
        <DesignDiagramView type="sequence" modelId="sequence:borrow" />,
        sequenceWithName,
      ),
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "借出图书用例实现设计", level: 1 })).toBeInTheDocument());
    expect(screen.queryByText("来源：需求阶段用例模型事件流 + 需求分析模型（用例：借出图书）")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新生成当前图" })).not.toBeInTheDocument();
    namedView.unmount();

    const sequenceWithId = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["sequence"],
        designPlantUml: { "sequence:uc_only": "@startuml\n@enduml" },
        designModels: {
          "sequence:uc_only": {
            diagramKind: "sequence",
            modelId: "sequence:uc_only",
            sourceUseCaseId: "uc_only",
            title: "用例实现设计",
            summary: "无用例名",
            notes: [],
            participants: [],
            messages: [],
            fragments: [],
          },
        },
        designSvgArtifacts: {
          "sequence:uc_only": {
            diagramKind: "sequence",
            modelId: "sequence:uc_only",
            svg: "<svg><text>sequence</text></svg>",
            renderMeta: createRenderMeta({ engine: "plantuml" }),
          },
        },
      }),
    );
    const idView = render(
      withWorkspaceProviders(
        <DesignDiagramView type="sequence" modelId="sequence:uc_only" />,
        sequenceWithId,
      ),
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "用例实现设计", level: 1 })).toBeInTheDocument());
    expect(screen.queryByText("来源：需求阶段用例模型事件流 + 需求分析模型（用例ID：uc_only）")).not.toBeInTheDocument();
    idView.unmount();

    const sequenceWithoutUseCase = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["sequence"],
        designPlantUml: { sequence: "@startuml\n@enduml" },
        designModels: {
          sequence: {
            diagramKind: "sequence",
            sourceUseCaseId: "unavailable",
            title: "用例实现设计",
            summary: "缺少用例信息",
            notes: [],
            participants: [],
            messages: [],
            fragments: [],
          },
        },
        designSvgArtifacts: {
          sequence: {
            diagramKind: "sequence",
            svg: "<svg><text>sequence</text></svg>",
            renderMeta: createRenderMeta({ engine: "plantuml" }),
          },
        },
      }),
    );
    const missingView = render(
      withWorkspaceProviders(<DesignDiagramView type="sequence" />, sequenceWithoutUseCase),
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "用例实现设计", level: 1 })).toBeInTheDocument());
    expect(screen.queryByText("来源：需求阶段用例模型事件流 + 需求分析模型（具体用例未标明）")).not.toBeInTheDocument();
    missingView.unmount();

    const navigationRepository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["navigation"],
        designPlantUml: { navigation: "@startuml\n@enduml" },
        designModels: {
          navigation: {
            diagramKind: "navigation",
            title: "界面关系图",
            summary: "业务流程",
            notes: [],
            nodes: [],
            relationships: [],
          },
        },
        designSvgArtifacts: {
          navigation: {
            diagramKind: "navigation",
            svg: "<svg><text>navigation</text></svg>",
            renderMeta: createRenderMeta({ engine: "plantuml" }),
          },
        },
      }),
    );
    render(withWorkspaceProviders(<DesignDiagramView type="navigation" />, navigationRepository));

    await waitFor(() => expect(screen.getByRole("heading", { name: "界面关系图", level: 1 })).toBeInTheDocument());
    expect(screen.queryByText("来源：需求阶段原型界面关系 + 设计阶段用例实现设计")).not.toBeInTheDocument();
  });

  it("edits title and summary in a dialog, rerenders the design diagram, and shows a toast", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["class"],
        designPlantUml: { class: "@startuml\n@enduml" },
        designModels: {
          class: {
            diagramKind: "class",
            title: "设计类图",
            summary: "静态结构",
            notes: [],
            classes: [],
            interfaces: [],
            enums: [],
            relationships: [],
          },
        },
        designSvgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>class</text></svg>",
            renderMeta: createRenderMeta({ engine: "plantuml" }),
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DesignDiagramView type="class" />, repository));

    await screen.findByRole("heading", { name: "设计类图", level: 1 });
    expect(screen.queryByLabelText("模型标题")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "编辑" }));
    const dialog = await screen.findByRole("dialog", { name: "编辑模型信息" });
    const titleInput = within(dialog).getByLabelText("模型标题");
    const summaryInput = within(dialog).getByLabelText("模型摘要");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "图书馆设计类图");
    await userEvent.clear(summaryInput);
    await userEvent.type(summaryInput, "更新后的结构说明");
    expect(repository.saveDesignModelEdit).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(repository.saveDesignModelEdit).toHaveBeenCalledWith(
        "class",
        expect.objectContaining({
          title: "图书馆设计类图",
          summary: "更新后的结构说明",
        }),
        expect.objectContaining({ status: "dirty" }),
        expect.objectContaining({ designModelTraceability: [] }),
      );
    }, { timeout: 2500 });
    expect(repository.renderStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "图书馆设计类图",
        summary: "更新后的结构说明",
      }),
     "design",);
    expect(toastMessage).toHaveBeenCalledWith("修改已保存，当前图已更新");
    expect(await screen.findByRole("heading", { name: "图书馆设计类图", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "编辑模型信息" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新生成当前图" })).not.toBeInTheDocument();
  });

  it("discards metadata edits when the dialog is cancelled", async () => {
    const repository = createRepository(createWorkspaceRecord({
      generatedDiagramTypes: ["usecase"],
      models: { usecase: { diagramKind: "usecase", title: "原标题", summary: "原描述", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] } },
      svgArtifacts: { usecase: { diagramKind: "usecase", svg: "<svg />", renderMeta: { engine: "test", generatedAt: "now", sourceLength: 1, durationMs: 1 } } },
    }));
    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));
    await userEvent.click(await screen.findByRole("button", { name: "编辑" }));
    const dialog = await screen.findByRole("dialog", { name: "编辑模型信息" });
    await userEvent.clear(within(dialog).getByLabelText("模型标题"));
    await userEvent.type(within(dialog).getByLabelText("模型标题"), "未保存标题");
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.getByRole("heading", { name: "原标题", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("原描述")).toBeInTheDocument();
    expect(repository.saveRequirementModelEdit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "编辑" }));
    expect(within(await screen.findByRole("dialog", { name: "编辑模型信息" })).getByLabelText("模型标题")).toHaveValue("原标题");
  });

  it("keeps model metadata read only without workspace edit permission", async () => {
    const repository = createRepository(createWorkspaceRecord({
      generatedDiagramTypes: ["usecase"],
      models: { usecase: { diagramKind: "usecase", title: "只读模型", summary: "只读描述", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] } },
      svgArtifacts: { usecase: { diagramKind: "usecase", svg: "<svg />", renderMeta: { engine: "test", generatedAt: "now", sourceLength: 1, durationMs: 1 } } },
    }));
    repository.getProjectAccess = vi.fn(async () => ({ capabilities: ["read_project"], generationExecutionMode: "provider" as const }));
    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));
    await waitFor(() => expect(repository.getProjectAccess).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("heading", { name: "只读模型", level: 1 })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("模型标题")).not.toBeInTheDocument();
  });

  it("keeps the editor open with its input when saving metadata fails", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["navigation"],
        designPlantUml: { navigation: "@startuml\n@enduml" },
        designModels: {
          navigation: {
            diagramKind: "navigation",
            title: "界面关系图",
            summary: "业务流程",
            notes: [],
            nodes: [],
            relationships: [],
          },
        },
        designSvgArtifacts: {
          navigation: {
            diagramKind: "navigation",
            svg: "<svg><text>navigation</text></svg>",
            renderMeta: createRenderMeta({ engine: "plantuml" }),
          },
        },
      }),
    );
    vi.mocked(repository.saveDesignModelEdit!).mockRejectedValueOnce(new Error("save failed"));

    render(withWorkspaceProviders(<DesignDiagramView type="navigation" />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "编辑" }));
    const dialog = await screen.findByRole("dialog", { name: "编辑模型信息" });
    await userEvent.clear(within(dialog).getByLabelText("模型摘要"));
    await userEvent.type(within(dialog).getByLabelText("模型摘要"), "失败时仍保留的摘要");
    await userEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("保存失败，请稍后重试");
    }, { timeout: 2500 });
    expect(within(dialog).getByLabelText("模型摘要")).toHaveValue("失败时仍保留的摘要");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("保存失败");
    expect(screen.getByRole("heading", { name: "界面关系图", level: 1, hidden: true })).toBeInTheDocument();
    expect(repository.renderStructuredModel).not.toHaveBeenCalled();
  });

  it("opens SVG preview through a blob URL and revokes it on unmount", async () => {
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      return "blob:diagram-preview";
    });
    const revokeObjectURL = vi.fn((objectUrl: string) => {
      expect(objectUrl).toMatch(/^blob:/);
    });
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: "<svg><text>ok</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    try {
      const { unmount } = render(
        withWorkspaceProviders(<DiagramView type="usecase" />, repository),
      );

      const link = await screen.findByRole("link", { name: /新标签/ });
      expect(link).toHaveAttribute("href", "blob:diagram-preview");
      expect(link.getAttribute("href")).not.toMatch(/^data:/);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
      const blobText = await readBlobText(blob);
      expect(blobText).toContain("<svg");
      expect(blobText).not.toContain("textLength");
      expect(blobText).not.toContain("lengthAdjust");

      unmount();

      expect(revokeObjectURL).toHaveBeenCalledWith("blob:diagram-preview");
    } finally {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectURL,
      });
    }
  });

  it("supports zooming generated SVG previews", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg width="200" height="120"><text>ok</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    expect(await screen.findByText("100%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "放大 SVG" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "缩小 SVG" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("opens and closes the model overview with Escape and its close action", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: {
          class: "@startuml\nclass Book\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "图书馆核心概念",
            notes: [],
            classes: [
              {
                constraints: [],
                id: "book",
                name: "Book",
                description: "图书",
                classKind: "entity",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [
              {
                id: "rel_book_user",
                type: "association",
                sourceId: "book",
                targetId: "book",
                label: "自关联",
              },
            ],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Book</text></svg>",
            renderMeta: createRenderMeta({ engine: "plantuml" }),
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));
    expect(screen.queryByRole("complementary", { name: "模型概览" })).not.toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "打开模型概览" }));
    const panel = await screen.findByRole("complementary", { name: "模型概览" });
    expect(within(panel).getByText("类")).toBeInTheDocument();
    expect(within(panel).getByText("关系")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("complementary", { name: "模型概览" })).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "打开模型概览" }));
    await userEvent.click(await screen.findByRole("button", { name: "关闭模型概览" }));
    expect(screen.queryByRole("complementary", { name: "模型概览" })).not.toBeInTheDocument();
  });

  it("uses a compact status rail and segmented detail entry points on mobile viewports", async () => {
    const restoreMatchMedia = stubCompactViewport(true);
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        models: {
          class: {
            notes: [],
            diagramKind: "class",
            title: "领域概念模型",
            summary: "公开日历领域对象",
            classes: [
              {
                constraints: [],
                id: "book",
                name: "Book",
                description: "图书",
                classKind: "entity",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: '<svg width="200" height="120"><text>Book</text></svg>',
            renderMeta: createRenderMeta({ engine: "plantuml" }),
          },
        },
      }),
    );

    try {
      const { container } = render(withWorkspaceProviders(<DiagramView type="class" />, repository));

      expect(await screen.findByTestId("diagram-preview-section")).toBeInTheDocument();
      expect(container.querySelector('[data-workspace-density="status-rail"]')).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "元素" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "关系" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "编辑" })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("搜索元素、属性或说明")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("tab", { name: "元素" }));
      expect(screen.getByPlaceholderText("搜索元素、属性或说明")).toBeInTheDocument();
      const mobileFilter = screen.getByRole("combobox", { name: "按元素类型筛选" });
      expect(mobileFilter).toHaveTextContent(/^全部类型▼?$/);
      await userEvent.click(mobileFilter);
      await userEvent.click(await screen.findByRole("option", { name: "类" }));
      expect(mobileFilter).toHaveTextContent(/^类▼?$/);

      await userEvent.click(screen.getByRole("tab", { name: "编辑" }));
      expect(screen.getByLabelText("元素清单工具栏")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("搜索关系、端点或说明")).toBeInTheDocument();
    } finally {
      restoreMatchMedia();
    }
  });

  it("downloads the same sanitized SVG markup used for preview", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg><text textLength="20" lengthAdjust="spacingAndGlyphs">ok</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "下载" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "SVG" }));

    expect(downloadTextFileMock).toHaveBeenCalledWith(
      "requirements-usecase.svg",
      expect.not.stringContaining("textLength"),
      "image/svg+xml",
    );
    expect(downloadTextFileMock.mock.calls[0]?.[1]).not.toContain("lengthAdjust");
  });

  it("downloads PlantUML source for the current diagram", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "下载" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "PlantUML" }));

    expect(downloadTextFileMock).toHaveBeenCalledWith(
      "requirements-usecase.puml",
      "@startuml\nactor 用户\n@enduml",
      "text/plain",
    );
  });

  it("zooms only the SVG canvas on ctrl wheel and prevents page zoom", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg width="200" height="120"><text>ok</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    const canvas = await screen.findByTestId("svg-preview-canvas");
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
    });

    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(screen.getByText("110%")).toBeInTheDocument();
    });
  });

  it("pans the SVG canvas by dragging it", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "核心用例",
            notes: [],
            actors: [],
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg width="2000" height="1200"><text>ok</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    const canvas = await screen.findByTestId("svg-preview-canvas");
    const viewport = canvas.firstElementChild as HTMLElement;

    const pointerEvent = (
      type: string,
      init: { button?: number; pointerId: number; clientX?: number; clientY?: number },
    ) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        button: { value: init.button ?? 0 },
        pointerId: { value: init.pointerId },
        clientX: { value: init.clientX ?? 0 },
        clientY: { value: init.clientY ?? 0 },
      });
      return event;
    };

    fireEvent(canvas, pointerEvent("pointerdown", { button: 0, pointerId: 1, clientX: 120, clientY: 90 }));
    fireEvent(canvas, pointerEvent("pointermove", { pointerId: 1, clientX: 90, clientY: 70 }));
    fireEvent(canvas, pointerEvent("pointerup", { pointerId: 1 }));

    expect(viewport.style.transform).toBe("translate(-30px, -20px)");
  });

  it("shows large diagrams directly without summary view controls", async () => {
    const actors = Array.from({ length: 33 }, (_, index) => ({
      id: `actor_${index}`,
      name: `Actor ${index}`,
      actorType: "human" as const,
      responsibilities: [],
    }));
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          usecase: "@startuml\nactor 用户\n@enduml",
        },
        models: {
          usecase: {
            diagramKind: "usecase",
            title: "用例图",
            summary: "大型用例图",
            notes: [],
            actors,
            useCases: [],
            systemBoundaries: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          usecase: {
            diagramKind: "usecase",
            svg: '<svg width="200" height="120"><text>large diagram</text></svg>',
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    expect(await screen.findByText("large diagram")).toBeInTheDocument();
    expect(screen.queryByText("摘要视图")).not.toBeInTheDocument();
    expect(screen.queryByText("完整视图")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "放大 SVG" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
  });

  it("shows editable elements and relation endpoints in the diagram page", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: {
          class: "@startuml\nclass Event\nclass Reminder\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "公开日历领域对象",
            notes: [],
            classes: [
              {
                constraints: [],
                id: "cls_event",
                name: "Event",
                description: "公开活动",
                classKind: "entity",

                attributes: [],
                operations: [],
              },
              {
                constraints: [],
                id: "cls_reminder",
                name: "Reminder",
                description: "提醒记录",
                classKind: "entity",

                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [
              {
                id: "rel_event_reminder",
                type: "association",
                sourceId: "cls_event",
                targetId: "cls_reminder",

                sourceRole: "event",
                targetRole: "reminders",
                sourceMultiplicity: "1",
                targetMultiplicity: "0..*",
                navigability: "bidirectional",
                description: "活动关联多个提醒记录。",
              },
            ],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Event</text><text>Reminder</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    const { container } = render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    await waitFor(() => expect(screen.getByRole("heading", { name: "领域概念模型", level: 1 })).toBeInTheDocument());
    expect(screen.getByText("公开日历领域对象")).toBeInTheDocument();
    expect(screen.queryByLabelText("模型标题")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /元素/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /关系/ })).not.toBeInTheDocument();
    expect(screen.queryByText("编辑模型")).not.toBeInTheDocument();

    expect(screen.getByText("元素清单")).toBeInTheDocument();
    const elementSearch = screen.getByLabelText("搜索元素");
    const elementFilterGroup = screen.getByRole("combobox", { name: "按元素类型筛选" });
    const addClassButton = screen.getByRole("button", { name: "添加" });
    expect(elementSearch).toBeInTheDocument();
    expect(elementSearch.compareDocumentPosition(elementFilterGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(elementFilterGroup.compareDocumentPosition(addClassButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(elementFilterGroup).toHaveTextContent(/^全部类型▼?$/);
    await userEvent.click(elementFilterGroup);
    expect(await screen.findByRole("option", { name: "类" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "模型结构编辑" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("类 cls_event 名称")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑类：Event" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除类：Event" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑类：Event" }).compareDocumentPosition(
        screen.getByRole("button", { name: "删除类：Event" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const eventCard = screen.getByRole("button", { name: "定位元素：Event" });
    expect(eventCard.closest("[data-slot='spotlight-card']")).toBeInTheDocument();
    expect(screen.queryByText(/个字段$/u)).not.toBeInTheDocument();
    await userEvent.click(eventCard);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "定位元素：Event" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    await waitFor(() => {
      expect(container.querySelector("text.pum-highlight")?.textContent).toBe("Event");
    });
    expect(screen.getByText("关系说明")).toBeInTheDocument();
    const relationSearch = screen.getByLabelText("搜索关系");
    const relationFilterGroup = screen.getByRole("combobox", { name: "按关系类型筛选" });
    const addRelationButton = screen.getByRole("button", { name: "添加关系" });
    expect(relationSearch).toBeInTheDocument();
    expect(relationSearch.compareDocumentPosition(relationFilterGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(relationFilterGroup.compareDocumentPosition(addRelationButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(relationFilterGroup).toHaveTextContent(/^全部关系▼?$/);
    await userEvent.click(relationFilterGroup);
    // Base UI mounts the portal asynchronously; inspect options once they are accessible.
    const relationOptions = await screen.findAllByRole("option");
    expect(relationOptions.every(option => !/\s\d+$/u.test(option.textContent ?? ""))).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(screen.getAllByText("活动关联多个提醒记录。").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("关系 rel_event_reminder 起点")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑关系：活动关联多个提醒记录。" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑关系：活动关联多个提醒记录。" }).closest("[data-slot='spotlight-card']"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除关系：活动关联多个提醒记录。" })).toBeInTheDocument();
    await userEvent.type(relationSearch, "不存在的关系");
    expect(screen.queryByRole("button", { name: "编辑关系：活动关联多个提醒记录。" })).not.toBeInTheDocument();
    await userEvent.clear(relationSearch);
    await userEvent.type(relationSearch, "Reminder");
    expect(screen.getByRole("button", { name: "编辑关系：活动关联多个提醒记录。" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "删除类：Event" }));
    const cancelDialog = await screen.findByRole("dialog", { name: /删除类/u });
    await userEvent.click(within(cancelDialog).getByRole("button", { name: "取消" }));
    expect(repository.renderStructuredModel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "删除关系：活动关联多个提醒记录。" }));
    const deleteDialog = await screen.findByRole("dialog", { name: /删除关系/u });
    await userEvent.click(within(deleteDialog).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(repository.renderStructuredModel).toHaveBeenCalled());
    expect(repository.renderStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({ relationships: [] }),
     "requirements",);
    expect(toastMessage).toHaveBeenCalledWith("修改已保存，当前图已更新");
  });

  it("preserves schema-valid edits without a later relationship acceptance gate", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "公开日历领域对象",
            notes: [],
            classes: [
              {
                constraints: [],
                id: "cls_event",
                name: "Event",
                classKind: "entity",
                attributes: [],
                operations: [],
              },
              {
                constraints: [],
                id: "cls_reminder",
                name: "Reminder",
                classKind: "entity",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [
              {
                id: "rel_event_reminder",
                type: "association",
                sourceId: "cls_event",
                targetId: "cls_reminder",
                label: "提醒",
              },
            ],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Event</text><text>Reminder</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));
    const saveRequirementModelEdit = vi.mocked(
      repository.saveRequirementModelEdit!,
    );
    const renderStructuredModel = vi.mocked(repository.renderStructuredModel!);

    await screen.findByRole("button", { name: "删除类：Event" });
    await userEvent.click(screen.getByRole("button", { name: "删除类：Event" }));
    const deleteDialog = await screen.findByRole("dialog", { name: /删除类/u });
    await userEvent.click(within(deleteDialog).getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(saveRequirementModelEdit).toHaveBeenCalled());
    await waitFor(() => expect(renderStructuredModel).toHaveBeenCalledWith(expect.objectContaining({
      classes: [expect.objectContaining({ id: "cls_reminder" })],
      relationships: [expect.objectContaining({ sourceId: "cls_event", targetId: "cls_reminder" })],
    }), "requirements"));
    expect(screen.queryByText(/关系端点不存在/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /删除关系：/ })).toBeInTheDocument();
  });

  it("opens add dialogs before creating elements or relations", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: {
          class: "@startuml\nclass Customer\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "客户领域对象",
            notes: [],
            classes: [
              {
                constraints: [],
                id: "cls_customer",
                name: "Customer",
                classKind: "entity",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Customer</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "添加" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "添加类" }));
    let dialog = await screen.findByRole("dialog", { name: /添加类/u });
    expect(dialog).toHaveAttribute("data-form-layout", "4");
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(repository.renderStructuredModel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "添加" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "添加类" }));
    dialog = await screen.findByRole("dialog", { name: /添加类/u });
    const classNameInput = within(dialog).getByLabelText("类名称");
    await userEvent.clear(classNameInput);
    await userEvent.type(classNameInput, "Invoice");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认添加" }));
    await waitFor(() => expect(repository.renderStructuredModel).toHaveBeenCalledTimes(1));
    expect(repository.renderStructuredModel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        classes: expect.arrayContaining([expect.objectContaining({ name: "Invoice" })]),
      }),
     "requirements",);

    await userEvent.click(screen.getByRole("button", { name: "添加关系" }));
    dialog = await screen.findByRole("dialog", { name: /添加关系/u });
    expect(dialog).toHaveAttribute("data-form-layout", "6");
    expect(dialog.querySelector("select")).toBeNull();
    expect(within(dialog).getByRole("combobox", { name: "起点" })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "终点" })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "类型" })).toBeInTheDocument();
    const relationNameInput = within(dialog).getByLabelText("关系名称");
    await userEvent.clear(relationNameInput);
    await userEvent.type(relationNameInput, "关联发票");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认添加" }));
    await waitFor(() => expect(repository.renderStructuredModel).toHaveBeenCalledTimes(2));
    expect(repository.renderStructuredModel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        relationships: expect.arrayContaining([expect.objectContaining({ label: "关联发票" })]),
      }),
     "requirements",);
    expect(toastMessage).toHaveBeenCalledWith("修改已保存，当前图已更新");
  });

  it("keeps edited element draft visible and shows a toast when rerender fails", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: {
          class: "@startuml\nclass Customer\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "客户领域对象",
            notes: [],
            classes: [
              {
                constraints: [],
                id: "cls_customer",
                name: "Customer",
                classKind: "entity",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Customer</text></svg>",
            renderMeta: createRenderMeta({ engine: "plantuml" }),
          },
        },
      }),
    );
    vi.mocked(repository.renderStructuredModel!).mockRejectedValueOnce(new Error("render failed"));

    render(withWorkspaceProviders(<DiagramView type="class" />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "编辑类：Customer" }));
    const dialog = await screen.findByRole("dialog", { name: /编辑类/u });
    await userEvent.clear(within(dialog).getByLabelText("类名称"));
    await userEvent.type(within(dialog).getByLabelText("类名称"), "Client");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("保存失败，请稍后重试");
    });
    expect(await screen.findByRole("button", { name: "定位元素：Client" })).toBeInTheDocument();
  });

  it.each(["usecase", "usecase-home-security"])("edits and rerenders the use case model stored under %s", async (modelKey) => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["usecase"],
        plantUml: {
          [modelKey]: "@startuml\nactor 教师\n@enduml",
        },
        models: {
          [modelKey]: {
            diagramKind: "usecase",
            modelId: modelKey,
            title: "用例图",
            summary: "教师登录系统",
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
          },
        },
        svgArtifacts: {
          [modelKey]: {
            diagramKind: "usecase",
            svg: "<svg><text>教师</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DiagramView type="usecase" />, repository));

    expect(await screen.findByRole("heading", { name: "用例图", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("教师登录系统")).toBeInTheDocument();
    expect(screen.queryByLabelText("模型标题")).not.toBeInTheDocument();
    expect(screen.queryByText(/手动修改会更新当前模型结构/)).not.toBeInTheDocument();
    expect(screen.queryByText("编辑模型")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新生成此图" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /元素/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /关系/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "添加" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "添加角色" }));
    let dialog = await screen.findByRole("dialog", { name: /添加角色/u });
    expect(dialog).toHaveAttribute("data-form-layout", "4");
    expect(within(dialog).getByLabelText("角色名称")).toBeInTheDocument();
    expect(within(dialog).queryByText(/actor_/u)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(repository.renderStructuredModel).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole("button", { name: "编辑角色：教师" }));
    dialog = await screen.findByRole("dialog", { name: /编辑角色/u });
    expect(dialog).toHaveAttribute("data-form-layout", "4");
    expect(within(dialog).queryByText(/actor_/u)).not.toBeInTheDocument();
    const actorNameInput = within(dialog).getByLabelText("角色名称");
    await userEvent.clear(actorNameInput);
    await userEvent.type(actorNameInput, "授课教师");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));
    await waitFor(() => expect(repository.renderStructuredModel).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "编辑关系：发起" }));
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    expect(dialog).toHaveAttribute("data-form-layout", "6");
    expect(dialog.querySelector("select")).toBeNull();
    expect(within(dialog).getByRole("combobox", { name: "起点" })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "终点" })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "类型" })).toBeInTheDocument();
    const relationLabelInput = within(dialog).getByLabelText("关系名称");
    await userEvent.clear(relationLabelInput);
    await userEvent.type(relationLabelInput, "发起登录");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));
    await waitFor(() => expect(repository.renderStructuredModel).toHaveBeenCalledTimes(2));

    expect(screen.queryByRole("button", { name: "保存编辑" })).not.toBeInTheDocument();

    expect(repository.saveRequirementModelEdit).toHaveBeenCalledWith(
      "usecase",
      expect.objectContaining({
        modelId: modelKey,
        actors: [expect.objectContaining({ name: "授课教师" })],
        relationships: [expect.objectContaining({ label: "发起登录" })],
      }),
      expect.objectContaining({ status: "dirty" }),
      expect.objectContaining({
        requirementModelTraceability: [],
        designModelTraceability: [],
      }),
    );
    expect(repository.renderStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({
        actors: [expect.objectContaining({ name: "授课教师" })],
        relationships: [expect.objectContaining({ label: "发起登录" })],
      }),
     "requirements",);
    expect(
      vi.mocked(repository.saveRequirementModelEdit).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(repository.renderStructuredModel).mock.invocationCallOrder[0],
    );
    await waitFor(() => {
      expect(screen.queryByText(/可能与前置需求映射不一致/)).not.toBeInTheDocument();
    });
  });

  it("edits class members, relation metadata, and shared model fields", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["class"],
        designPlantUml: { class: "@startuml\nclass Order\n@enduml" },
        designModels: {
          class: {
            diagramKind: "class",
            title: "类图",
            summary: "订单领域",
            notes: ["旧备注"],
            classes: [
              {
                constraints: [],
                id: "cls_order",
                name: "Order",
                classKind: "entity",
                stereotype: "AggregateRoot",
                description: "订单",
                attributes: [
                  {
                    constraints: [],
                    name: "amount",
                    type: "number",
                    visibility: "private",
                    required: true,
                  },
                ],
                operations: [
                  {
                    name: "submit",
                    returnType: "void",
                    visibility: "public",
                    parameters: [
                      {
                        name: "operatorId",
                        type: "string",
                        required: true,
                      },
                    ],
                  },
                ],
              },
              {
                constraints: [],
                id: "cls_user",
                name: "User",
                classKind: "entity",
                attributes: [],
                operations: [],
              },
            ],
            interfaces: [
              {
                constraints: [],
                id: "if_payable",
                name: "Payable",
                operations: [{ name: "pay", visibility: "public", parameters: [] }],
              },
            ],
            enums: [{ id: "enum_status", name: "OrderStatus", literals: ["CREATED"] }],
            relationships: [
              {
                id: "rel_owner",
                type: "association",
                sourceId: "cls_user",
                targetId: "cls_order",
                sourceMultiplicity: "1",
                targetMultiplicity: "*",
                navigability: "source-to-target",
              },
            ],
          },
        },
        designSvgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Order</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DesignDiagramView type="class" />, repository));

    await userEvent.click(await screen.findByRole("button", { name: "编辑" }));
    const metadataDialog = await screen.findByRole("dialog", { name: "编辑模型信息" });
    await userEvent.clear(within(metadataDialog).getByLabelText("模型标题"));
    await userEvent.type(within(metadataDialog).getByLabelText("模型标题"), "订单类模型");
    await userEvent.click(within(metadataDialog).getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("heading", { name: "订单类模型", level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("备注")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("模型备注")).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "编辑类：Order" }));
    let dialog = await screen.findByRole("dialog", { name: /编辑类/u });
    expect(dialog).toHaveAttribute("data-form-layout", "4");
    await userEvent.clear(within(dialog).getByLabelText("第 1 个属性名称"));
    await userEvent.type(within(dialog).getByLabelText("第 1 个属性名称"), "totalAmount");
    await userEvent.clear(within(dialog).getByLabelText("第 1 个参数名称"));
    await userEvent.type(within(dialog).getByLabelText("第 1 个参数名称"), "userId");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: "编辑接口：Payable" }));
    dialog = await screen.findByRole("dialog", { name: /编辑接口/u });
    await userEvent.clear(within(dialog).getByLabelText("第 1 个操作名称"));
    await userEvent.type(within(dialog).getByLabelText("第 1 个操作名称"), "capture");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: "编辑枚举：OrderStatus" }));
    dialog = await screen.findByRole("dialog", { name: /编辑枚举/u });
    fireEvent.change(within(dialog).getByLabelText("枚举枚举值"), {
      target: { value: "CREATED\nPAID" },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: /编辑关系：/u }));
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    await userEvent.clear(within(dialog).getByLabelText("终点多重性"));
    await userEvent.type(within(dialog).getByLabelText("终点多重性"), "0..*");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await waitFor(() => {
      expect(repository.renderStructuredModel).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "订单类模型",
          notes: ["旧备注"],
          classes: expect.arrayContaining([
            expect.objectContaining({
              id: "cls_order",
              attributes: [expect.objectContaining({ name: "totalAmount" })],
              operations: [
                expect.objectContaining({
                  parameters: [expect.objectContaining({ name: "userId" })],
                }),
              ],
            }),
          ]),
          interfaces: [
            expect.objectContaining({
              operations: [expect.objectContaining({ name: "capture" })],
            }),
          ],
          enums: [expect.objectContaining({ literals: ["CREATED", "PAID"] })],
          relationships: [
            expect.objectContaining({
              targetMultiplicity: "0..*",
            }),
          ],
        }),
       "design",);
    });
  });

  it("edits table columns and authoritative composite constraints instead of derived edges", async () => {
    const model = tableDiagramSpecSchema.parse({ diagramKind: "table", title: "数据库设计", summary: "订单", notes: [], tables: [
      { id: "orders", name: "orders", columns: [{ id: "id", name: "id", dataType: "bigint", nullable: false }], relationalConstraints: [{ id: "pk", type: "primary-key", columnIds: ["id"] }] },
      { id: "items", name: "items", columns: [{ id: "id", name: "id", dataType: "bigint", nullable: false }, { id: "order", name: "order_id", dataType: "bigint", nullable: false }], relationalConstraints: [{ id: "pk", type: "primary-key", columnIds: ["id"] }, { id: "fk", type: "foreign-key", columnIds: ["order"], referenceTableId: "orders", referenceColumnIds: ["id"] }] },
    ], relationships: [] });
    const repository = createRepository(createWorkspaceRecord({ generatedDesignDiagramTypes: ["table"], designModels: { table: model } }));
    render(withWorkspaceProviders(<DesignDiagramView type="table" />, repository));
    await userEvent.click(await screen.findByRole("button", { name: "编辑数据表：items" }));
    const dialog = await screen.findByRole("dialog", { name: /编辑数据表/ });
    fireEvent.change(within(dialog).getByLabelText("第 1 个字段名称"), { target: { value: "item_id" } });
    const constraints = within(dialog).getByRole("group", { name: /主键、唯一、外键与检查约束/ });
    expect(within(constraints).getByDisplayValue("order")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/第 2 个主键、唯一、外键与检查约束名称/), { target: { value: "fk_items_orders" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));
    await waitFor(() => expect(repository.saveDesignModelEdit).toHaveBeenCalledWith("table", expect.objectContaining({
      tables: expect.arrayContaining([expect.objectContaining({ id: "items", columns: expect.arrayContaining([expect.objectContaining({ id: "id", name: "item_id" })]), relationalConstraints: expect.arrayContaining([expect.objectContaining({ type: "foreign-key", name: "fk_items_orders", columnIds: ["order"], referenceColumnIds: ["id"] })]) })]),
      relationships: [expect.objectContaining({ sourceTableId: "orders", targetTableId: "items", sourceColumnIds: ["id"], targetColumnIds: ["order"] })],
    }), expect.anything(), expect.anything()));
    expect(screen.queryByRole("button", { name: /编辑关系：/ })).not.toBeInTheDocument();
  });

  it("edits sequence message details and fragment message membership", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["sequence"],
        designPlantUml: { "sequence:login": "@startuml\n@enduml" },
        designModels: {
          "sequence:login": {
            diagramKind: "sequence",
            sourceUseCaseId: "login",
            modelId: "sequence:login",
            title: "登录用例实现设计",
            summary: "登录流程",
            notes: [],
            participants: [
              { id: "teacher", name: "教师", participantType: "actor" },
              { id: "auth", name: "认证服务", participantType: "service" },
            ],
            messages: [
              {
                id: "msg_login",
                type: "sync",
                sourceId: "teacher",
                targetId: "auth",
                name: "登录",
                parameters: ["username"],
              },
              {
                id: "msg_result",
                type: "return",
                sourceId: "auth",
                targetId: "teacher",
                name: "返回结果",
                parameters: [],
              },
            ],
            fragments: [
              {
                id: "frag_auth",
                type: "opt",
                label: "认证成功",
                messageIds: ["msg_login"],
              },
            ],
          },
        },
        designSvgArtifacts: {
          "sequence:login": {
            diagramKind: "sequence",
            modelId: "sequence:login",
            svg: "<svg><text>login</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(
        <DesignDiagramView type="sequence" modelId="sequence:login" />,
        repository,
      ),
    );

    await userEvent.click(await screen.findByRole("button", { name: "编辑参与对象：认证服务" }));
    let dialog = await screen.findByRole("dialog", { name: /编辑参与对象/u });
    expect(dialog.querySelector("select")).toBeNull();
    await selectComboboxOption(dialog, "参与对象类型", "控制对象");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: "编辑关系：登录" }));
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    fireEvent.change(within(dialog).getByLabelText("参数"), {
      target: { value: "username\npassword" },
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: "编辑关系：返回结果" }));
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    await userEvent.clear(within(dialog).getByLabelText("返回值"));
    await userEvent.type(within(dialog).getByLabelText("返回值"), "token");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getByRole("button", { name: "编辑组合片段：认证成功" }));
    dialog = await screen.findByRole("dialog", { name: /编辑组合片段/u });
    fireEvent.change(within(dialog).getByLabelText("组合片段包含消息"), { target: { value: "msg_login\nmsg_result" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await waitFor(() => {
      expect(repository.renderStructuredModel).toHaveBeenCalledWith(
        expect.objectContaining({
          participants: expect.arrayContaining([
            expect.objectContaining({ id: "auth", participantType: "control" }),
          ]),
          messages: expect.arrayContaining([
            expect.objectContaining({ id: "msg_login", parameters: ["username", "password"] }),
            expect.objectContaining({ id: "msg_result", returnValue: "token" }),
          ]),
          fragments: [expect.objectContaining({ messageIds: ["msg_login", "msg_result"] })],
        }),
       "design",);
    });
  });

  it("edits activity and deployment relation-specific fields without collapsing them into descriptions", async () => {
    const activityRepository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["activity"],
        plantUml: { activity: "@startuml\n@enduml" },
        models: {
          activity: {
            diagramKind: "activity",
            title: "活动图",
            summary: "审批流程",
            notes: [],
            swimlanes: [{ id: "lane_teacher", name: "教师" }],
            nodes: [
              { id: "start", type: "start", name: "开始" },
              { id: "decide", type: "decision", question: "是否通过" },
              { id: "end", type: "end", name: "结束" },
              { id: "approve", type: "activity", name: "批准", input: [], output: [] },
            ],
            relationships: [
              { id: "first", type: "control_flow", sourceId: "start", targetId: "decide" },
              { id: "no", type: "control_flow", sourceId: "decide", targetId: "end", guard: "否" },
              { id: "last", type: "control_flow", sourceId: "approve", targetId: "end" },
              { id: "flow_yes", type: "control_flow", sourceId: "decide", targetId: "approve", guard: "是" },
            ],
          },
        },
        svgArtifacts: {
          activity: {
            diagramKind: "activity",
            svg: "<svg><text>activity</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    const { unmount } = render(withWorkspaceProviders(<DiagramView type="activity" />, activityRepository));

    await userEvent.click(await screen.findByRole("button", { name: "编辑活动节点：是否通过" }));
    let dialog = await screen.findByRole("dialog", { name: /编辑活动节点/u });
    await userEvent.clear(within(dialog).getByLabelText("活动节点问题"));
    await userEvent.type(within(dialog).getByLabelText("活动节点问题"), "是否允许提交");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await userEvent.click(screen.getAllByRole("button", { name: /编辑关系：/u }).at(-1)!);
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    await userEvent.clear(within(dialog).getByLabelText("守卫条件"));
    await userEvent.type(within(dialog).getByLabelText("守卫条件"), "允许");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await waitFor(() => {
      expect(activityRepository.renderStructuredModel).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: "decide", question: "是否允许提交" }),
          ]),
          relationships: expect.arrayContaining([expect.objectContaining({ guard: "允许" })]),
        }),
       "requirements",);
    });
    expect(
      (
        vi.mocked(activityRepository.renderStructuredModel).mock.calls[0]?.[0] as {
          relationships: Array<Record<string, unknown>>;
        }
      ).relationships[0],
    ).not.toHaveProperty("description");

    unmount();

    const deploymentRepository = createRepository(
      createWorkspaceRecord({
        generatedDesignDiagramTypes: ["deployment"],
        designPlantUml: { deployment: "@startuml\n@enduml" },
        designModels: {
          deployment: {
            diagramKind: "deployment",
            title: "部署图",
            summary: "部署拓扑",
            notes: [],
            nodes: [{ id: "web", name: "Web", nodeType: "device" }],
            databases: [{ id: "db", name: "DB", engine: "PostgreSQL" }],
            components: [],
            externalSystems: [],
            artifacts: [],
            relationships: [
              {
                id: "dep_db",
                type: "communication",
                sourceId: "web",
                targetId: "db",
                protocol: "TCP",
              },
            ],
          },
        },
        designSvgArtifacts: {
          deployment: {
            diagramKind: "deployment",
            svg: "<svg><text>deploy</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(withWorkspaceProviders(<DesignDiagramView type="deployment" />, deploymentRepository));

    await userEvent.click(await screen.findByRole("button", { name: /编辑关系：/u }));
    dialog = await screen.findByRole("dialog", { name: /编辑关系/u });
    await userEvent.clear(within(dialog).getByLabelText("协议"));
    await userEvent.type(within(dialog).getByLabelText("协议"), "HTTPS");
    expect(dialog.querySelector("select")).toBeNull();
    await selectComboboxOption(dialog, "方向", "two-way");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认编辑" }));

    await waitFor(() => {
      expect(deploymentRepository.renderStructuredModel).toHaveBeenCalledWith(
        expect.objectContaining({
          relationships: [expect.objectContaining({ protocol: "HTTPS", direction: "two-way" })],
        }),
       "design",);
    });
    expect(
      (
        vi.mocked(deploymentRepository.renderStructuredModel).mock.calls[0]?.[0] as {
          relationships: Array<Record<string, unknown>>;
        }
      ).relationships[0],
    ).not.toHaveProperty("description");
  });

  it("keeps highlighted context while showing relation editors in the diagram page", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        generatedDiagramTypes: ["class"],
        plantUml: {
          class: "@startuml\nclass Event\nclass Reminder\nclass User\n@enduml",
        },
        models: {
          class: {
            diagramKind: "class",
            title: "领域概念模型",
            summary: "公开日历领域对象",
            notes: [],
            classes: [
              {
                constraints: [],
                id: "cls_event",
                name: "Event",
                description: "公开活动",
                classKind: "entity",

                attributes: [],
                operations: [],
              },
              {
                constraints: [],
                id: "cls_reminder",
                name: "Reminder",
                description: "提醒记录",
                classKind: "entity",

                attributes: [],
                operations: [],
              },
              {
                constraints: [],
                id: "cls_user",
                name: "User",
                description: "用户",
                classKind: "entity",

                attributes: [],
                operations: [],
              },
            ],
            interfaces: [],
            enums: [],
            relationships: [
              {
                id: "rel_event_reminder",
                type: "association",
                sourceId: "cls_event",
                targetId: "cls_reminder",

                sourceRole: "event",
                targetRole: "reminders",
                sourceMultiplicity: "1",
                targetMultiplicity: "0..*",
                navigability: "bidirectional",
                description: "活动关联多个提醒记录。",
              },
              {
                id: "rel_user_reminder",
                type: "association",
                sourceId: "cls_user",
                targetId: "cls_reminder",
                label: "查看提醒",
                description: "用户查看提醒。",
              },
            ],
          },
        },
        svgArtifacts: {
          class: {
            diagramKind: "class",
            svg: "<svg><text>Event</text><text>Reminder</text><text>User</text></svg>",
            renderMeta: {
              engine: "plantuml",
              generatedAt: new Date().toISOString(),
              sourceLength: 10,
              durationMs: 1,
            },
          },
        },
      }),
    );

    render(
      withWorkspaceProviders(
        <DiagramView type="class" highlightedElement={{ kind: "class", id: "cls_event" }} />,
        repository,
      ),
    );

    expect(await screen.findByText("预览")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索元素、属性或说明")).toBeInTheDocument();
    expect(screen.getByText(/相关关系 1 条/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /关系/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("活动关联多个提醒记录。").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Event").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reminder").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("只看焦点相关关系")).not.toBeInTheDocument();
  });

  it("exports feasibility context artifacts with stable context filenames", async () => {
    const repository = createRepository();
    render(
      withWorkspaceProviders(
        <ContextDiagramView
          data={{
            model: {
              diagramKind: "context",
              modelId: "context",
              title: "订单系统上下文",
              summary: "系统边界",
              notes: [],
              system: { id: "system", name: "订单系统", sourceRequirementIds: [] },
              people: [{ id: "customer", name: "客户", sourceRequirementIds: ["r1"] }],
              externalSystems: [],
              relationships: [{ id: "submit", sourceId: "customer", targetId: "system", direction: "directed", label: "提交订单", sourceRequirementIds: ["r1"] }],
            },
            plantUmlSource: "@startuml\n@enduml",
            svgMarkup: "<svg><text>订单系统</text></svg>",
            stale: false,
            rules: [{ id: "r1", text: "客户可以提交订单" }],
            saveStatus: "idle",
            onSave: vi.fn(async () => undefined),
          }}
        />,
        repository,
      ),
    );

    await userEvent.click(await screen.findByRole("button", { name: "下载" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "SVG" }));
    await userEvent.click(await screen.findByRole("button", { name: "下载" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "PlantUML" }));
    expect(downloadTextFileMock).toHaveBeenNthCalledWith(
      1,
      "context.svg",
      expect.stringContaining("<svg"),
      "image/svg+xml",
    );
    expect(downloadTextFileMock).toHaveBeenNthCalledWith(
      2,
      "context.puml",
      "@startuml\n@enduml",
      "text/plain",
    );
  });

  it("exports the saved feasibility flow using its own sources and filenames", async () => {
    const artifact = createBusinessFlowArtifact();
    render(withWorkspaceProviders(
      <BusinessFlowDiagramView data={{
        model: artifact.model,
        plantUmlSource: artifact.plantUml.source,
        svgMarkup: artifact.svg.svg,
        stale: false,
        rules: [{ id: "r1", text: "处理业务规则" }],
        saveStatus: "idle",
      }} />,
      createRepository(createWorkspaceRecord({
        plantUml: { activity: "@startuml\n:其他需求活动;\n@enduml" },
      })),
    ));

    await userEvent.click(await screen.findByRole("button", { name: "下载" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "SVG" }));
    await userEvent.click(await screen.findByRole("button", { name: "下载" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "PlantUML" }));
    expect(downloadTextFileMock).toHaveBeenNthCalledWith(
      1, "feasibility-business-flow.svg", expect.stringContaining("业务流程"), "image/svg+xml",
    );
    expect(downloadTextFileMock).toHaveBeenNthCalledWith(
      2, "feasibility-business-flow.puml", artifact.plantUml.source, "text/plain",
    );
  });

  it("opens a context element from navigation in the shared focus view", async () => {
    const repository = createRepository();
    render(
      withWorkspaceProviders(
        <ContextDiagramView
          highlightedElement={{ kind: "actor", id: "customer" }}
          data={{
            model: {
              diagramKind: "context",
              modelId: "context",
              title: "订单系统上下文",
              summary: "系统边界",
              notes: [],
              system: { id: "system", name: "订单系统", sourceRequirementIds: [] },
              people: [{ id: "customer", name: "客户", description: "提交订单的客户", sourceRequirementIds: ["r1"] }],
              externalSystems: [],
              relationships: [{ id: "submit", sourceId: "customer", targetId: "system", direction: "directed", label: "提交订单", sourceRequirementIds: ["r1"] }],
            },
            plantUmlSource: "@startuml\n@enduml",
            svgMarkup: "<svg><text>客户</text><text>订单系统</text></svg>",
            stale: false,
            rules: [{ id: "r1", text: "客户可以提交订单" }],
            saveStatus: "idle",
            onSave: vi.fn(async () => undefined),
          }}
        />,
        repository,
      ),
    );

    const panel = await screen.findByRole("complementary", { name: "焦点元素详情" });
    expect(within(panel).getByText("客户")).toBeInTheDocument();
    expect(within(panel).getByText("提交订单的客户")).toBeInTheDocument();
  });
});
