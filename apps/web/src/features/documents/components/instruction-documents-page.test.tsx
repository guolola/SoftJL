// Verifies the instruction document library keeps each generated DOCX visible.
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "@uml-platform/prompts";
import { createDocumentRunSnapshot } from "@/test/contract-fixtures";
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DocumentKind,
  DocumentLibraryItem,
  DocumentRunSnapshot,
} from "@uml-platform/contracts";
import { feasibilityInputsSchema, completeFeasibilityImplementationPlanSchema, snapshotInputFingerprint, buildFeasibilityContextFingerprint, buildFeasibilityImplementationFingerprint } from "@uml-platform/contracts";
import { useTheme } from "../../../shared/ui/theme-provider";
import {
  createMockWorkspaceRepository,
  type WorkspaceRepository,
} from "../../../services/workspace-repository";
import { withWorkspaceProviders, createBusinessFlowArtifact } from "../../../test/workspace-test-utils";
import { designInputFingerprintFor } from "../../workspace-session/lib/workspace-context";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { InstructionDocumentsPage } from "./instruction-documents-page";

const { docxPreviewHostMock } = vi.hoisted(() => ({
  docxPreviewHostMock: vi.fn((_props: { blob: Blob; onLoadError: () => void }) => <div data-testid="docx-preview" />),
}));

vi.mock("./docx-preview-host", () => ({
  DocxPreviewHost: docxPreviewHostMock,
}));

const requirementModel = {
  diagramKind: "usecase",
  title: "订单系统用例",
  summary: "核心参与者和用例",
  notes: [],
  actors: [{ id: "participant-user", name: "用户", actorType: "human", responsibilities: [] }],
  useCases: [
    {
      id: "usecase-submit-order",
      name: "提交订单",
      goal: "用户提交订单",
      preconditions: [],
      postconditions: ["订单已提交"],
      primaryActorId: "participant-user",
      supportingActorIds: [],
    },
  ],
  systemBoundaries: [],
  relationships: [{ id: "association-submit-order", type: "association", sourceId: "participant-user", targetId: "usecase-submit-order" }],
};

const designModel = {
  diagramKind: "sequence",
  sourceUseCaseId: "usecase-submit-order",
  title: "订单提交流程",
  summary: "订单提交的设计交互",
  notes: [],
  participants: [
    { id: "participant-user", name: "用户", participantType: "boundary" },
    { id: "participant-order-service", name: "订单服务", participantType: "service" },
  ],
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
  ...["participant-user", "association-submit-order"].map(elementId => ({
    ruleId: "REQ-001",
    target: { diagramKind: "usecase" as const, elementId, elementKind: elementId === "participant-user" ? "actor" : "relationship", label: elementId },
  })),
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
  ...["participant-user", "participant-order-service"].map(elementId => ({
    source: { modelId: "sequence", diagramKind: "sequence" as const, elementId, elementKind: "participant", label: elementId },
    targets: [{ diagramKind: "usecase" as const, elementId: "usecase-submit-order", elementKind: "usecase", label: "提交订单" }],
    mappingSource: "llm" as const,
  })),
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
    status: "active",
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
      createDocumentRunSnapshot({
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
      }),
    ],
    [
      "run-design",
      createDocumentRunSnapshot({
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
      }),
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
    diagramInputFingerprints: { usecase: snapshotInputFingerprint({ requirementText: "订单系统需求", rules: [] }) },
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
  const titleElement = screen.getByRole("heading", { name: title, level: 3 });
  const card = titleElement.closest("article");
  if (!card) throw new Error(`Template card not found: ${title}`);
  return card;
}

function createReadyFeasibilityWorkspace() {
  const rules = [{
    id: "R1",
    type: "functional" as const,
    text: "用户可以提交维修预约。",

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
  const feasibilityImplementationPlan = completeFeasibilityImplementationPlanSchema.parse(FEASIBILITY_IMPLEMENTATION_EXAMPLE);
  return {
    rules,
    feasibilityInputs,
    feasibilityContextModel: contextModel,
    feasibilityContextPlantUml: "@startuml\n@enduml",
    feasibilityContextSvg: "<svg><text>维修预约系统</text></svg>",
    feasibilityContextFingerprint: buildFeasibilityContextFingerprint({ rules, requirementBaseline: null, inputs: feasibilityInputs }),
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
      autoGenerate: false,
      showStaleBanner: true,
    }),
  );
}

