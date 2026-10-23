// Verifies model-level task summaries remain accurate when a run partially succeeds.
import { createDesignRunSnapshot, createRenderMeta } from "@test/fixtures/contract-fixtures";
import { describe, expect, it } from "vitest";
import type { RunEventInput } from "@uml-platform/contracts";
import {
  applyVisualReviewConfirmations,
  createGenerationTask,
  updateDiagnosticsFromEvent,
  updateTaskFromEvent,
} from "./generation-tasks";
import { createEmptyDiagnostics } from "./diagnostics";
import { createRequirementBaseline, createRunSnapshot } from "../../../../tests/helpers/workspace-test-utils";
import { designGenerationSubtasks, requirementGenerationSubtasks } from "./generation-planning";

describe("workspace-session generation task helpers", () => {
  it("uses business labels for failures recovered without a planned task", () => {
    const task = createGenerationTask({ clientTaskId: "unplanned-failure", kind: "design", title: "生成设计模型",
      providerModel: null, startedAt: "now", message: "生成中" });
    const next = updateTaskFromEvent(task, { type: "completed", snapshot: createDesignRunSnapshot({
      selectedDiagrams: ["sequence"],
      diagramErrors: { "sequence:UC-DIAL": { stage: "generate_design_sequence", error: {
        code: "PLATFORM_PROVIDER_UNAVAILABLE", message: "private provider response", category: "platform_provider", retryable: true,
      } } },
    }) }, { queued: "排队中", completed: "完成" });
    expect(next.subtasks).toContainEqual(expect.objectContaining({ id: "sequence:UC-DIAL", label: "用例实现设计",
      message: null, errorMessage: "当前模型服务暂不可用，请稍后重试。" }));
  });
  it.each(["requirements", "design"] as const)("updates planned %s phases when artifact events carry a custom model ID", (kind) => {
    let task = createGenerationTask({ clientTaskId: "custom-model", kind, title: "生成模型", providerModel: null,
      startedAt: "now", message: "生成中", subtasks: kind === "requirements"
        ? requirementGenerationSubtasks(["class", "usecase"], {}) : designGenerationSubtasks(["class", "component"], {}) });
    const labels = { queued: "排队中", completed: "完成" };
    task = updateTaskFromEvent(task, { type: "artifact_ready", stage: "render_svg", artifactKind: "svg",
      diagramKind: "class", modelId: "domain-class-custom", subtaskId: "domain-class-custom", subtaskStatus: "completed" }, labels);
    expect(task.subtasks.find((subtask) => subtask.id === "render_svg:class")?.status).toBe("completed");
    expect(task.subtasks.find((subtask) => subtask.id === `render_svg:${kind === "requirements" ? "usecase" : "component"}`)?.status).toBe("queued");
    task = updateTaskFromEvent(task, { type: "stage_progress", stage: "verify_diagram_visual", progress: 98,
      diagramKind: "class", modelId: "domain-class-custom", subtaskId: "domain-class-custom", subtaskStatus: "pending_review" }, labels);
    expect(task.subtasks.find((subtask) => subtask.id === "verify_diagram_visual:class")?.status).toBe("pending_review");
    expect(task.subtasks.some((subtask) => subtask.id.includes("domain-class-custom"))).toBe(false);
  });

  it("fails downstream placeholders when a custom model ID fails generation", () => {
    const task = createGenerationTask({ clientTaskId: "custom-failure", kind: "requirements", title: "生成模型",
      providerModel: null, startedAt: "now", message: "生成中", subtasks: requirementGenerationSubtasks(["usecase", "class"], {}) });
    const failed = updateTaskFromEvent(task, { type: "stage_progress", stage: "generate_models", progress: 65,
      diagramKind: "usecase", subtaskId: "uc_custom", subtaskStatus: "failed", message: "结构校验失败" },
    { queued: "排队中", completed: "完成" });
    expect(failed.subtasks.filter((subtask) => subtask.id.endsWith(":usecase")).every((subtask) => subtask.status === "failed")).toBe(true);
    expect(failed.subtasks.filter((subtask) => subtask.id.endsWith(":class")).every((subtask) => subtask.status === "queued")).toBe(true);
  });

  it("clears only the confirmed visual subtask from the task summary", () => {
    const review = { findings: [], status: "pending_review" as const, issues: ["业务条件是否合适需要确认"], reason: "请人工确认", attempts: 3, checkedAt: "check-1" };
    const task = createGenerationTask({ clientTaskId: "confirm-visual", kind: "requirements", title: "需求模型生成", providerModel: null, startedAt: "now", message: "已完成", subtasks: [
      { id: "verify_diagram_visual:usecase", label: "用例图", status: "pending_review", message: review.reason, errorMessage: null },
    ] });
    task.diagnostics.transcript = [{ type: "completed", snapshot: createRunSnapshot({ status: "completed", visualReviews: { usecase: review } }) }];
    const confirmed = applyVisualReviewConfirmations(task, { "requirements:usecase": { ...review, confirmedAt: "confirmed" } });
    expect(confirmed.subtasks[0]).toEqual(expect.objectContaining({ status: "completed", message: "已人工确认当前图" }));
    expect(confirmed.title).not.toContain("待确认");
    expect(applyVisualReviewConfirmations(task, { "requirements:usecase": { ...review, checkedAt: "check-2", confirmedAt: "confirmed" } }).subtasks[0].status).toBe("pending_review");
  });

  it.each(["failed", "not_completed"] as const)("preserves a %s review in snapshot reconciliation and ignores manual confirmation", (status) => {
    const review = { findings: [], status, issues: ["检查未完成"], reason: "结构检查失败或未完成", attempts: 1, checkedAt: "check-1" };
    const task = createGenerationTask({ clientTaskId: "failed-review", kind: "requirements", title: "需求模型生成", providerModel: null, startedAt: "now", message: "生成中", subtasks: [
      { id: "verify_diagram_visual:usecase", label: "用例", status: "running", message: null, errorMessage: null },
    ] });
    const reconciled = updateTaskFromEvent(task, { type: "completed", snapshot: createRunSnapshot({ status: "completed", visualReviews: { usecase: review } }) }, { queued: "排队中", completed: "生成完成" });
    expect(reconciled.subtasks[0].status).toBe(status === "failed" ? "failed" : "pending_review");
    const confirmed = applyVisualReviewConfirmations(reconciled, { "requirements:usecase": { ...review, confirmedAt: "confirmed" } });
    expect(confirmed.subtasks[0].status).toBe(reconciled.subtasks[0].status);
  });

  it("keeps each diagram in visual review after SVG completion", () => {
    let task = createGenerationTask({
      clientTaskId: "visual-parallel", kind: "requirements", title: "需求模型生成",
      providerModel: "vision-model", startedAt: "2026-09-23T00:00:00.000Z", message: "生成中",
      subtasks: ["usecase", "class"].flatMap((id) => [
        { id: `render_svg:${id}`, label: id, status: "queued" as const, message: null, errorMessage: null },
        { id: `verify_diagram_visual:${id}`, label: id, status: "queued" as const, message: null, errorMessage: null },
      ]),
    });
    const labels = { queued: "排队中", completed: "生成完成" };
    task = updateTaskFromEvent(task, { type: "artifact_ready", stage: "render_svg", artifactKind: "svg", diagramKind: "usecase", subtaskId: "usecase", subtaskStatus: "completed" } satisfies RunEventInput, labels);
    expect(task.subtasks.find((item) => item.id === "verify_diagram_visual:usecase")?.status).toBe("queued");
    expect(task.subtasks.find((item) => item.id === "verify_diagram_visual:class")?.status).toBe("queued");
    task = updateTaskFromEvent(task, { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, diagramKind: "usecase", subtaskId: "usecase", subtaskStatus: "running", message: "正在检查图面" } satisfies RunEventInput, labels);
    expect(task.subtasks.find((item) => item.id === "verify_diagram_visual:usecase")).toEqual(expect.objectContaining({ status: "running", message: "正在检查图面" }));
    expect(task.subtasks.find((item) => item.id === "verify_diagram_visual:class")?.status).toBe("queued");
    task = updateTaskFromEvent(task, { type: "stage_progress", stage: "verify_diagram_visual", progress: 98, diagramKind: "usecase", subtaskId: "usecase", subtaskStatus: "pending_review", message: "视觉检查仍有问题：标签不可读" } satisfies RunEventInput, labels);
    expect(task.subtasks.find((item) => item.id === "verify_diagram_visual:usecase")).toEqual(expect.objectContaining({ status: "pending_review", message: "视觉检查仍有问题：标签不可读" }));
    expect(task.subtasks.find((item) => item.id === "verify_diagram_visual:class")?.status).toBe("queued");
  });
  it("keeps concrete visual findings when a completed snapshot reconciles subtasks", () => {
    const task = createGenerationTask({
      clientTaskId: "visual-findings", kind: "requirements", title: "需求模型生成",
      providerModel: "vision-model", startedAt: "2026-09-23T00:00:00.000Z", message: "生成中",
      subtasks: ["usecase", "class"].map((id) => ({
        id: `verify_diagram_visual:${id}`, label: id, status: "running" as const, message: null, errorMessage: null,
      })),
    });
    const next = updateTaskFromEvent(task, {
      type: "completed",
      snapshot: createRunSnapshot({ status: "completed", visualReviews: {
        usecase: { findings: [], status: "pending_review", issues: ["标签不可读", "连线交叉"], reason: "视觉检查仍有问题，请人工确认", attempts: 3, checkedAt: "2026-09-23T00:00:00.000Z" },
        class: { findings: [], status: "pending_review", issues: [], reason: "需要人工核对", attempts: 1, checkedAt: "2026-09-23T00:00:00.000Z" },
      } }),
    }, { queued: "排队中", completed: "生成完成" });
    expect(next.subtasks.find((item) => item.id === "verify_diagram_visual:usecase")?.message).toBe("标签不可读");
    expect(next.subtasks.find((item) => item.id === "verify_diagram_visual:class")?.message).toBe("需要人工核对");
  });
  it("completes extraction from its terminal snapshot", () => {
    const task = createGenerationTask({
      clientTaskId: "rules-1", kind: "requirements", title: "需求规则生成",
      providerModel: "fake-model", startedAt: "2026-09-23T00:00:00.000Z",
      message: "排队中", subtasks: [
        { id: "extract_rules", label: "抽取需求规则", status: "completed", message: null, errorMessage: null },
      ],
    });
    const next = updateTaskFromEvent(task, {
      type: "completed", snapshot: createRunSnapshot({ selectedDiagrams: [], requirementBaseline: createRequirementBaseline(), status: "completed" }),
    }, { queued: "排队中", completed: "生成完成" });
    expect(next.status).toBe("completed");
    expect(next.message).not.toBe("正在修复需求规则");
    expect(next.finishedAt).not.toBeNull();
  });
  it("completes extraction when no requirement baseline requires a repair pass", () => {
    const task = createGenerationTask({
      clientTaskId: "rules-empty", kind: "requirements", title: "需求规则生成",
      providerModel: "fake-model", startedAt: "2026-09-23T00:00:00.000Z",
      message: "排队中", subtasks: [
        { id: "extract_rules", label: "抽取需求规则", status: "completed", message: null, errorMessage: null },
      ],
    });
    const next = updateTaskFromEvent(task, {
      type: "completed", snapshot: createRunSnapshot({ selectedDiagrams: [], requirementBaseline: null }),
    }, { queued: "排队中", completed: "生成完成" });
    expect(next.status).toBe("completed");
    expect(next.finishedAt).not.toBeNull();
  });
  it("ignores blank llm chunks in user-visible diagnostics", () => {
    const diagnostics = createEmptyDiagnostics();
    const blankEvent = {
      type: "llm_chunk",
      stage: "generate_models",
      chunk: "   \n",
    } satisfies RunEventInput;

    const next = updateDiagnosticsFromEvent(diagnostics, blankEvent);



    expect(next.events).toEqual([]);
    expect(next.activeStage).toBe("generate_models");
  });

  it("counts effective llm chunks without adding recent event badges", () => {
    const diagnostics = createEmptyDiagnostics();
    const next = updateDiagnosticsFromEvent(diagnostics, {
      type: "llm_chunk",
      stage: "generate_models",
      chunk: "\"models\"",
    });



    expect(next.events).toEqual([]);
  });

  it("marks only the failed submodel from a completed snapshot with diagram errors", () => {
    const task = createGenerationTask({
      clientTaskId: "requirements-1",
      kind: "requirements",
      title: "需求模型生成",
      providerModel: "fake-model",
      startedAt: "2026-05-24T00:00:00.000Z",
      message: "排队中",
      subtasks: [
        {
          id: "usecase",
          label: "用例模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
        {
          id: "activity",
          label: "活动图",
          status: "running",
          message: "正在生成：activity",
          errorMessage: null,
        },
      ],
    });

    const event = {
      type: "completed",
      snapshot: createRunSnapshot({
        runId: "run-1",
        requirementText: "一个小型图书馆管理系统",
        selectedDiagrams: ["usecase", "activity"],
        rules: [],
        models: [
          { summary: "", relationships: [], actors: [], useCases: [], systemBoundaries: [],
            notes: [],
            diagramKind: "usecase",
            title: "用例模型",
          },
        ],
        requirementModelTraceability: [],
        plantUml: [],
        svgArtifacts: [
          {
            diagramKind: "usecase",
            svg: "<svg />",
            renderMeta: createRenderMeta({ engine: "plantuml" }),
          },
        ],
        diagramErrors: {
          activity: {
            stage: "generate_models",
            error: {
              code: "RUN_STRUCTURED_OUTPUT_INVALID",
              message: "activity JSON 修复失败",
              category: "generation",
              retryable: true,
            },
          },
        },
        requirementTrace: [],
        currentStage: null,
        status: "completed",
        error: null,
      }),
    } satisfies RunEventInput;

    const next = updateTaskFromEvent(task, event, {
      queued: "排队中",
      completed: "完成",
    });

    expect(next.title).toBe("需求模型生成：1/2 完成，1 个失败");
    expect(next.status).toBe("failed");
    expect(next.message).toBe("完成，但 1 个子任务失败");

    expect(next.errorMessage).toBe("完成，但 1 个子任务失败");
    expect(next.subtasks).toEqual([
      expect.objectContaining({ id: "usecase", status: "completed" }),
      expect.objectContaining({
        id: "activity",
        status: "failed",
        errorMessage: "模型返回的结构化结果不合法，请重试。",
      }),
    ]);
  });

  it("shows queued subtask position and pending traceability review in task summaries", () => {
    const task = createGenerationTask({
      clientTaskId: "design-1",
      kind: "design",
      title: "设计模型生成",
      providerModel: "gpt-5.4",
      startedAt: "2026-05-24T00:00:00.000Z",
      message: "排队中",
      subtasks: [
        {
          id: "class",
          label: "设计类图",
          status: "queued",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const queued = updateTaskFromEvent(
      task,
      {
        type: "stage_progress",
        stage: "generate_design_models",
        progress: 35,
        diagramKind: "class",
        subtaskId: "class",
        subtaskLabel: "设计类图",
        subtaskStatus: "queued",
        queuePosition: 2,
        queueAhead: 1,
        waitMs: 12_000,
        estimatedWaitMs: 60_000,
        queueReason: "project",
        message: "模型调用排队中：前方 1 个模型调用",
      } satisfies RunEventInput,
      {
        queued: "设计生成任务已进入队列",
        completed: "设计生成完成",
      },
    );

    expect(queued.title).toBe("设计模型生成");
    expect(queued.subtasks[0]).toEqual(
      expect.objectContaining({
        id: "class",
        label: "设计类图",
        status: "queued",
        queueAhead: 1,
        queueReason: "project",
      }),
    );

    const pending = updateTaskFromEvent(
      queued,
      {
        type: "completed",
        snapshot: createDesignRunSnapshot({
          runId: "run-design-1",
          requirementText: "图书馆系统",
          selectedDiagrams: ["class"],
          rules: [],
          requirementModels: [],
          requirementModelTraceability: [],
          models: [
            { summary: "", interfaces: [], enums: [],
              notes: [],
              diagramKind: "class",
              title: "设计类图",
              classes: [],
              relationships: [],
            },
          ],
          designModelTraceability: [
            {
              source: {
                diagramKind: "class",
                elementId: "class-loan-service",
                elementKind: "class",
                label: "LoanService",
              },
              targets: [
                {
                  diagramKind: "usecase",
                  elementId: "uc_borrow_book",
                  elementKind: "usecase",
                  label: "借书",
                },
              ],
              mappingSource: "llm",
            },
          ],
          plantUml: [],
          svgArtifacts: [
            {
              diagramKind: "class",
              svg: "<svg />",
              renderMeta: createRenderMeta({ engine: "plantuml" }),
            },
          ],
          diagramErrors: {},
          designTrace: [],
          currentStage: null,
          status: "completed",
          error: null,
        }),
      } satisfies RunEventInput,
      {
        queued: "设计生成任务已进入队列",
        completed: "设计生成完成",
      },
    );

    expect(pending.title).toBe("设计模型生成");
    expect(pending.subtasks[0]).toEqual(
      expect.objectContaining({
        id: "class",
        status: "completed",
        message: "已完成",
      }),
    );
  });

  it("does not downgrade a completed subtask when a later artifact event has no explicit status", () => {
    const task = createGenerationTask({
      clientTaskId: "design-sequence-1",
      kind: "design",
      title: "生成设计顺序图",
      providerModel: "gpt-5.4",
      startedAt: "2026-05-24T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "sequence",
          label: "顺序图",
          status: "completed",
          message: "模型调用完成",
          errorMessage: null,
        },
      ],
    });

    const next = updateTaskFromEvent(
      task,
      {
        type: "artifact_ready",
        stage: "generate_design_sequence",
        artifactKind: "model",
        diagramKind: "sequence",
      } satisfies RunEventInput,
      {
        queued: "设计生成任务已进入队列",
        completed: "设计生成完成",
      },
    );

    expect(next.subtasks[0]).toEqual(
      expect.objectContaining({
        id: "sequence",
        status: "completed",
        message: "已完成",
      }),
    );
  });

  it("does not add an aggregate sequence completion when use-case sequence subtasks exist", () => {
    const task = createGenerationTask({
      clientTaskId: "design-sequence-2",
      kind: "design",
      title: "生成设计顺序图",
      providerModel: "gpt-5.4",
      startedAt: "2026-05-24T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "sequence:uc_view",
          label: "顺序图：查看活动",
          status: "completed",
          message: null,
          errorMessage: null,
        },
        {
          id: "sequence:uc_create",
          label: "顺序图：创建活动",
          status: "rendering",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const next = updateTaskFromEvent(
      task,
      {
        type: "artifact_ready",
        stage: "generate_design_sequence",
        artifactKind: "model",
        diagramKind: "sequence",
        subtaskId: "sequence",
        subtaskStatus: "completed",
      } satisfies RunEventInput,
      {
        queued: "设计生成任务已进入队列",
        completed: "设计生成完成",
      },
    );

    expect(next.subtasks.map((subtask) => subtask.id)).toEqual([
      "sequence:uc_view",
      "sequence:uc_create",
    ]);
  });

  it("replaces aggregate analysis placeholders when per-use-case analysis subtasks appear", () => {
    const task = createGenerationTask({
      clientTaskId: "requirements-analysis-1",
      kind: "requirements",
      title: "需求模型生成",
      providerModel: "gpt-5.4",
      startedAt: "2026-06-05T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "generate_models:analysis",
          label: "需求分析模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
        {
          id: "generate_plantuml:analysis",
          label: "需求分析模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
        {
          id: "render_svg:analysis",
          label: "需求分析模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const modelStarted = updateTaskFromEvent(
      task,
      {
        type: "stage_progress",
        stage: "generate_models",
        progress: 35,
        diagramKind: "analysis",
        subtaskId: "analysis:uc_view",
        subtaskLabel: "需求分析模型：查看预约",
        subtaskStatus: "running",
        message: "正在生成需求分析模型：查看预约",
      } satisfies RunEventInput,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(modelStarted.subtasks.map((subtask) => subtask.id)).toEqual([
      "generate_plantuml:analysis",
      "render_svg:analysis",
      "generate_models:analysis:uc_view",
    ]);

    const plantUmlReady = updateTaskFromEvent(
      modelStarted,
      {
        type: "artifact_ready",
        stage: "generate_plantuml",
        artifactKind: "plantuml",
        diagramKind: "analysis",
        modelId: "analysis:uc_view",
        subtaskId: "analysis:uc_view",
        subtaskLabel: "查看预约需求分析模型",
        subtaskStatus: "completed",
      } satisfies RunEventInput,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(plantUmlReady.subtasks.map((subtask) => subtask.id)).toEqual([
      "render_svg:analysis",
      "generate_models:analysis:uc_view",
      "generate_plantuml:analysis:uc_view",
    ]);
  });

  it("does not add unplanned preserved model artifacts to partial rerun tasks", () => {
    const task = createGenerationTask({
      clientTaskId: "requirements-analysis-partial-1",
      kind: "requirements",
      title: "需求模型生成",
      providerModel: "gpt-5.4",
      startedAt: "2026-06-05T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "generate_models:analysis:uc_view",
          label: "需求分析模型：查看预约",
          status: "completed",
          message: null,
          errorMessage: null,
        },
        {
          id: "generate_plantuml:analysis:uc_view",
          label: "需求分析模型：查看预约",
          status: "queued",
          message: null,
          errorMessage: null,
        },
        {
          id: "render_svg:analysis:uc_view",
          label: "需求分析模型：查看预约",
          status: "queued",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const afterPreservedPlantUml = updateTaskFromEvent(
      task,
      {
        type: "artifact_ready",
        stage: "generate_plantuml",
        artifactKind: "plantuml",
        diagramKind: "usecase",
        subtaskId: "usecase",
        subtaskStatus: "completed",
      } satisfies RunEventInput,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    const afterPreservedSvg = updateTaskFromEvent(
      afterPreservedPlantUml,
      {
        type: "artifact_ready",
        stage: "render_svg",
        artifactKind: "svg",
        diagramKind: "usecase",
        subtaskId: "usecase",
        subtaskStatus: "completed",
      } satisfies RunEventInput,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(afterPreservedSvg.subtasks.map((subtask) => subtask.id)).toEqual([
      "generate_models:analysis:uc_view",
      "generate_plantuml:analysis:uc_view",
      "render_svg:analysis:uc_view",
    ]);
  });

  it("marks only the missing use-case sequence subtask from model-specific errors", () => {
    const task = createGenerationTask({
      clientTaskId: "design-sequence-3",
      kind: "design",
      title: "生成设计顺序图",
      providerModel: "gpt-5.4",
      startedAt: "2026-05-24T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "sequence:uc_view",
          label: "顺序图：查看座位",
          status: "running",
          message: null,
          errorMessage: null,
        },
        {
          id: "sequence:uc_filter_date",
          label: "顺序图：日期筛选",
          status: "running",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const next = updateTaskFromEvent(
      task,
      {
        type: "completed",
        snapshot: createDesignRunSnapshot({
          runId: "run-design-sequence-partial",
          requirementText: "共享自习室座位预约系统",
          selectedDiagrams: ["sequence"],
          rules: [],
          requirementModels: [],
          requirementModelTraceability: [],
          models: [
            {
              diagramKind: "sequence",
              modelId: "sequence:uc_view",
              sourceUseCaseId: "uc_view",
              sourceUseCaseName: "查看座位",
              title: "查看座位顺序图",
              summary: "查看座位的对象交互流程。",
              notes: [],
              participants: [],
              messages: [],
              fragments: [],
            },
          ],
          designModelTraceability: [],
          plantUml: [],
          svgArtifacts: [],
          diagramErrors: {
            "sequence:uc_filter_date": {
              stage: "generate_design_sequence",
              error: {
                code: "RUN_MODEL_OUTPUT_EMPTY",
                message: "日期筛选顺序图生成结果为空",
                category: "generation",
                retryable: true,
              },
            },
          },
          designTrace: [],
          currentStage: "generate_design_sequence",
          status: "failed",
          error: {
            code: "RUN_MODEL_OUTPUT_EMPTY",
            message: "缺少 1 个用例顺序图：uc_filter_date:日期筛选",
            category: "generation",
            retryable: true,
          },
        }),
      } satisfies RunEventInput,
      {
        queued: "设计生成任务已进入队列",
        completed: "设计生成完成",
      },
    );

    expect(next.title).toBe("生成设计顺序图：1/2 完成，1 个失败");
    expect(next.subtasks).toEqual([
      expect.objectContaining({ id: "sequence:uc_view", status: "completed" }),
      expect.objectContaining({
        id: "sequence:uc_filter_date",
        status: "failed",
        errorMessage: "模型未生成有效结果，请重试或检查模型输出。",
      }),
    ]);
  });

  it("keeps model, PlantUML, and SVG subtasks separate for the same diagram", () => {
    const task = createGenerationTask({
      clientTaskId: "requirements-segmented-1",
      kind: "requirements",
      title: "需求模型生成",
      providerModel: "gpt-5.4",
      startedAt: "2026-06-05T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "generate_models:deployment",
          label: "部署需求模型",
          status: "running",
          message: null,
          errorMessage: null,
        },
        {
          id: "generate_plantuml:deployment",
          label: "部署需求模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
        {
          id: "render_svg:deployment",
          label: "部署需求模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const modelReady = updateTaskFromEvent(
      task,
      {
        type: "artifact_ready",
        stage: "generate_models",
        artifactKind: "model",
        diagramKind: "deployment",
        subtaskId: "deployment",
        subtaskStatus: "completed",
      } satisfies RunEventInput,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(modelReady.subtasks).toEqual([
      expect.objectContaining({ id: "generate_models:deployment", status: "completed" }),
      expect.objectContaining({ id: "generate_plantuml:deployment", status: "queued" }),
      expect.objectContaining({ id: "render_svg:deployment", status: "queued" }),
    ]);

    const plantUmlReady = updateTaskFromEvent(
      modelReady,
      {
        type: "artifact_ready",
        stage: "generate_plantuml",
        artifactKind: "plantuml",
        diagramKind: "deployment",
        subtaskId: "deployment",
        subtaskStatus: "rendering",
      } satisfies RunEventInput,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(plantUmlReady.subtasks).toEqual([
      expect.objectContaining({ id: "generate_models:deployment", status: "completed" }),
      expect.objectContaining({ id: "generate_plantuml:deployment", status: "completed" }),
      expect.objectContaining({ id: "render_svg:deployment", status: "queued" }),
    ]);

    const repairing = updateTaskFromEvent(
      plantUmlReady,
      {
        type: "stage_progress",
        stage: "render_svg",
        progress: 95,
        message: "PlantUML 编译失败，正在尝试修复（1/2）",
        diagramKind: "deployment",
        subtaskId: "deployment",
        subtaskStatus: "repairing",
      } satisfies RunEventInput,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(repairing.title).toBe("需求模型生成：模型 1/1，图源码 1/1，SVG 0/1");
    expect(repairing.subtasks).toEqual([
      expect.objectContaining({ id: "generate_models:deployment", status: "completed" }),
      expect.objectContaining({ id: "generate_plantuml:deployment", status: "completed" }),
      expect.objectContaining({ id: "render_svg:deployment", status: "repairing" }),
    ]);
  });

  it("keeps completed rendered models separate from models still generating", () => {
    const task = createGenerationTask({
      clientTaskId: "requirements-overlap-1",
      kind: "requirements",
      title: "需求模型生成",
      providerModel: "gpt-5.4",
      startedAt: "2026-06-06T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "generate_models:usecase",
          label: "用例模型",
          status: "completed",
          message: "模型调用完成",
          errorMessage: null,
        },
        {
          id: "generate_plantuml:usecase",
          label: "用例模型",
          status: "completed",
          message: null,
          errorMessage: null,
        },
        {
          id: "render_svg:usecase",
          label: "用例模型",
          status: "rendering",
          message: "正在渲染：用例模型",
          errorMessage: null,
        },
        {
          id: "generate_models:class",
          label: "领域概念模型",
          status: "running",
          message: "正在生成结构化模型：class",
          errorMessage: null,
        },
        {
          id: "generate_plantuml:class",
          label: "领域概念模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
        {
          id: "render_svg:class",
          label: "领域概念模型",
          status: "queued",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const next = updateTaskFromEvent(
      task,
      {
        type: "artifact_ready",
        stage: "render_svg",
        artifactKind: "svg",
        diagramKind: "usecase",
        subtaskId: "usecase",
        subtaskStatus: "completed",
      } satisfies RunEventInput,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(next.title).toBe("需求模型生成：模型 1/2，图源码 1/2，SVG 1/2");
    expect(next.subtasks).toEqual([
      expect.objectContaining({ id: "generate_models:usecase", status: "completed" }),
      expect.objectContaining({ id: "generate_plantuml:usecase", status: "completed" }),
      expect.objectContaining({ id: "render_svg:usecase", status: "completed" }),
      expect.objectContaining({ id: "generate_models:class", status: "running" }),
      expect.objectContaining({ id: "generate_plantuml:class", status: "queued" }),
      expect.objectContaining({ id: "render_svg:class", status: "queued" }),
    ]);
  });

  it("marks downstream diagram source and render subtasks failed when model generation fails", () => {
    const task = createGenerationTask({
      clientTaskId: "design-activity-failure",
      kind: "design",
      title: "设计模型生成",
      providerModel: "deepseek-ai/DeepSeek-V4-Pro",
      startedAt: "2026-06-06T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "generate_design_models:activity",
          label: "界面关系图",
          status: "running",
          message: "模型调用开始执行",
          errorMessage: null,
        },
        {
          id: "generate_plantuml:activity",
          label: "界面关系图",
          status: "queued",
          message: "等待执行",
          errorMessage: null,
        },
        {
          id: "render_svg:activity",
          label: "界面关系图",
          status: "queued",
          message: "等待执行",
          errorMessage: null,
        },
      ],
    });

    const next = updateTaskFromEvent(
      task,
      {
        type: "stage_progress",
        stage: "generate_design_models",
        progress: 70,
        message: "界面关系图 超过 180000ms 未完成",
        diagramKind: "activity",
        subtaskId: "activity",
        subtaskLabel: "界面关系图",
        subtaskStatus: "failed",
      } satisfies RunEventInput,
      {
        queued: "设计生成任务已进入队列",
        completed: "设计生成完成",
      },
    );

    expect(next.title).toBe("设计模型生成：模型 0/1，图源码 0/1，SVG 0/1，1 个失败");
    expect(next.subtasks).toEqual([
      expect.objectContaining({
        id: "generate_design_models:activity",
        status: "failed",
      }),
      expect.objectContaining({
        id: "generate_plantuml:activity",
        status: "failed",
        message: "前置模型生成失败，未执行",
      }),
      expect.objectContaining({
        id: "render_svg:activity",
        status: "failed",
        message: "前置模型生成失败，未执行",
      }),
    ]);
  });

  it("applies terminal snapshot errors to the matching stage-scoped subtask only", () => {
    const task = createGenerationTask({
      clientTaskId: "requirements-segmented-2",
      kind: "requirements",
      title: "需求模型生成",
      providerModel: "gpt-5.4",
      startedAt: "2026-06-05T00:00:00.000Z",
      message: "生成中",
      subtasks: [
        {
          id: "generate_models:deployment",
          label: "部署需求模型",
          status: "completed",
          message: null,
          errorMessage: null,
        },
        {
          id: "generate_plantuml:deployment",
          label: "部署需求模型",
          status: "completed",
          message: null,
          errorMessage: null,
        },
        {
          id: "render_svg:deployment",
          label: "部署需求模型",
          status: "rendering",
          message: null,
          errorMessage: null,
        },
      ],
    });

    const next = updateTaskFromEvent(
      task,
      {
        type: "completed",
        snapshot: createRunSnapshot({
          runId: "run-segmented-terminal",
          requirementText: "部署到 Web 和数据库服务器",
          selectedDiagrams: ["deployment"],
          rules: [],
          models: [{ summary: "", relationships: [], nodes: [], databases: [], components: [], artifacts: [], externalSystems: [],  notes: [], diagramKind: "deployment", title: "部署需求模型" }],
          requirementModelTraceability: [],
          plantUml: [
            {
              diagramKind: "deployment",
              source: "@startuml\n@enduml",
            },
          ],
          svgArtifacts: [],
          diagramErrors: {
            deployment: {
              stage: "render_svg",
              error: {
                code: "RUN_RENDER_FAILED",
                message: "PlantUML repair failed",
                category: "render",
                retryable: true,
              },
            },
          },
          requirementTrace: [],
          currentStage: "render_svg",
          status: "completed",
          error: null,
        }),
      } satisfies RunEventInput,
      {
        queued: "任务已进入队列",
        completed: "生成完成",
      },
    );

    expect(next.subtasks).toEqual([
      expect.objectContaining({ id: "generate_models:deployment", status: "completed" }),
      expect.objectContaining({ id: "generate_plantuml:deployment", status: "completed" }),
      expect.objectContaining({
        id: "render_svg:deployment",
        status: "failed",
        errorMessage: "图形渲染失败，请检查模型结果后重试。",
      }),
    ]);
  });
});
