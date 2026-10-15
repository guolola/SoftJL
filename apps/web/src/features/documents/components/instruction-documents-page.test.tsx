// Verifies the instruction document library keeps each generated DOCX visible.
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DocumentKind,
  DocumentLibraryItem,
  DocumentRunSnapshot,
} from "@uml-platform/contracts";
import { feasibilityInputsSchema, feasibilityImplementationPlanSchema, snapshotInputFingerprint, buildFeasibilityImplementationFingerprint } from "@uml-platform/contracts";
import { useTheme } from "../../../shared/ui/theme-provider";
import {
  createMockWorkspaceRepository,
  type WorkspaceRepository,
} from "../../../services/workspace-repository";
import { withWorkspaceProviders, createBusinessFlowArtifact } from "../../../test/workspace-test-utils";
import { designInputFingerprintFor } from "../../workspace-session/lib/workspace-context";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { InstructionDocumentsPage } from "./instruction-documents-page";

const { onlyOfficeEditorHostMock } = vi.hoisted(() => ({
  onlyOfficeEditorHostMock: vi.fn(() => <div data-testid="onlyoffice-editor" />),
}));

vi.mock("./only-office-editor-host", () => ({
  OnlyOfficeEditorHost: onlyOfficeEditorHostMock,
}));

const requirementModel = {
  diagramKind: "usecase",
  title: "订单系统用例",
  summary: "核心参与者和用例",
  notes: [],
  actors: [],
  useCases: [
    {
      id: "usecase-submit-order",
      name: "提交订单",
      goal: "用户提交订单",
      preconditions: [],
      postconditions: ["订单已提交"],
      primaryActorId: null,
      supportingActorIds: [],
    },
  ],
  systemBoundaries: [],
  relationships: [],
};

const designModel = {
  diagramKind: "sequence",
  sourceUseCaseId: "usecase-submit-order",
  title: "订单提交流程",
  summary: "订单提交的设计交互",
  notes: [],
  participants: [],
  messages: [
    {
      id: "message-submit-order",
      type: "sync",
      sourceId: "participant-user",
      targetId: "participant-order-service",
      name: "提交订单",
      parameters: [],
    },
  ],
  fragments: [],
};

const requirementModelTraceability = [
  {
    ruleId: "REQ-001",
    target: {
      diagramKind: "usecase" as const,
      elementId: "usecase-submit-order",
      elementKind: "usecase",
      label: "提交订单",
    },
  },
];

const designModelTraceability = [
  {
    source: {
      modelId: "sequence",
      diagramKind: "sequence" as const,
      elementId: "message-submit-order",
      elementKind: "message",
      label: "提交订单",
    },
    targets: [
      {
        diagramKind: "usecase" as const,
        elementId: "usecase-submit-order",
        elementKind: "usecase",
        label: "提交订单",
      },
    ],
    mappingSource: "llm" as const,
  },
];

function createDocument(
  id: string,
  documentKind: DocumentKind,
  fileName: string,
  updatedAt: string,
): DocumentLibraryItem {
  return {
    id,
    workspaceId: "workspace-test",
    documentKind,
    title:
      documentKind === "requirementsSpec"
        ? "需求规格说明书"
        : "软件设计说明书",
    fileName,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: 128,
    version: 1,
    sourceRunId: `run-${id}`,
    createdAt: updatedAt,
    updatedAt,
  };
}

function ThemeToggleButton() {
  const { toggle } = useTheme();
  return (
    <button type="button" onClick={toggle}>
      切换主题
    </button>
  );
}

function ActiveSelectionProbe() {
  const { selection } = useWorkspaceShell();
  if (selection.kind === "feasibility-home") {
    return (
      <div data-testid="active-selection">
        {selection.kind}:{selection.initialSelectedArtifacts?.join(",") ?? ""}
      </div>
    );
  }
  return (
    <div data-testid="active-selection">
      {selection.kind === "document-editor" ? selection.documentId : selection.kind}
    </div>
  );
}