describe("InstructionDocumentsPage", () => {
  it("shows ordinary documents without generation controls and preserves preview navigation", async () => {
    const user = userEvent.setup(); const onOpen = vi.fn();
    const repository = createMockWorkspaceRepository();
    const document = createDocument("ordinary-doc", "requirementsSpec", "普通项目需求.docx", "2026-10-16T08:00:00Z");
    repository.listDocuments = vi.fn(async () => [document]);
    repository.startDocumentRun = vi.fn();
    render(withWorkspaceProviders(<InstructionDocumentsPage ordinary={{ onOpen, onBack: vi.fn() }} />, repository));
    await screen.findByRole("heading", { name: "已生成说明书" });
    expect(screen.queryByRole("heading", { name: "目标说明书" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "说明书样式" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "全选 / 全不选" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("generation-model-controls")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /需要处理/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "在线预览" }));
    expect(onOpen).toHaveBeenCalledWith(document.id, document.fileName);
    expect(repository.startDocumentRun).not.toHaveBeenCalled();
  });

  it("keeps the ordinary library available in read-only projects without a generation entry", async () => {
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => []);
    render(withWorkspaceProviders(<InstructionDocumentsPage ordinary={{ disabled: true, onOpen: vi.fn(), onBack: vi.fn() }} />, repository));
    await screen.findByRole("heading", { name: "已生成说明书" });
    expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText("在聊天中生成需求规格说明书和软件设计说明书，在此预览、下载和管理。")).toBeInTheDocument();
  });

  it("requires a model for a real report after its artifact dependencies are satisfied", async () => {
    localStorage.clear();
    const repository = createMockWorkspaceRepository(createReadyFeasibilityWorkspace());
    repository.getProjectAccess = async () => ({ capabilities: ["update_project", "start_runs"], generationExecutionMode: "provider" });
    repository.listDocuments = vi.fn(async () => []);
    repository.startDocumentRun = vi.fn();
    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));
    await screen.findByRole("heading", { name: "已生成说明书" });
    const card = templateCard("可行性研究报告");
    const button = screen.getByRole("button", { name: "生成" });
    expect(button).toBeDisabled();
    expect(within(card).queryByText("未选择模型供应商")).not.toBeInTheDocument();
    expect(within(card).getByRole("img")).toHaveAttribute("data-generation-status", "blocked");
    const user = userEvent.setup();
    await user.click(card);
    await user.click(screen.getByRole("button", { name: "有 3 项需要处理" }));
    const guidance = screen.getByRole("dialog", { name: "有 3 项需要处理" });
    expect(guidance).toHaveTextContent("未选择模型供应商");
    await user.keyboard("{Escape}");
    await user.click(button);
    expect(repository.startDocumentRun).not.toHaveBeenCalled();
    act(() => patchUserSettings({ providerConfigId: "provider-1", defaultModel: "model-1", providerModelOptions: ["model-1"] }));
    expect(within(card).getByRole("checkbox")).not.toBeChecked();
    expect(button).toBeDisabled();
    await user.click(card);
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
    docxPreviewHostMock.mockClear();
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
      '[data-mobile-card-density="document-cards"]',
    );
    expect(documentGrids).toHaveLength(1);
    expect(container.querySelectorAll('[data-mobile-card-density="model-targets"]')).toHaveLength(1);
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

  it("uses shared selectable target cards and one generation toolbar without refresh buttons", async () => {
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
    expect(screen.getAllByRole("button", { name: /说明书样式/i })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "刷新列表" })).not.toBeInTheDocument();
    expect(screen.queryByText("请先勾选要生成的说明书。")).not.toBeInTheDocument();
    expect(screen.queryByText(/自动目录.*标题编号.*SimSun/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "生成" })).toHaveLength(1);
    const toolbar = screen.getByTestId("documents-generation-toolbar");
    expect(toolbar.firstElementChild).toHaveAttribute("data-testid", "generation-model-controls");
    expect(toolbar.lastElementChild).toBe(screen.getByRole("button", { name: "生成" }));
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
      expect(within(card).queryByRole("status")).not.toBeInTheDocument();
      expect(within(card).getByRole("img")).toHaveAttribute("data-generation-status", "blocked");
      expect(within(card).queryByRole("button", { name: /前往/ })).not.toBeInTheDocument();
      expect(card).toHaveAttribute("data-slot", "spotlight-card");
      expect(card).toHaveClass("h-[212px]", "sm:h-[236px]");
      expect(within(card).getByRole("checkbox")).not.toBeChecked();
      expect(within(card).queryByRole("button", { name: /生成|打开/ })).not.toBeInTheDocument();
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

  it("generates the selected ready report while guarding blocked document targets", async () => {
    const repository = createMockWorkspaceRepository(createReadyFeasibilityWorkspace());
    repository.listDocuments = vi.fn(async () => []);

    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));

    await screen.findByRole("heading", { name: "已生成说明书" });

    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "生成" });
    expect(button).toBeDisabled();
    await user.click(templateCard("可行性研究报告"));
    expect(button).toBeEnabled();
    await user.click(templateCard("需求规格说明书"));
    expect(within(templateCard("需求规格说明书")).getByRole("checkbox")).not.toBeChecked();
    expect(templateCard("需求规格说明书")).toHaveAttribute("aria-disabled", "true");
    expect(button).toBeEnabled();
    expect(screen.getAllByRole("button", { name: /需要处理/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "有 2 项需要处理" })).toBeInTheDocument();
    expect(within(templateCard("可行性研究报告")).queryByText("生成后可进入 Word 编辑器。")).not.toBeInTheDocument();
  });

  it("select all skips blocked cards and cannot force their selection", async () => {
    const repository = createMockWorkspaceRepository(createReadyFeasibilityWorkspace());
    repository.listDocuments = vi.fn(async () => []);
    const user = userEvent.setup();
    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));
    await screen.findByRole("heading", { name: "已生成说明书" });
    await user.click(screen.getByRole("button", { name: "全选" }));
    expect(within(templateCard("可行性研究报告")).getByRole("checkbox")).toBeChecked();
    for (const title of ["需求规格说明书", "软件设计说明书"]) {
      const card = templateCard(title);
      expect(card).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(card);
      fireEvent.click(within(card).getByRole("checkbox"));
      expect(within(card).getByRole("checkbox")).not.toBeChecked();
    }
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成" })).toBeEnabled();
  });

  it("select all leaves an entirely blocked library unselected", async () => {
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => []);
    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));
    await screen.findByRole("heading", { name: "已生成说明书" });
    await userEvent.click(screen.getByRole("button", { name: "全选" }));
    screen.getAllByRole("checkbox").forEach(checkbox => expect(checkbox).not.toBeChecked());
    expect(screen.getByText("0/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
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
    const button = screen.getByRole("button", { name: "生成" });
    expect(button).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "全选" }));
    expect(button).toBeEnabled();
    screen.getAllByRole("checkbox").forEach(checkbox => expect(checkbox).toBeChecked());
    await user.click(screen.getByRole("button", { name: "全不选" }));
    expect(button).toBeDisabled();
    screen.getAllByRole("checkbox").forEach(checkbox => expect(checkbox).not.toBeChecked());
    expect(screen.queryByText("生成后可进入 Word 编辑器。")).not.toBeInTheDocument();
  });

  it("warns for blocked regeneration even with an existing report and keeps reasons in header guidance", async () => {
    const readyWorkspace = createReadyFeasibilityWorkspace();
    const repository = createMockWorkspaceRepository({
      ...readyWorkspace,
      rules: [
        ...readyWorkspace.rules,
        {
          id: "R2",
          type: "business-rule" as const,
          text: "超过借阅上限时系统必须阻止借书。",

        },
      ],
    });
    repository.listDocuments = vi.fn(async () => [createDocument("old-feasibility", "feasibilityStudy", "可研旧版.docx", "2026-10-16T08:00:00Z")]);
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
    expect(within(feasibilityCard).getByText("1")).toBeInTheDocument();
    const warning = within(feasibilityCard).getByRole("img");
    expect(warning).toHaveAttribute("data-generation-status", "blocked");
    expect(warning.querySelector("svg")).toHaveClass("lucide-triangle-alert", "text-warning");
    expect(within(feasibilityCard).queryByText(/需求规则已更新/)).not.toBeInTheDocument();
    expect(within(feasibilityCard).queryByRole("button", { name: "前往可行性分析" })).not.toBeInTheDocument();
    await user.click(feasibilityCard);
    expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();

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
      diagramInputFingerprints: { usecase: snapshotInputFingerprint({ requirementText: "订单系统需求", rules: [] }) },
    });
    const startDocumentRun = vi.spyOn(repository, "startDocumentRun");
    const user = userEvent.setup();

    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));

    await screen.findByRole("heading", { name: "已生成说明书" });
    await user.click(screen.getByRole("button", { name: /说明书样式/i }));
    await user.click(screen.getByRole("button", { name: "一级标题" }));
    fireEvent.change(await screen.findByLabelText("字号 pt"), { target: { value: "18" } });
    await user.click(screen.getByRole("button", { name: "完成" }));
    await user.click(templateCard("需求规格说明书"));
    await user.click(screen.getByRole("button", { name: "生成" }));

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

  it("generates only the selected requirements specification from the shared action", async () => {
    const repository = createMockWorkspaceRepository({
      requirementText: "订单系统需求",
      models: { usecase: requirementModel as never },
      diagramInputFingerprints: { usecase: snapshotInputFingerprint({ requirementText: "订单系统需求", rules: [] }) },
      designModels: { sequence: designModel as never },
    });
    const startDocumentRun = vi.spyOn(repository, "startDocumentRun");
    const user = userEvent.setup();

    render(withWorkspaceProviders(<InstructionDocumentsPage />, repository));

    await screen.findByRole("heading", { name: "已生成说明书" });
    await user.click(templateCard("需求规格说明书"));
    await user.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(startDocumentRun).toHaveBeenCalledTimes(1);
    });
    expect(startDocumentRun.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ documentKind: "requirementsSpec" }),
    );
  });

  it("starts selected documents once, locks selection during the batch and opens only the first completion", async () => {
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
    await user.click(templateCard("需求规格说明书"));
    await user.click(templateCard("软件设计说明书"));
    const generateButton = screen.getByRole("button", { name: "生成" });
    await user.click(generateButton);
    await waitFor(() => {
      expect(subscribers.has("run-requirements")).toBe(true);
      expect(subscribers.has("run-design")).toBe(true);
    });
    expect(generateButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "全选" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "全不选" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "选择模型" })).toBeDisabled();
    screen.getAllByRole("checkbox").forEach(checkbox => expect(checkbox).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(generateButton);
    expect(repository.startDocumentRun).toHaveBeenCalledTimes(2);

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
    await waitFor(() => expect(generateButton).toBeEnabled());
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

  it("loads authenticated DOCX bytes for preview and keeps the download action", async () => {
    const document = createDocument("doc-preview", "requirementsSpec", "需求规格说明书.docx", "2026-05-20T08:05:01.001Z");
    const blob = new Blob(["docx"]);
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => [document]);
    repository.downloadDocument = vi.fn(async () => ({ blob, fileName: document.fileName }));
    render(withWorkspaceProviders(<InstructionDocumentsPage activeDocumentId={document.id} />, repository));
    await screen.findByTestId("docx-preview");
    expect(repository.downloadDocument).toHaveBeenCalledWith(document.id);
    expect(docxPreviewHostMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ blob }));
    expect(screen.getByRole("button", { name: "下载" })).toBeEnabled();
    expect(screen.getByText(/需要编辑时，请下载 DOCX/)).toBeInTheDocument();
  });

  it("keeps the current preview when the project theme changes", async () => {
    const document = createDocument("doc-theme", "requirementsSpec", "需求规格说明书.docx", "2026-05-20T08:05:01.001Z");
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => [document]);
    repository.downloadDocument = vi.fn(async () => ({ blob: new Blob(["docx"]), fileName: document.fileName }));
    const user = userEvent.setup();
    render(withWorkspaceProviders(<><ThemeToggleButton /><InstructionDocumentsPage activeDocumentId={document.id} /></>, repository));
    await screen.findByTestId("docx-preview");
    await user.click(screen.getByRole("button", { name: "切换主题" }));
    expect(repository.downloadDocument).toHaveBeenCalledTimes(1);
  });

  it("offers retry and download when fetching the preview fails", async () => {
    const document = createDocument("doc-failed", "requirementsSpec", "需求规格说明书.docx", "2026-05-20T08:05:01.001Z");
    const repository = createMockWorkspaceRepository();
    repository.listDocuments = vi.fn(async () => [document]);
    repository.downloadDocument = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue({ blob: new Blob(["docx"]), fileName: document.fileName });
    const user = userEvent.setup();
    render(withWorkspaceProviders(<InstructionDocumentsPage activeDocumentId={document.id} />, repository));
    await screen.findByRole("dialog", { name: "文档暂时无法预览" });
    expect(screen.getByRole("button", { name: "下载当前 DOCX" })).toBeEnabled();
    // Dismiss the feedback dialog before using the persistent inline retry action.
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "重试" }));
    await screen.findByTestId("docx-preview");
    expect(repository.downloadDocument).toHaveBeenCalledTimes(2);
  });
});
