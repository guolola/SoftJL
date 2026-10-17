// Verifies every engineering stage uses one visible task retry and concise failure feedback.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { documentRunSnapshotSchema, type RunEvent, type RunStage } from "@uml-platform/contracts";
import { createRunSnapshot } from "../../../test/workspace-test-utils";
import { ProjectGenerationTasksDrawerContent } from "./project-generation-tasks";

const mocks = vi.hoisted(() => ({
  retry: vi.fn(), cancel: vi.fn(), open: vi.fn(), alert: vi.fn(),
  restored: { events: [] as RunEvent[], status: "failed", model: "recorded-model", loading: false, disconnected: false, unavailable: false },
  session: { generationTasks: [], selectedGenerationTaskId: null, visualReviews: {}, currentRunDiagnostics: { runId: null, runKind: null } },
}));
vi.mock("../../workspace-session/state", () => ({ useWorkspaceSession: () => mocks.session }));
vi.mock("../../../services/workspace-repository", () => ({ useWorkspaceRepository: () => ({}) }));
vi.mock("../lib/use-run-transcript", () => ({ useRunTranscript: (_projectId: string, runId: string) => runId === "retry-run"
  ? { ...mocks.restored, events: [], status: "queued", loading: true }
  : mocks.restored }));
vi.mock("../lib/use-frame-value", () => ({ useFrameValue: (value: unknown) => value }));
vi.mock("../../user-platform/services/platform-api", () => ({ platformApi: { retryProjectRun: mocks.retry, cancelProjectRun: mocks.cancel } }));
vi.mock("../../../shared/lib/app-navigation", () => ({ requestOpenGenerationTask: mocks.open, requestOpenProjectWorkspaceTarget: vi.fn() }));
vi.mock("../../../shared/ui/floating-alert", () => ({ useFloatingAlert: () => ({ showAlert: mocks.alert }) }));

const detail = "Error: 绘图器故障：重建后仍未通过绘制校验：SVG 关系 cf04 的标签与模型不一致（预期 [身份认证不通过]，实际 身份认证不通过）".repeat(100);
const renderError = { code: "RUN_RENDER_FAILED" as const, category: "render" as const, retryable: true, message: detail };
const stages: Array<[string, string, RunStage]> = [
  ["系统需求", "requirements", "extract_rules"],
  ["可行性环境图", "feasibility", "generate_context"],
  ["可行性业务流程", "feasibility", "generate_business_flow"],
  ["可行性实施方案", "feasibility", "generate_implementation"],
  ["需求模型", "requirements", "generate_models"],
  ["设计模型", "design", "generate_design_models"],
  ["说明书正文", "document", "generate_document_text"],
  ["说明书文件", "document", "render_document_file"],
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.restored.events = [];
  Object.assign(mocks.restored, { status: "failed", loading: false, unavailable: false });
  mocks.retry.mockResolvedValue({ runId: "retry-run", status: "queued" });
});