function createControlledDocumentRepository() {
  const documents = new Map<string, DocumentLibraryItem>();
  const snapshots = new Map<string, DocumentRunSnapshot>([
    [
      "run-requirements",
      {
        runId: "run-requirements",
        documentKind: "requirementsSpec" as const,
        requirementText: "订单系统需求",
        documentId: "doc-requirements",
        sections: [{ level: 1, title: "1 需求规定", body: ["正文"] }],
        fileName: "需求规格说明书-20260520-160501.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteLength: 128,
        missingArtifacts: [],
        currentStage: "render_document_file" as const,
        status: "completed" as const,
        error: null,
      },
    ],
    [
      "run-design",
      {
        runId: "run-design",
        documentKind: "softwareDesignSpec" as const,
        requirementText: "订单系统需求",
        documentId: "doc-design",
        sections: [{ level: 1, title: "1 设计概述", body: ["正文"] }],
        fileName: "软件设计说明书-20260520-160502.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteLength: 128,
        missingArtifacts: [],
        currentStage: "render_document_file" as const,
        status: "completed" as const,
        error: null,
      },
    ],
  ]);
  const subscribers = new Map<
    string,
    {
      onEvent: Parameters<NonNullable<WorkspaceRepository["subscribeToDocumentRun"]>>[1];
      resolve: () => void;
    }
  >();
  const repository = createMockWorkspaceRepository({
    requirementText: "订单系统需求",
    models: { usecase: requirementModel as never },
    requirementModelTraceability,
    designModels: { sequence: designModel as never },
    designModelTraceability,
    designInputFingerprints: {
      sequence: designInputFingerprintFor(
        [requirementModel as never],
        requirementModelTraceability,
      ),
    },
  });
  repository.listDocuments = vi.fn(async () =>
    Array.from(documents.values()).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ),
  );
  repository.startDocumentRun = vi.fn(async (input) => ({
    runId:
      input.documentKind === "requirementsSpec"
        ? "run-requirements"
        : "run-design",
  }));
  repository.subscribeToDocumentRun = vi.fn(
    async (runId, onEvent) =>
      new Promise<void>((resolve) => {
        subscribers.set(runId, { onEvent, resolve });
      }),
  );
  repository.getDocumentRunSnapshot = vi.fn(async (runId) => {
    const snapshot = snapshots.get(runId);
    if (!snapshot) throw new Error("Missing document snapshot");
    return snapshot;
  });

  const complete = (runId: "run-requirements" | "run-design") => {
    const snapshot = snapshots.get(runId)!;
    const now = new Date().toISOString();
    documents.set(
      snapshot.documentId,
      createDocument(
        snapshot.documentId,
        snapshot.documentKind,
        snapshot.fileName,
        now,
      ),
    );
    const subscriber = subscribers.get(runId)!;
    subscriber.onEvent({ type: "queued" });
    subscriber.onEvent({ type: "completed", snapshot });
    subscriber.resolve();
  };

  return { repository, subscribers, complete };
}

function templateCard(title: string) {
  const titleElement = screen.getByText(title);
  const card = titleElement.closest("article");
  if (!card) throw new Error(`Template card not found: ${title}`);
  return card;
}

