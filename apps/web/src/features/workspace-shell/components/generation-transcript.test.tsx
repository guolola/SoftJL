// Exercises progress-only batch tasks, reader-owned process folding and viewport scrolling.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RunActivityEvent, RunEventInput } from "@uml-platform/contracts";
import { i18n } from "../../../shared/i18n/index";
import { GenerationTranscript } from "./generation-transcript";
import { projectGenerationTranscript, type TranscriptStep } from "../lib/generation-transcript";
import { DESIGN_DIAGRAM_META, DESIGN_DIAGRAM_ORDER, DIAGRAM_META, DIAGRAM_ORDER } from "../../../entities/diagram/model";

const steps: TranscriptStep[] = [{ stage: "generate_models", title: "生成模型", status: "running", messages: ["正在整理用例。"], calls: [{
  id: "a", title: "分析参与者与用例", status: "running", output: "模型正文", summary: "核对参与者", thinking: true, technical: false,
}] }];
afterEach(async () => { await act(async () => { await i18n.changeLanguage("zh-CN"); }); });

describe("stage reading surface", () => {
  it("shows text candidate generation and backend checks without upstream tool calls", () => {
    const activity = (id: string, operation?: RunActivityEvent["operation"]): RunActivityEvent => ({
      type: "run_activity", eventId: id, createdAt: "2026-10-25T00:00:00Z", runId: "r", callId: id,
      stage: "generate_models", phase: "completed", format: "technical", modelId: "usecase", subtaskId: "usecase",
      subtaskLabel: "用例图", operation,
    });
    const events: RunEventInput[] = [activity("candidate"), activity("validation", "structure_check"), activity("compile", "model_compile"),
      { type: "artifact_ready", stage: "generate_models", artifactKind: "model", modelId: "usecase", subtaskId: "usecase", diagramKind: "usecase" }];
    const projected = projectGenerationTranscript(events, "completed", [], {}, { includeContent: false });
    render(<GenerationTranscript taskKey="text-json" kind="requirements" active={false} finalMessage="" steps={projected.visibleSteps} />);
    const task = screen.getByRole("heading", { name: "生成用例模型" }).closest('[data-testid="generation-task-step"]') as HTMLElement;
    expect(within(task).getByText("生成完成")).toBeVisible();
    expect(within(task).getByText(/结构核对/)).toBeVisible();
    expect(within(task).getByText("编译通过")).toBeVisible();
    expect(screen.queryByText(/查询上游资料/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="generation-tool-call"]')).toBeNull();
  });

  it.each(["zh-CN", "en"])("keeps the model name on the parent and short operation labels on children (%s)", async language => {
    await act(async () => { await i18n.changeLanguage(language); });
    const activity = (id: string, operation?: RunActivityEvent["operation"]): RunActivityEvent => ({
      type: "run_activity", eventId: id, createdAt: "2026-10-25T00:00:00Z", runId: "r", callId: id,
      stage: "generate_design_sequence", phase: "completed", format: "technical", modelId: "sequence:UC-01", subtaskId: "sequence:UC-01",
      subtaskLabel: "用例实现设计：填写指导日志", operation,
    });
    const events: RunEventInput[] = [activity("candidate"), activity("validation", "structure_check"), activity("compile", "model_compile"),
      { ...activity("render"), stage: "render_svg" },
      { type: "artifact_ready", stage: "generate_design_sequence", artifactKind: "model", modelId: "sequence:UC-01", subtaskId: "sequence:UC-01", diagramKind: "sequence" }];
    const project = (input: RunEventInput[]) => projectGenerationTranscript(input, "completed", [], {}, { includeContent: false }).visibleSteps;
    const { container, rerender } = render(<GenerationTranscript taskKey="short-labels" kind="design" active={false} finalMessage="" steps={project(events)} />);
    expect(screen.getByRole("heading", { name: "生成用例实现设计：填写指导日志" })).toBeVisible();
    const childLabels = () => Array.from(container.querySelectorAll('[data-slot="generation-call-title"] > span:first-of-type')).map(row => row.textContent);
    const expected = language === "en" ? ["Generation completed", "Check structure", "Compile diagram source", "绘制并保存"]
      : ["生成完成", "结构核对", "编译图形源码", "绘制并保存"];
    expect(childLabels()).toEqual(expected);
    rerender(<GenerationTranscript taskKey="short-labels" kind="design" active={false} finalMessage="" steps={project([...events, ...events])} />);
    expect(childLabels()).toEqual(expected);
  });

  it.each([
    ["started", "正在生成"], ["failed", "生成未完成"], ["cancelled", "生成已停止"],
  ] as const)("uses the actual generation status for a %s child", (phase, label) => {
    const activity: RunActivityEvent = { type: "run_activity", eventId: "candidate", createdAt: "2026-10-25T00:00:00Z",
      runId: "r", callId: "candidate", stage: "generate_design_sequence", phase: phase === "cancelled" ? "started" : phase, format: "technical",
      modelId: "sequence:UC-01", subtaskId: "sequence:UC-01", subtaskLabel: "用例实现设计：填写指导日志" };
    const events: RunEventInput[] = [activity, { ...activity, eventId: "check", callId: "check", phase: "started", operation: "structure_check" }];
    if (phase === "cancelled") events.push({ type: "cancelled", message: "任务已停止" });
    const { container } = render(<GenerationTranscript taskKey="generation-status" kind="design" active finalMessage=""
      steps={projectGenerationTranscript(events).visibleSteps} />);
    const title = container.querySelector('[data-slot="generation-call-title"] > span:first-of-type');
    expect(title).toHaveTextContent(label);
    expect(title).not.toHaveTextContent("填写指导日志");
    expect(screen.queryByText("生成完成")).not.toBeInTheDocument();
  });

  it.each([false, true])("shows named coverage repairs and preserves incomplete coverage after model completion (exhausted=%s)", exhausted => {
    const message = exhausted
      ? "追踪覆盖修复已达到共享 5 次上限，仍有 12 个元素缺少有效映射，覆盖状态仍为不完整。"
      : "追踪覆盖修复（第 2/5 次）：仍有 12 个元素缺少有效映射。";
    const events: RunEventInput[] = [
      { type: "run_activity", eventId: "model", createdAt: "2026-10-18T00:00:00Z", callId: "model", runId: "r", stage: "generate_models", phase: "completed", format: "technical", subtaskId: "function", subtaskLabel: "功能结构图" },
      { type: "stage_progress", stage: "generate_models", progress: 65, subtaskId: "config", modelId: "config", diagramKind: "function", message: "追踪覆盖修复（第 2/5 次）：仍有 12 个元素缺少有效映射。" },
      { type: "run_activity", eventId: "coverage", createdAt: "2026-10-18T00:00:01Z", callId: "coverage", runId: "r", stage: "generate_models", phase: exhausted ? "completed" : "started", format: "technical", subtaskId: "config", modelId: "config", subtaskLabel: "补全模型与需求的对应关系", operation: "model_repair", round: exhausted ? 5 : 2 },
      { type: "stage_progress", stage: "generate_models", progress: 65, subtaskId: "config", modelId: "config", diagramKind: "function", message },
      ...(exhausted ? [{ type: "artifact_ready", stage: "generate_models", artifactKind: "model", subtaskId: "config", modelId: "config", diagramKind: "function" } as RunEventInput] : []),
    ];
    const projected = projectGenerationTranscript(events, exhausted ? "completed" : "running", [], {}, { includeContent: false });
    render(<GenerationTranscript taskKey="coverage-status" kind="requirements" active={!exhausted} finalMessage="" steps={projected.visibleSteps} />);
    const modelStep = screen.getByRole("heading", { name: "生成功能结构图" }).closest('[data-testid="generation-task-step"]') as HTMLElement;
    expect(within(modelStep).getByText(message)).toBeVisible();
    expect(within(modelStep).queryByText(/结构纠错/)).not.toBeInTheDocument();
    if (exhausted) expect(within(modelStep).getByText("覆盖不完整")).toBeVisible();
  });

  it("keeps correction rounds before actual publication under the matching model", () => {
    const call = (id: string, stage: RunActivityEvent["stage"], subtaskId: string, label?: string): RunActivityEvent => ({
      type: "run_activity", eventId: id, createdAt: "2026-10-18T00:00:00Z", callId: id, runId: "r", stage, subtaskId,
      subtaskLabel: label, phase: "completed", format: "technical",
    });
    const progress = (stage: "generate_models" | "verify_diagram_visual", message: string): Extract<RunEventInput, { type: "stage_progress" }> => ({
      type: "stage_progress", stage, progress: 65, subtaskId: "custom-flow", modelId: "custom-flow", diagramKind: "activity", message,
    });
    const repair = (round: number): RunActivityEvent => ({ ...call(`repair-${round}`, "generate_models", "custom-flow", "补全模型与需求的对应关系"),
      modelId: "custom-flow", operation: "model_repair", round });
    const events: RunEventInput[] = [call("model", "generate_models", "activity"),
      progress("generate_models", "追踪覆盖修复（第 2/5 次）：仍有 15 个元素缺少有效映射。"), repair(2),
      progress("generate_models", "追踪覆盖修复（第 3/5 次）：仍有 2 个元素缺少有效映射。"), repair(3),
      progress("generate_models", "追踪覆盖修复完成，全部元素已有有效映射。"),
      call("description", "generate_plantuml", "custom-flow"), call("render", "render_svg", "custom-flow"),
      { ...progress("verify_diagram_visual", "正在执行程序结构校验与绘制"), eventId: "check-1" },
      { ...progress("verify_diagram_visual", "正在执行程序结构校验与绘制"), eventId: "check-1" },
      { ...progress("verify_diagram_visual", "正在执行程序结构校验与绘制"), eventId: "check-2" },
      { ...progress("verify_diagram_visual", "程序结构校验通过"), subtaskStatus: "completed" },
    ];
    const projected = projectGenerationTranscript(events, "completed", [], {}, { includeContent: false });
    const repairCalls = projected.visibleSteps.flatMap(step => step.calls).filter(item => item.title.includes("覆盖修复"));
    expect(repairCalls.map(item => item.diagramKind)).toEqual(["activity", "activity"]);
    render(<GenerationTranscript taskKey="coverage-order" kind="requirements" active={false} finalMessage="" steps={projected.visibleSteps} />);
    const model = screen.getByRole("heading", { name: "生成总体业务流程" }).closest('[data-testid="generation-task-step"]') as HTMLElement;
    const rows = model.querySelectorAll('[data-slot="generation-call-title"]');
    expect(Array.from(rows).map(row => row.textContent)).toEqual([
      expect.any(String), expect.stringContaining("修正模型 · 第 2 次"), expect.stringContaining("修正模型 · 第 3 次"), expect.stringContaining("绘制并保存"),
    ]);
    expect(within(model).queryByRole("heading", { name: /生成图形描述|生成图形预览|模型结构检查/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "生成需求模型" })).not.toBeInTheDocument();
  });

  it.each([false, true])("places coverage progress beneath its explicit analysis model (single=%s)", single => {
    const model = (id: string, name: string, phase: RunActivityEvent["phase"]): RunActivityEvent => ({
      type: "run_activity", eventId: `${id}:${phase}`, createdAt: "2026-10-18T00:00:00Z", format: "technical",
      callId: id, runId: "analysis", stage: "generate_models", phase,
      subtaskId: `analysis:${id}`, modelId: `analysis:${id}`, subtaskLabel: `需求分析模型：${name}`,
    });
    const message = "正在补跑缺失的需求分析模型：管理教师信息";
    const retry = { ...model("teacher", "管理教师信息", "started"), eventId: "teacher-retry", callId: "teacher-retry" };
    const events: RunEventInput[] = [model("teacher", "管理教师信息", "failed"),
      ...(single ? [] : [model("course", "管理课程信息", "completed")]),
      { type: "stage_progress", stage: "generate_models", progress: 65, message, diagramKind: "analysis",
        subtaskId: "analysis:teacher",
        modelId: "analysis:teacher", subtaskLabel: "需求分析模型：管理教师信息",
        subtaskStatus: "running" },
      retry,
    ];
    const { rerender } = render(<GenerationTranscript taskKey="analysis-coverage" kind="requirements" active finalMessage=""
      steps={projectGenerationTranscript(events).steps} />);
    const teacher = screen.getByRole("heading", { name: "生成需求分析模型：管理教师信息" }).closest('[data-testid="generation-task-step"]')!;
    expect(teacher).toHaveTextContent(message);
    expect(screen.getAllByText(message)).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "生成需求模型" })).not.toBeInTheDocument();
    expect(screen.queryByText("需求分析模型覆盖补跑")).not.toBeInTheDocument();
    if (!single) {
      const course = screen.getByRole("heading", { name: "生成需求分析模型：管理课程信息" }).closest('[data-testid="generation-task-step"]')!;
      expect(course).not.toHaveTextContent(message);
    }
    rerender(<GenerationTranscript taskKey="analysis-coverage" kind="requirements" active finalMessage=""
      steps={projectGenerationTranscript([...events, { ...retry, eventId: "retry-end", phase: "completed" },
        { type: "artifact_ready", stage: "generate_models", artifactKind: "model", subtaskId: "analysis:teacher", modelId: "analysis:teacher", subtaskStatus: "completed" },
      ]).steps} />);
    expect(screen.getByRole("heading", { name: "生成需求分析模型：管理教师信息" }).closest('[data-testid="generation-task-step"]')).toHaveTextContent(message);
    expect(screen.getAllByText(message)).toHaveLength(1);
  });

  it("nests design repairs under exact use cases and models", () => {
    const modelCall = (id: string, subtaskId: string, subtaskLabel: string, phase: RunActivityEvent["phase"]): RunActivityEvent => ({
      type: "run_activity", eventId: `${id}:${phase}`, createdAt: "2026-10-17T14:47:30.000Z", callId: id, runId: "design", stage: subtaskId.startsWith("sequence:") ? "generate_design_sequence" : "generate_design_models",
      subtaskId, modelId: subtaskId, subtaskLabel, phase, format: "technical",
    });
    const notice = (id: string, label: string, message: string): RunEventInput => ({
      type: "stage_progress", stage: id.startsWith("sequence:") ? "generate_design_sequence" : "generate_design_models", progress: 65, message,
      subtaskId: id, modelId: id, subtaskLabel: label, diagramKind: id.startsWith("sequence:") ? "sequence" : "architecture",
    });
    const jsonRepair = "设计模型 JSON 结构不合法，正在尝试修复（1/2）";
    const mappingRepair = "设计模型元素映射缺失，正在恢复可追踪关系";
    const events: RunEventInput[] = [
      { type: "stage_progress", stage: "generate_design_sequence", progress: 25, message: "正在生成用例实现设计" },
      modelCall("alarm", "sequence:alarm", "用例实现设计：处理报警", "completed"),
      notice("sequence:alarm", "用例实现设计：处理报警", jsonRepair),
      { ...modelCall("alarm-repair", "sequence:alarm", "用例实现设计：处理报警", "started"), operation: "model_repair", round: 1 },
      modelCall("configure", "sequence:configure", "用例实现设计：配置系统", "completed"),
      notice("sequence:configure", "用例实现设计：配置系统", mappingRepair),
      { type: "artifact_ready", stage: "generate_design_sequence", artifactKind: "model", subtaskId: "sequence", diagramKind: "sequence" },
      { type: "stage_progress", stage: "generate_design_models", progress: 35, message: "正在生成设计阶段结构化模型" },
      modelCall("architecture", "architecture", "总体架构图", "completed"),
      notice("architecture", "总体架构图", mappingRepair),
      modelCall("trace", "architecture", "总体架构图 · 补全模型与需求的对应关系", "started"),
    ];
    const { container } = render(<GenerationTranscript taskKey="design-repairs" kind="design" active finalMessage="" steps={projectGenerationTranscript(events).steps} />);
    expect(screen.getAllByRole("heading", { name: "生成用例实现设计" })).toHaveLength(1);
    const alarm = screen.getByRole("heading", { name: "生成用例实现设计：处理报警" }).closest('[data-testid="generation-task-step"]')!;
    const configure = screen.getByRole("heading", { name: "生成用例实现设计：配置系统" }).closest('[data-testid="generation-task-step"]')!;
    const architecture = screen.getByRole("heading", { name: "生成总体架构图" }).closest('[data-testid="generation-task-step"]')!;
    expect(alarm).toHaveTextContent(jsonRepair);
    expect(configure).toHaveTextContent(mappingRepair);
    expect(configure).not.toHaveTextContent(jsonRepair);
    expect(architecture).toHaveTextContent(mappingRepair);
    expect(architecture.querySelectorAll('[data-slot="generation-call"]')).toHaveLength(2);
    expect(within(architecture as HTMLElement).getByText("正在生成")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "生成设计模型" })).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="generation-task-step"]')).toHaveLength(4);
  });

  it("keeps unscoped repair messages outside the neighboring analysis model", () => {
    const message = "需求分析模型 JSON 需要修复，正在重试";
    const events: RunEventInput[] = [
      { type: "run_activity", eventId: "repair", createdAt: "2026-10-18T00:00:00Z", format: "technical", callId: "repair", runId: "r", stage: "generate_models", phase: "started", operation: "model_repair", modelId: "analysis:order", subtaskId: "analysis:order", subtaskLabel: "需求分析模型：下单" },
      { type: "stage_progress", stage: "generate_models", progress: 65, message },
    ];
    render(<GenerationTranscript taskKey="unscoped" kind="requirements" active finalMessage="" steps={projectGenerationTranscript(events).steps} />);
    const model = screen.getByRole("heading", { name: "生成需求分析模型：下单" }).closest('[data-testid="generation-task-step"]')!;
    expect(model).not.toHaveTextContent(message);
    expect(screen.getByText(message)).toBeVisible();
  });

  it("keeps the use case name visible when only one realization design is generated", () => {
    render(<GenerationTranscript taskKey="single-sequence" kind="design" active finalMessage="" steps={[{
      stage: "generate_design_sequence", title: "生成用例实现设计", messages: [], status: "running", calls: [{ ...steps[0].calls[0],
        subtaskId: "sequence:alarm", title: "用例实现设计：处理报警", message: "设计模型 JSON 结构不合法，正在尝试修复（1/2）",
      }],
    }]} />);
    const category = screen.getByRole("heading", { name: "生成用例实现设计" }).closest('[data-testid="generation-task-step"]')!;
    expect(within(category as HTMLElement).getByRole("heading", { name: "生成用例实现设计：处理报警" })).toBeVisible();
  });

  it.each([
    ...DIAGRAM_ORDER.map((diagramKind) => ({ kind: "requirements" as const, diagramKind, label: DIAGRAM_META[diagramKind].label })),
    ...DESIGN_DIAGRAM_ORDER.map((diagramKind) => ({ kind: "design" as const, diagramKind, label: i18n.t(`diagrams.designKinds.${diagramKind}.label`, { defaultValue: DESIGN_DIAGRAM_META[diagramKind].label }) })),
  ])("matches the $kind sidebar name for $diagramKind", ({ kind, diagramKind, label }) => {
    render(<GenerationTranscript taskKey="names" kind={kind} active finalMessage="" steps={[{
      ...steps[0], stage: kind === "design" ? "generate_design_models" : "generate_models",
      calls: [{ ...steps[0].calls[0], subtaskId: diagramKind, title: "旧模型名称" }],
    }]} />);
    expect(screen.getByRole("heading", { name: `生成${label}` })).toBeVisible();
  });

  it("updates task status indicators after failure and completion", () => {
    const modelStep: TranscriptStep = { ...steps[0], stage: "generate_design_models", messages: [], calls: [{ ...steps[0].calls[0], subtaskId: "class", diagramKind: "class" }] };
    const { rerender } = render(<GenerationTranscript taskKey="state" kind="design" active finalMessage="" steps={[modelStep]} />);
    for (const status of ["failed", "completed"] as const) {
      rerender(<GenerationTranscript taskKey="state" kind="design" active={false} finalMessage="" steps={[{
        ...modelStep, status, finished: true, calls: [{ ...modelStep.calls[0], status }],
      }]} />);
      expect(screen.getByTestId("generation-task-step").querySelector(status === "failed" ? ".lucide-x" : ".lucide-check")).not.toBeNull();
    }
  });
  it("can start with details folded while summary and recovery remain visible", () => {
    render(<GenerationTranscript taskKey="compact" initiallyExpanded={false} active={false} finalMessage="生成失败，请重试。"
      steps={[{ ...steps[0], status: "failed", calls: [{ ...steps[0].calls[0], status: "failed", subtaskId: "usecase", message: "服务暂时不可用" }] }]} />);
    expect(screen.getByRole("button", { name: "思考过程" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("region", { name: "输出总结" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /重试/ })).not.toBeInTheDocument();
  });
  it("does not repeat batch visual failures or add phase-level retry controls", () => {
    const detail = "架构模型追踪关系错配，需核对字段归属。".repeat(10_000);
    const calls = Array.from({ length: 20 }, (_, index) => ({
      ...steps[0].calls[0], id: `review-${index}`, title: `模型 ${index + 1} · 视觉检查`,
      subtaskId: `model-${index}`, status: "pending_review" as const, message: detail,
    }));
    const { container } = render(<GenerationTranscript taskKey="batch-review" active={false} finalMessage="绘图器故障。"
      steps={[{ stage: "verify_diagram_visual", title: "视觉检查", status: "completed", finished: true, messages: [detail], calls: [
        ...calls, { ...calls[0], id: "failed-check", subtaskId: "class", title: "类图 · 结构核对", status: "failed", message: detail },
      ] }]} />);
    expect(container).not.toHaveTextContent(detail);
    expect(container.querySelector('[data-slot="diagram-review-details"]')).toBeNull();
    expect(screen.getAllByText("待确认")).toHaveLength(20);
    expect(container.querySelector('[data-slot="generation-task-issues"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /重试/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "输出总结" })).toHaveTextContent("绘图器故障。");
    fireEvent.click(screen.getByRole("button", { name: "思考过程" }));
    fireEvent.click(screen.getByRole("button", { name: "思考过程" }));
    expect(container).not.toHaveTextContent(detail);
  });

  it("omits review findings, evidence and repair history from the task drawer", () => {
    const reviewSteps: TranscriptStep[] = [{ ...steps[0], stage: "verify_diagram_visual", title: "视觉检查", status: "completed", finished: true, messages: [], calls: [{
      ...steps[0].calls[0], title: "领域模型 · 视觉检查", status: "pending_review", output: "", summary: "", thinking: false,
      review: { status: "pending_review", issues: ["字段标记与约束不同"], reason: "待确认", checkedAt: "check-1", attempts: 1, structureAttempts: 2, repairAttempts: 1, checkOutcome: "differences",
        findings: [{ id: "f1", modelId: "table", layer: "model", category: "model_structure", code: "constraint-marker", observation: "字段标记与约束不同", evidence: [{ source: "constraint", reference: "fk-order", detail: "明确外键" }], verification: "verified", repairable: true }],
        repairHistory: [{ round: 1, target: "model", issueIds: ["f1"], beforeFingerprint: "old", status: "rejected", changes: ["候选改变了模型标题"], reason: "越过授权字段" }], stopReason: "候选越界，保留上一份有效模型" },
    }] }];
    const { container } = render(<GenerationTranscript taskKey="review-details" steps={reviewSteps} active={false} finalMessage="生成完成，问题待确认。" />);
    expect(container.querySelector('[data-slot="diagram-review-details"]')).toBeNull();
    expect(container.querySelector('[data-slot="generation-task-issues"]')).toBeNull();
    expect(container).not.toHaveTextContent("字段标记与约束不同");
    expect(container).not.toHaveTextContent("明确外键");
    expect(container).not.toHaveTextContent("候选改变了模型标题");
    expect(container).not.toHaveTextContent("候选越界");
    expect(screen.getByTestId("generation-task-step")).toHaveTextContent("绘制并保存");
    expect(screen.getByRole("region", { name: "输出总结" })).toHaveTextContent("生成完成，问题待确认。");
  });
  it("retains the user's disclosure choice when prose starts and the stage finishes", () => {
    const { rerender } = render(<GenerationTranscript taskKey="a" steps={steps} active finalMessage="" />);
    const toggle = screen.getByRole("button", { name: "正在思考" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const output = [{ ...steps[0], calls: [{ ...steps[0].calls[0], thinking: false, output: "开始输出正文" }] }];
    rerender(<GenerationTranscript taskKey="a" steps={output} active finalMessage="" />);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    rerender(<GenerationTranscript taskKey="a" steps={[{ ...output[0], finished: true, status: "completed" }]} active={false} finalMessage="完成" />);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName("思考过程");
    expect(screen.queryByText("模型推理摘要：核对参与者")).not.toBeInTheDocument();
    expect(screen.queryByText("开始输出正文")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "输出总结" })).toHaveTextContent("完成");
    expect(screen.getByRole("region", { name: "输出总结" })).toBeVisible();
  });

  it("animates only the active stage without mounting streamed Markdown", () => {
    const calls = [steps[0].calls[0], { ...steps[0].calls[0], id: "b", title: "生成活动图", thinking: false }];
    const { container, rerender } = render(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], calls }]} active finalMessage="" />);
    const heading = screen.getByText("生成模型");
    expect(screen.queryByText("模型正文")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="ai-shimmer"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="chain-of-thought-step"][data-status="active"]')).toHaveLength(1);
    rerender(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], calls: [{ ...calls[0], output: "模型正文新增\n\n- **要点**\n\n```ts\nconst x = 1\n```" }, calls[1]] }]} active finalMessage="" />);
    expect(screen.getByText("生成模型")).toBe(heading);
    expect(screen.queryByText("模型正文新增")).not.toBeInTheDocument();
    expect(screen.queryByText("要点")).not.toBeInTheDocument();
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector('[data-slot="transcript-prose"]')).toBeNull();
  });

  it("keeps only the concise task failure when the process is folded", () => {
    render(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], status: "failed", messages: ["绘图器故障：SVG 关系不一致，预期标签与实际标签不同"], calls: [{ ...steps[0].calls[0], status: "failed", subtaskId: "usecase", message: "关系缺失，需要修复。" }] }]} active={false} failed finalMessage="用例图：绘图器故障，请重试。" />);
    expect(screen.queryByText(/SVG 关系不一致/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "思考过程" }));
    expect(screen.queryByText(/关系缺失，需要修复/)).not.toBeInTheDocument();
    expect(screen.getByText("用例图：绘图器故障，请重试。")).toBeVisible();
    expect(screen.queryByRole("button", { name: /重试/ })).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="spinner"]')).toBeNull();
  });

  it("uses the shared viewport and preserves manual up-scroll until return to latest", () => {
    const { container, rerender } = render(<GenerationTranscript taskKey="a" steps={steps} active finalMessage="" />);
    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement;
    expect(container.querySelector('[data-slot="scroll-area-scrollbar"]')).toBeNull();
    Object.defineProperties(viewport, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
    fireEvent.wheel(viewport, { deltaY: -100 });
    viewport.scrollTop = 100; fireEvent.scroll(viewport);
    rerender(<GenerationTranscript taskKey="a" steps={[...steps]} active finalMessage="新增结果" />);
    expect(viewport.scrollTop).toBe(100);
    fireEvent.click(screen.getByRole("button", { name: "回到最新" }));
    expect(viewport.scrollTop).toBe(700);
    expect(screen.queryByRole("button", { name: "回到最新" })).not.toBeInTheDocument();
  });

  it("omits streamed reasoning and provider summaries during generation and after completion", () => {
    const withReasoning: TranscriptStep[] = [{ ...steps[0], calls: [{ ...steps[0].calls[0], reasoning: "先检查参与者。", thinking: true }] }];
    const { container, rerender } = render(<GenerationTranscript taskKey="reasoning" steps={withReasoning} active finalMessage="" />);
    expect(screen.queryByRole("button", { name: "思考过程 · 分析参与者与用例" })).not.toBeInTheDocument();
    expect(screen.queryByText("先检查参与者。")).not.toBeInTheDocument();
    expect(screen.queryByText("模型推理摘要：核对参与者")).not.toBeInTheDocument();
    expect(screen.queryByText("模型正文")).not.toBeInTheDocument();
    rerender(<GenerationTranscript taskKey="reasoning" steps={[{ ...withReasoning[0], status: "completed", finished: true, calls: [{ ...withReasoning[0].calls[0], status: "completed", thinking: false, output: "模型正文" }] }]} active={false} finalMessage="完成" />);
    expect(container.querySelector('[data-slot="generation-reasoning"]')).toBeNull();
    expect(screen.queryByText("先检查参与者。")).not.toBeInTheDocument();
    expect(screen.queryByText("模型推理摘要：核对参与者")).not.toBeInTheDocument();
    expect(screen.queryByText("模型正文")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "输出总结" })).toHaveTextContent("完成");
  });

  it("omits provider summaries for calls without reasoning", () => {
    render(<GenerationTranscript taskKey="summary-only" steps={[{ ...steps[0], calls: [{ ...steps[0].calls[0], reasoning: "", summary: "核对参与者", thinking: false }] }]} active finalMessage="" />);
    expect(screen.queryByText("模型推理摘要：核对参与者")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /思考过程/ })).not.toBeInTheDocument();
  });

  it("marks all unfinished parallel stages as active", () => {
    render(<GenerationTranscript taskKey="parallel" steps={[steps[0], { ...steps[0], stage: "render_svg", title: "生成图形预览", messages: [], calls: [{ ...steps[0].calls[0], subtaskId: "usecase" }] }]} active finalMessage="" />);
    expect(screen.queryByText(/任务状态/)).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="chain-of-thought-step"][data-status="active"]')).toHaveLength(2);
  });

  it("groups generation and actual publication with the same artifact identity", () => {
    const description = "展示学生和管理员与预约系统的交互关系。";
    const contextSteps: TranscriptStep[] = [
      { ...steps[0], stage: "generate_context", title: "生成系统环境图", finished: true, status: "completed", messages: [], calls: [{ ...steps[0].calls[0], subtaskId: "context", title: "系统环境图", output: description, status: "completed", thinking: false }] },
      { ...steps[0], stage: "render_context", title: "渲染系统环境图", finished: true, status: "completed", messages: [], calls: [] },
      { ...steps[0], stage: "verify_diagram_visual", title: "视觉检查", finished: true, status: "completed", messages: [], calls: [{ ...steps[0].calls[0], id: "visual", subtaskId: "context", output: "", reasoning: "对照图片核对节点。", status: "completed", thinking: false,
        inputImages: [{ url: "data:image/png;base64,cG5n", caption: "视觉检查使用的环境图" }] }] },
    ];
    const { container } = render(<GenerationTranscript taskKey="context" steps={contextSteps} active={false} finalMessage="系统环境图已生成。" />);
    const chain = container.querySelector('[data-slot="chain-of-thought"]')!;
    expect(screen.getAllByRole("button", { name: "思考过程" })).toHaveLength(1);
    expect(within(chain as HTMLElement).getAllByTestId("generation-task-step")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "执行过程" })).not.toBeInTheDocument();
    expect(screen.queryByText(description)).not.toBeInTheDocument();
    const image = screen.getByRole("img", { name: "视觉检查使用的环境图" });
    expect(image.closest('[data-testid="generation-task-step"]')).toHaveAttribute("aria-label", "生成系统环境图");
    expect(image.closest('[data-slot="chain-of-thought-image"]')).toHaveTextContent("视觉检查使用的环境图");
    const summary = screen.getByRole("region", { name: "输出总结" });
    expect(chain.contains(summary)).toBe(false);
    expect(summary).toHaveTextContent("系统环境图已生成。");
    expect(chain.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps batch prose, technical summaries and reasoning out of the DOM while showing call status", () => {
    const reasoning = "批量推理内容".repeat(10_000);
    const calls = Array.from({ length: 20 }, (_, index) => ({
      ...steps[0].calls[0], id: `model-${index}`, title: `模型 ${index + 1}`, technical: index % 2 === 0,
      reasoning, summary: "批量推理摘要",
      output: index % 2 === 0 ? JSON.stringify({ summary: `模型 ${index + 1} 已生成`, source: "技术原文内容".repeat(10_000) }) : "批量正文内容".repeat(10_000),
    }));
    const { container } = render(<GenerationTranscript taskKey="batch" steps={[{ ...steps[0], calls }]} active finalMessage="" />);
    expect(container.querySelectorAll('[data-slot="generation-call"]')).toHaveLength(20);
    expect(screen.getByText("模型 20")).toBeVisible();
    expect(screen.queryByText("模型 19 已生成")).not.toBeInTheDocument();
    expect(screen.getAllByText("正在处理")).toHaveLength(20);
    expect(container).not.toHaveTextContent("批量推理内容");
    expect(container).not.toHaveTextContent("批量推理摘要");
    expect(container).not.toHaveTextContent("技术原文内容");
    expect(container).not.toHaveTextContent("批量正文内容");
    expect(container.querySelector('[data-slot="transcript-prose"]')).toBeNull();
    expect(container.querySelector("pre")).toBeNull();
    expect(screen.queryByText(/查看技术原文/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "正在思考" }));
    fireEvent.click(screen.getByRole("button", { name: "正在思考" }));
    expect(container).not.toHaveTextContent("技术原文内容");
  });

  it("shows real queue metadata and collapses queued items", () => {
    render(<GenerationTranscript taskKey="queued" steps={[]} active finalMessage="" queue={{
      position: 2, ahead: 1, estimatedWaitMs: 60_000, reason: "project",
      items: [{ id: "class", label: "领域概念模型", ahead: 0, reason: "run" }],
    }} />);
    expect(screen.getByText("队列第 2 位")).toBeVisible();
    expect(screen.getByText(/前方 1 个模型调用/)).toBeVisible();
    expect(screen.getByText("领域概念模型")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "查看排队项目" }));
    expect(screen.getByRole("button", { name: "查看排队项目" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("领域概念模型")).not.toBeVisible();
  });

  it.each([
    ["requirements", "需求建模助手", "Requirements Modeling Assistant"],
    ["design", "设计建模助手", "Design Modeling Assistant"],
    ["document", "文档编写助手", "Documentation Assistant"],
    ["feasibility", "可研分析助手", "Feasibility Study Assistant"],
    ["unknown", "生成助手", "Generation Assistant"],
  ])("localizes the %s assistant and its thought header alongside the recorded model", async (kind, chinese, english) => {
    const { container } = render(<GenerationTranscript taskKey="localized" kind={kind} model="deepseek-flash" steps={steps} active finalMessage="" />);
    const header = container.querySelector('[data-slot="generation-assistant-header"]')!;
    expect(header).toHaveTextContent(chinese);
    expect(header).toHaveTextContent("deepseek-flash");
    expect(screen.queryByText(i18n.t(`generation.taskKinds.${kind}`))).not.toBeInTheDocument();
    expect(screen.queryByText("Agent")).not.toBeInTheDocument();
    expect(screen.queryByText(/任务状态/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "正在思考" })).toBeVisible();
    await act(async () => { await i18n.changeLanguage("en-US"); });
    expect(header).toHaveTextContent(english);
    expect(screen.queryByText(i18n.t(`generation.taskKinds.${kind}`))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thinking" })).toBeVisible();
  });

  it("does not invent a model label for older tasks without recorded metadata", () => {
    const { container } = render(<GenerationTranscript taskKey="legacy" steps={steps} active={false} finalMessage="" />);
    expect(container.querySelector('[data-slot="generation-model"]')).toBeNull();
    expect(screen.getByRole("button", { name: "思考过程" })).toBeVisible();
  });
});