describe("shared generation task recovery", () => {
  it.each(stages)("%s retains a single filled retry through folded and expanded history", async (label, kind, stage) => {
    mocks.restored.events = [
      { type: "stage_progress", stage, progress: 50, subtaskId: "activity", subtaskLabel: label, subtaskStatus: "failed", message: detail },
      { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, modelId: "act_course_registration_overall", subtaskId: "act_course_registration_overall", subtaskStatus: "failed", message: detail },
      { type: "failed", stage, error: renderError },
    ];
    const { container } = render(<ProjectGenerationTasksDrawerContent projectId="project-a" preferredRunId="source-run" projectRuns={[{ runId: "source-run", runKind: kind, status: "failed" }]} />);
    const button = screen.getByRole("button", { name: "重试任务" });
    expect(button).toHaveClass("bg-primary", "text-primary-foreground");
    expect(screen.getAllByRole("button", { name: /重试/ })).toHaveLength(1);
    const summary = screen.getByRole("region", { name: "输出总结" });
    expect(summary).toHaveTextContent(`${label}：绘图器故障，请重试。`);
    expect(summary).toHaveClass("text-sm", "leading-6", "text-destructive");
    fireEvent.click(screen.getByRole("button", { name: "思考过程" }));
    expect(screen.getAllByRole("button", { name: /重试/ })).toHaveLength(1);
    expect(container).not.toHaveTextContent("cf04");
    expect(container).not.toHaveTextContent("预期");
    expect(container.querySelector('[data-slot="generation-task-issues"]')).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledExactlyOnceWith("project-a", "source-run"));
    expect(mocks.open).toHaveBeenCalledWith({ runId: "retry-run" });
    expect(screen.queryByRole("button", { name: /重试/ })).not.toBeInTheDocument();
  });

  it("retries a completed batch with failed instances through the original task", async () => {
    mocks.restored.status = "completed";
    const snapshot = createRunSnapshot({ status: "completed", diagramErrors: { activity: { stage: "render_svg", error: renderError } } });
    (snapshot.diagramErrors as Record<string, NonNullable<typeof snapshot.diagramErrors.activity>>)["analysis:uc-view"] = { stage: "render_svg", error: renderError };
    mocks.restored.events = [{ type: "completed", snapshot }];
    render(<ProjectGenerationTasksDrawerContent projectId="project-a" preferredRunId="partial-run" projectRuns={[{ runId: "partial-run", runKind: "requirements", status: "completed" }]} />);
    expect(screen.getByRole("region", { name: "输出总结" })).toHaveTextContent(/^活动图、需求分析模型：绘图器故障，请重试。$/);
    fireEvent.click(screen.getByRole("button", { name: "重试任务" }));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledExactlyOnceWith("project-a", "partial-run"));
  });

  it("blocks duplicate retries while the request is pending and restores the button on failure", async () => {
    let reject!: (error: Error) => void;
    mocks.retry.mockImplementation(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    mocks.restored.events = [{ type: "failed", error: renderError }];
    render(<ProjectGenerationTasksDrawerContent projectId="project-a" preferredRunId="source-run" />);
    const button = screen.getByRole("button", { name: "重试任务" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    reject(new Error("service failed"));
    await waitFor(() => expect(button).toBeEnabled());
    expect(mocks.alert).toHaveBeenCalledTimes(1);
  });

  it.each(["cancelled", "interrupted"])("retains one recovery action for %s runs", (status) => {
    mocks.restored.status = status;
    render(<ProjectGenerationTasksDrawerContent projectId="project-a" preferredRunId="source-run" />);
    expect(screen.getAllByRole("button", { name: /重试/ })).toHaveLength(1);
  });

  it.each(["running", "queued", "completed"])("does not offer retry for a %s task", (status) => {
    mocks.restored.status = status;
    render(<ProjectGenerationTasksDrawerContent projectId="project-a" preferredRunId="source-run" />);
    expect(screen.queryByRole("button", { name: /重试/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停止生成" })).not.toBeInTheDocument();
  });

  it.each(["requirements", "design", "feasibility", "document"])("keeps completed %s output informational without result actions", (kind) => {
    mocks.restored.status = "completed";
    const snapshot = kind === "document" ? documentRunSnapshotSchema.parse({
      runId: "source-run", documentKind: "requirementsSpec", requirementText: "订单系统",
      documentId: "document-a", fileName: "requirements.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      byteLength: 100, currentStage: null, status: "completed", error: null,
    }) : createRunSnapshot({ status: "completed" });
    mocks.restored.events = [{ type: "completed", snapshot }];
    render(<ProjectGenerationTasksDrawerContent projectId="project-a" preferredRunId="source-run" projectRuns={[{ runId: "source-run", runKind: kind, status: "completed", documentDownloadAvailable: true }]} />);
    expect(screen.getByRole("region", { name: "输出总结" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /查看|下载|停止生成|重试/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