function createReadyFeasibilityWorkspace() {
  const rules = [{
    id: "R1",
    category: "功能需求" as const,
    text: "用户可以提交维修预约。",
    relatedDiagrams: ["usecase" as const],
  }];
  const contextModel = {
    diagramKind: "context" as const,
    modelId: "context",
    title: "维修预约系统上下文",
    summary: "系统边界",
    notes: [],
    system: { id: "system", name: "维修预约系统", sourceRequirementIds: [] },
    people: [{ id: "customer", name: "客户", sourceRequirementIds: ["R1"] }],
    externalSystems: [],
    relationships: [{
      id: "booking",
      sourceId: "customer",
      targetId: "system",
      direction: "directed" as const,
      label: "提交预约",
      sourceRequirementIds: ["R1"],
    }],
  };
  const feasibilityInputs = feasibilityInputsSchema.parse({});
  const feasibilityImplementationPlan = feasibilityImplementationPlanSchema.parse({
    overview: "采用模块化 Web 实现。",
    candidates: [{
      id: "option-a",
      name: "模块化方案",
      summary: "按模块交付。",
      advantages: ["易于实施"],
      disadvantages: ["需要维护模块边界"],
      estimatedCost: "待确认",
      estimatedSchedule: "8 周",
      sourceRequirementIds: ["R1"],
      implementation: {
        architecture: {
          summary: "分层架构。",
          modules: [{ id: "booking", name: "预约模块", responsibility: "处理维修预约", sourceRequirementIds: ["R1"] }],
        },
        dataStrategy: { summary: "关系数据存储。", sourceRequirementIds: ["R1"] },
        integrations: [],
        deploymentAndOperations: { summary: "容器化部署。", sourceRequirementIds: ["R1"] },
        securityAndCompliance: { summary: "最小权限。", sourceRequirementIds: ["R1"] },
        milestones: [{ id: "delivery", name: "交付预约模块", timeframe: "8 周", deliverables: ["预约模块"], sourceRequirementIds: ["R1"] }],
        risks: [],
        verdicts: [
          { category: "technical" as const, verdict: "feasible" as const, rationale: "技术成熟。" },
          { category: "operational" as const, verdict: "feasible" as const, rationale: "流程可执行。" },
          { category: "schedule" as const, verdict: "feasible" as const, rationale: "周期可控。" },
          { category: "economic" as const, verdict: "conditional" as const, rationale: "需确认预算。" },
          { category: "legal" as const, verdict: "feasible" as const, rationale: "无额外限制。" },
        ],
        decision: "conditional-go" as const,
        preconditions: ["确认预算"],
      },
    }],
    recommendedCandidateId: "option-a",
    recommendationRationale: "适合当前规模。",
  });
  return {
    rules,
    feasibilityInputs,
    feasibilityContextModel: contextModel,
    feasibilityContextPlantUml: "@startuml\n@enduml",
    feasibilityContextSvg: "<svg><text>维修预约系统</text></svg>",
    feasibilityContextFingerprint: snapshotInputFingerprint({
      rules,
      requirementBaseline: null,
    }),
    feasibilityImplementationPlan,
    feasibilityBusinessFlow: createBusinessFlowArtifact(rules),
    feasibilityImplementationFingerprint: buildFeasibilityImplementationFingerprint({
      rules,
      requirementBaseline: null,
      businessFlow: createBusinessFlowArtifact(rules),
      contextModel,
      inputs: feasibilityInputs,
    }),
  };
}

function storeManagedUserSettings() {
  localStorage.setItem(
    "uml-lab-settings",
    JSON.stringify({
      providerConfigId: "provider-config-1",
      defaultModel: "gpt-5.5",
      providerModelOptions: ["gpt-5.5"],
      imageModel: "nano-banana-pro",
      fontSize: "md",
      autoGenerate: false,
      showStaleBanner: true,
    }),
  );
}

describe("InstructionDocumentsPage", () => {
  it("requires a model for a real report after its artifact dependencies are satisfied", async () => {
    localStorage.clear();
    const repository = createMockWorkspaceRepository(createReadyFeasibilityWorkspace());
    repository.getProjectAccess = async () => ({ capabilities: ["update_project", "start_runs"], generationExecutionMode: "provider" });
    repository.listDocuments = vi.fn(async () => []);
    repository.startDocumentRun = vi.fn();
    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));
    await screen.findByRole("heading", { name: "已生成说明书" });
    const card = templateCard("可行性研究报告");
    const button = within(card).getByRole("button", { name: /生成并打开/ });
    expect(button).toBeDisabled();
    expect(within(card).queryByText("未选择模型供应商")).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "有 3 项需要处理" }));
    const guidance = screen.getByRole("dialog", { name: "有 3 项需要处理" });
    expect(guidance).toHaveTextContent("未选择模型供应商");
    await user.keyboard("{Escape}");
    await user.click(button);
    expect(repository.startDocumentRun).not.toHaveBeenCalled();
    act(() => patchUserSettings({ providerConfigId: "provider-1", defaultModel: "model-1", providerModelOptions: ["model-1"] }));
    expect(button).toBeEnabled();
  });

  const clearDialogSideEffects = () => {
    document.body.style.pointerEvents = "";
    document.body.removeAttribute("data-scroll-locked");
    document
      .querySelectorAll("[data-radix-focus-guard]")
      .forEach((element) => element.remove());
  };

  beforeEach(() => {
    clearDialogSideEffects();
    storeManagedUserSettings();
  });

  afterEach(() => {
    clearDialogSideEffects();
    localStorage.clear();
    vi.clearAllMocks();
    onlyOfficeEditorHostMock.mockClear();
  });

  it("renders and filters every generated document instance", async () => {
    const documents = [
      createDocument(
        "doc-requirements-1",
        "requirementsSpec",
        "需求规格说明书-20260520-160501-001.docx",
        "2026-05-20T08:05:01.001Z",
      ),
      createDocument(
        "doc-requirements-2",
        "requirementsSpec",
        "需求规格说明书-20260520-161012-002.docx",
        "2026-05-20T08:10:12.002Z",
      ),
      createDocument(
        "doc-design-1",
        "softwareDesignSpec",
        "软件设计说明书-20260520-162000-003.docx",
        "2026-05-20T08:20:00.003Z",
      ),
    ];
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => documents);

    const { container } = render(
      withWorkspaceProviders(<InstructionDocumentsPage />, repository),
    );

    const generatedHeading = await screen.findByRole("heading", {
      name: "已生成说明书",
    });
    const generatedSection = generatedHeading.closest("section") as HTMLElement;

    expect(
      within(generatedSection).getByText("需求规格说明书-20260520-160501-001.docx"),
    ).toBeInTheDocument();
    expect(
      within(generatedSection).getByText("需求规格说明书-20260520-161012-002.docx"),
    ).toBeInTheDocument();
    expect(
      within(generatedSection).getByText("软件设计说明书-20260520-162000-003.docx"),
    ).toBeInTheDocument();
    expect(within(generatedSection).getByText("3 份")).toBeInTheDocument();
    expect(within(generatedSection).getAllByText("DOCX 文件")).toHaveLength(3);
    expect(within(generatedSection).getAllByText("文件大小")).toHaveLength(3);
    expect(within(generatedSection).getAllByText("128 B")).toHaveLength(3);
    expect(within(generatedSection).queryByText("来源运行")).not.toBeInTheDocument();
    const documentGrids = container.querySelectorAll(
      '[data-workspace-density="compact-grid"]',
    );
    expect(documentGrids.length).toBeGreaterThanOrEqual(2);
    documentGrids.forEach((grid) => {
      expect(grid).toHaveAttribute("data-mobile-card-density", "document-cards");
      expect(grid.className).toContain("2xl:grid-cols-5");
    });

    await userEvent.click(screen.getByRole("combobox", { name: "说明书类型" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "需求规格说明书" }),
    );

    expect(
      within(generatedSection).getByText("需求规格说明书-20260520-160501-001.docx"),
    ).toBeInTheDocument();
    expect(
      within(generatedSection).getByText("需求规格说明书-20260520-161012-002.docx"),
    ).toBeInTheDocument();
    expect(
      within(generatedSection).queryByText("软件设计说明书-20260520-162000-003.docx"),
    ).not.toBeInTheDocument();
    expect(within(generatedSection).getByText("2 份")).toBeInTheDocument();
  });

  it("renders template controls on the documents page instead of the automatic generate button", async () => {
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => []);
    const user = userEvent.setup();

    const { container } = render(
      withWorkspaceProviders(<InstructionDocumentsPage />, repository),
    );

    await screen.findByRole("heading", { name: "已生成说明书" });

    expect(container.querySelector(".max-w-6xl")).not.toBeInTheDocument();
    expect(container.querySelector(".max-w-360")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /自动生成文档/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /说明书样式/i })).toHaveLength(3);
    expect(screen.getByText("可行性研究报告")).toBeInTheDocument();
    const feasibilityCard = templateCard("可行性研究报告");
    const requirementsCard = templateCard("需求规格说明书");
    const designCard = templateCard("软件设计说明书");
    expect(feasibilityCard.compareDocumentPosition(requirementsCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(requirementsCard.compareDocumentPosition(designCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("需求规格说明书.docx")).not.toBeInTheDocument();
    expect(screen.queryByText("软件设计说明书.docx")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /同时生成软件设计说明书/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const notice = screen.getByRole("button", { name: "有 3 项需要处理" });
    expect(screen.getAllByRole("button", { name: /有 \d+ 项需要处理/ })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "说明书", level: 1 }).parentElement).toContainElement(notice);
    for (const card of [feasibilityCard, requirementsCard, designCard]) {
      expect(within(card).queryByRole("button", { name: /需要处理/ })).not.toBeInTheDocument();
      expect(within(card).queryByText(/请先|生成后可进入 Word 编辑器/)).not.toBeInTheDocument();
      expect(within(card).getByRole("button", { name: "生成并打开" })).toBeDisabled();
    }
    await user.click(notice);
    const feedback = screen.getByRole("dialog", {
      name: "有 3 项需要处理",
    });
    expect(feedback).toHaveTextContent("可行性研究报告暂时无法生成");
    expect(feedback).toHaveTextContent("需求规格说明书暂时无法生成");
    expect(feedback).toHaveTextContent("软件设计说明书暂时无法生成");
    expect(feedback).toHaveTextContent("请先生成系统环境图和实现方案");
    expect(feedback).toHaveTextContent("请先在需求模型页生成需求模型");
    expect(feedback).toHaveTextContent("请先在设计模型页生成设计模型");
    expect(within(feedback).getByRole("button", { name: "前往需求模型" })).toBeInTheDocument();
    expect(within(feedback).getByRole("button", { name: "前往设计模型" })).toBeInTheDocument();
    expect(feedback).not.toHaveTextContent("影响：");
    expect(feedback).not.toHaveTextContent("技术详情");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(notice);
    expect(screen.getByRole("dialog", { name: "有 3 项需要处理" })).toHaveTextContent("请先在设计模型页生成设计模型");
  });

  it("enables the feasibility report from current analysis without requirement or design models", async () => {
    const repository = createMockWorkspaceRepository(createReadyFeasibilityWorkspace());
    repository.listDocuments = vi.fn(async () => []);

    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));

    await screen.findByRole("heading", { name: "已生成说明书" });

    expect(
      within(templateCard("可行性研究报告")).getByRole("button", { name: /生成并打开/i }),
    ).toBeEnabled();
    expect(
      within(templateCard("需求规格说明书")).getByRole("button", { name: /生成并打开/i }),
    ).toBeDisabled();
    expect(
      within(templateCard("软件设计说明书")).getByRole("button", { name: /生成并打开/i }),
    ).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /需要处理/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "有 2 项需要处理" })).toBeInTheDocument();
    expect(within(templateCard("可行性研究报告")).queryByText("生成后可进入 Word 编辑器。")).not.toBeInTheDocument();
  });

  it("hides the header notice when all document prerequisites are satisfied", async () => {
    const repository = createMockWorkspaceRepository({
      ...createReadyFeasibilityWorkspace(),
      models: { usecase: requirementModel as never },
      designModels: { sequence: designModel as never },
    });
    repository.listDocuments = vi.fn(async () => []);
    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));

    await screen.findByRole("heading", { name: "已生成说明书" });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /需要处理/ })).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "生成并打开" })).toHaveLength(3);
    screen.getAllByRole("button", { name: "生成并打开" }).forEach((button) => {
      expect(button).toBeEnabled();
    });
    expect(screen.queryByText("生成后可进入 Word 编辑器。")).not.toBeInTheDocument();
  });

  it("explains stale feasibility artifacts and opens analysis with both selected", async () => {
    const readyWorkspace = createReadyFeasibilityWorkspace();
    const repository = createMockWorkspaceRepository({
      ...readyWorkspace,
      rules: [
        ...readyWorkspace.rules,
        {
          id: "R2",
          category: "业务规则",
          text: "超过借阅上限时系统必须阻止借书。",
          relatedDiagrams: ["usecase"],
        },
      ],
    });
    repository.listDocuments = vi.fn(async () => []);
    const user = userEvent.setup();

    render(
      withWorkspaceProviders(
        <>
          <ActiveSelectionProbe />
          <InstructionDocumentsPage />
        </>,
        repository,
      ),
    );

    await screen.findByRole("heading", { name: "已生成说明书" });
    const feasibilityCard = templateCard("可行性研究报告");
    expect(
      within(feasibilityCard).getByRole("button", { name: /生成并打开/i }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "有 3 项需要处理" }),
    );
    const guidance = await screen.findByRole("dialog", {
      name: "有 3 项需要处理",
    });
    expect(guidance).toHaveTextContent(
      "需求规则已更新，系统环境图和实现方案需要重新生成",
    );
    await user.click(
      within(guidance).getByRole("button", { name: "前往可行性分析" }),
    );
    expect(screen.getByTestId("active-selection")).toHaveTextContent(
      "feasibility-home:context,business-flow,implementation",
    );
  });

  it("opens analysis with only implementation selected when its plan is stale", async () => {
    const repository = createMockWorkspaceRepository({
      ...createReadyFeasibilityWorkspace(),
      feasibilityImplementationFingerprint: "fp:v2:stale",
    });
    repository.listDocuments = vi.fn(async () => []);
    const user = userEvent.setup();

    render(
      withWorkspaceProviders(
        <>
          <ActiveSelectionProbe />
          <InstructionDocumentsPage />
        </>,
        repository,
      ),
    );

    await screen.findByRole("heading", { name: "已生成说明书" });
    await user.click(
      screen.getByRole("button", { name: "有 3 项需要处理" }),
    );
    const guidance = await screen.findByRole("dialog", {
      name: "有 3 项需要处理",
    });
    expect(guidance).toHaveTextContent(
      "需求规则、上下文或补充资料已更新，实现方案需要重新生成",
    );
    await user.click(
      within(guidance).getByRole("button", { name: "前往可行性分析" }),
    );
    expect(screen.getByTestId("active-selection")).toHaveTextContent(
      "feasibility-home:implementation",
    );
  });

  it("passes customized document style settings when generating from the documents page", async () => {
    const repository = createMockWorkspaceRepository({
      requirementText: "订单系统需求",
      models: { usecase: requirementModel as never },
    });
    const startDocumentRun = vi.spyOn(repository, "startDocumentRun");
    const user = userEvent.setup();

    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));

    await screen.findByRole("heading", { name: "已生成说明书" });
    await user.click(within(templateCard("需求规格说明书")).getByRole("button", { name: /说明书样式/i }));
    await user.click(screen.getByRole("button", { name: "一级标题" }));
    fireEvent.change(await screen.findByLabelText("字号 pt"), { target: { value: "18" } });
    await user.click(screen.getByRole("button", { name: "完成" }));
    await user.click(within(templateCard("需求规格说明书")).getByRole("button", { name: /生成并打开/i }));

    await waitFor(() => {
      expect(startDocumentRun).toHaveBeenCalledWith(
        expect.objectContaining({
          documentKind: "requirementsSpec",
          documentStyle: expect.objectContaining({
            heading1: expect.objectContaining({ sizePt: 18 }),
            includeTableOfContents: true,
            autoNumberHeadings: true,
          }),
        }),
      );
    });
  });

  it("generates only the requirements spec from the requirements template action", async () => {
    const repository = createMockWorkspaceRepository({
      requirementText: "订单系统需求",
      models: { usecase: requirementModel as never },
      designModels: { sequence: designModel as never },
    });
    const startDocumentRun = vi.spyOn(repository, "startDocumentRun");
    const user = userEvent.setup();

    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));

    await screen.findByRole("heading", { name: "已生成说明书" });
    await user.click(within(templateCard("需求规格说明书")).getByRole("button", { name: /生成并打开/i }));

    await waitFor(() => {
      expect(startDocumentRun).toHaveBeenCalledTimes(1);
    });
    expect(startDocumentRun.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ documentKind: "requirementsSpec" }),
    );
  });

  it("keeps document template buttons independent and opens only the first completed document", async () => {
    const { repository, subscribers, complete } =
      createControlledDocumentRepository();
    const user = userEvent.setup();

    render(
      withWorkspaceProviders(
        <>
          <ActiveSelectionProbe />
          <InstructionDocumentsPage />
        </>,
        repository,
      ),
    );

    await screen.findByRole("heading", { name: "已生成说明书" });
    let requirementsButton = within(templateCard("需求规格说明书")).getByRole("button", { name: /生成并打开/i });
    let designButton = within(templateCard("软件设计说明书")).getByRole("button", { name: /生成并打开/i });

    await user.click(requirementsButton);
    await waitFor(() => {
      expect(subscribers.has("run-requirements")).toBe(true);
    });
    expect(requirementsButton).toBeDisabled();
    expect(designButton).not.toBeDisabled();

    requirementsButton = within(templateCard("需求规格说明书")).getByRole("button", { name: /生成并打开/i });
    designButton = within(templateCard("软件设计说明书")).getByRole("button", { name: /生成并打开/i });
    expect(designButton).not.toBeDisabled();
    fireEvent.click(designButton);
    await waitFor(() => {
      expect(subscribers.has("run-design")).toBe(true);
    });
    expect(requirementsButton).toBeDisabled();
    expect(designButton).toBeDisabled();

    complete("run-design");
    await waitFor(() => {
      expect(screen.getByTestId("active-selection")).toHaveTextContent(
        "doc-design",
      );
    });

    complete("run-requirements");
    await waitFor(() => {
      expect(repository.listDocuments).toHaveBeenCalledTimes(3);
    });
    expect(screen.getByTestId("active-selection")).toHaveTextContent(
      "doc-design",
    );
  });

  it("shows a fresh list failure after every explicit retry", async () => {
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => {
      throw new Error("list failed");
    });
    const user = userEvent.setup();

    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));

    const first = await screen.findByRole("dialog", {
      name: "说明书暂时无法读取",
    });
    expect(first).not.toHaveTextContent("list failed");
    await user.click(within(first).getByRole("button", { name: "重试" }));

    expect(
      await screen.findByRole("dialog", { name: "说明书暂时无法读取" }),
    ).toBeInTheDocument();
    expect(vi.mocked(repository.listDocuments!).mock.calls.length).toBeGreaterThanOrEqual(2);
    await user.keyboard("{Escape}");
    const notice = screen.getByRole("button", { name: "有 4 项需要处理" });
    expect(screen.getAllByRole("button", { name: /需要处理/ })).toHaveLength(1);
    expect(notice).toHaveClass("text-destructive");
    await user.click(notice);
    const overview = screen.getByRole("dialog", { name: "有 4 项需要处理" });
    expect(overview).toHaveTextContent("说明书暂时无法读取");
    expect(overview).toHaveTextContent("需求规格说明书暂时无法生成");
    await user.click(within(overview).getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("dialog", { name: "说明书暂时无法读取" })).toBeInTheDocument();
  });

  it("loads OnlyOffice config with the project theme and passes it to the editor", async () => {
    localStorage.setItem("ui-theme", "light");
    const document = createDocument(
      "doc-requirements-1",
      "requirementsSpec",
      "需求规格说明书-20260520-160501-001.docx",
      "2026-05-20T08:05:01.001Z",
    );
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => [document]);
    repository.getOnlyOfficeEditorConfig = vi.fn(async (_documentId, uiTheme) => ({
      document,
      documentServerUrl: "http://127.0.0.1:8080",
      config: {
        documentType: "word",
        document: {
          fileType: "docx",
          key: `${document.id}-v${document.version}`,
          title: document.fileName,
          url: `/api/documents/${document.id}/file`,
        },
        editorConfig: {
          callbackUrl: `/api/documents/${document.id}/onlyoffice/callback`,
          mode: "edit",
          lang: "zh-CN",
          customization: {
            uiTheme,
          },
        },
      },
    }));

    render(
      withWorkspaceProviders(
        <InstructionDocumentsPage activeDocumentId={document.id} />,
        repository,
      ),
    );

    await screen.findByTestId("onlyoffice-editor");

    expect(repository.getOnlyOfficeEditorConfig).toHaveBeenCalledWith(
      document.id,
      "theme-classic-light",
    );
    const editorProps = (
      onlyOfficeEditorHostMock.mock.calls as unknown as Array<[unknown]>
    )[0]?.[0];
    expect(editorProps).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          editorConfig: expect.objectContaining({
            customization: { uiTheme: "theme-classic-light" },
          }),
        }),
      }),
    );
  });

  it("reloads the OnlyOffice config with the next project theme", async () => {
    localStorage.setItem("ui-theme", "light");
    const document = createDocument(
      "doc-requirements-1",
      "requirementsSpec",
      "需求规格说明书-20260520-160501-001.docx",
      "2026-05-20T08:05:01.001Z",
    );
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => [document]);
    repository.getOnlyOfficeEditorConfig = vi.fn(async (_documentId, uiTheme) => ({
      document,
      documentServerUrl: "http://127.0.0.1:8080",
      config: {
        documentType: "word",
        document: {
          fileType: "docx",
          key: `${document.id}-v${document.version}-${uiTheme}`,
          title: document.fileName,
          url: `/api/documents/${document.id}/file`,
        },
        editorConfig: {
          callbackUrl: `/api/documents/${document.id}/onlyoffice/callback`,
          mode: "edit",
          lang: "zh-CN",
          customization: {
            uiTheme,
          },
        },
      },
    }));
    const user = userEvent.setup();

    render(
      withWorkspaceProviders(
        <>
          <ThemeToggleButton />
          <InstructionDocumentsPage activeDocumentId={document.id} />
        </>,
        repository,
      ),
    );

    await screen.findByTestId("onlyoffice-editor");
    await user.click(screen.getByRole("button", { name: "切换主题" }));

    await waitFor(() => {
      expect(repository.getOnlyOfficeEditorConfig).toHaveBeenCalledWith(
        document.id,
        "theme-dark",
      );
    });
    const editorHostCalls =
      onlyOfficeEditorHostMock.mock.calls as unknown as Array<[unknown]>;
    const latestEditorProps = editorHostCalls[editorHostCalls.length - 1]?.[0];
    expect(latestEditorProps).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          editorConfig: expect.objectContaining({
            customization: { uiTheme: "theme-dark" },
          }),
        }),
      }),
    );
  });
});
