// Exercises progress-only batch tasks, reader-owned process folding and viewport scrolling.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "../../../shared/i18n";
import { GenerationTranscript } from "./generation-transcript";
import type { TranscriptStep } from "../lib/generation-transcript";

const steps: TranscriptStep[] = [{ stage: "generate_models", title: "生成模型", status: "running", messages: ["正在整理用例。"], calls: [{
  id: "a", title: "分析参与者与用例", status: "running", output: "模型正文", summary: "核对参与者", thinking: true, technical: false,
}] }];
afterEach(async () => { await act(async () => { await i18n.changeLanguage("zh-CN"); }); });

describe("stage reading surface", () => {
  it("does not mount batch visual warnings while keeping failed checks retryable", () => {
    const detail = "架构模型追踪关系错配，需核对字段归属。".repeat(10_000);
    const calls = Array.from({ length: 20 }, (_, index) => ({
      ...steps[0].calls[0], id: `review-${index}`, title: `模型 ${index + 1} · 视觉检查`,
      subtaskId: `model-${index}`, status: "pending_review" as const, message: detail,
    }));
    const { container } = render(<GenerationTranscript taskKey="batch-review" active={false} finalMessage="生成完成。" onRetry={() => {}}
      steps={[{ stage: "verify_diagram_visual", title: "视觉检查", status: "completed", finished: true, messages: [detail], calls: [
        ...calls, { ...calls[0], id: "failed-check", subtaskId: "class", title: "类图 · 结构核对", status: "failed", message: detail },
      ] }]} />);
    expect(container).not.toHaveTextContent(detail);
    expect(container.querySelector('[data-slot="diagram-review-details"]')).toBeNull();
    expect(screen.getAllByText("检查已结束")).toHaveLength(20);
    const issues = container.querySelector('[data-slot="generation-task-issues"]') as HTMLElement;
    expect(issues).toHaveTextContent("类图 · 结构核对：视觉检查未完成，可重试。");
    expect(within(issues).getAllByRole("button", { name: "重试此模型" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "思考过程" }));
    fireEvent.click(screen.getByRole("button", { name: "思考过程" }));
    expect(container).not.toHaveTextContent(detail);
  });

  it("omits review findings, evidence and repair history from the task drawer", () => {
    const reviewSteps: TranscriptStep[] = [{ ...steps[0], stage: "verify_diagram_visual", title: "视觉检查", status: "completed", finished: true, messages: [], calls: [{
      ...steps[0].calls[0], title: "领域模型 · 视觉检查", status: "pending_review", output: "", summary: "", thinking: false,
      review: { status: "pending_review", issues: ["字段标记与约束不同"], reason: "待确认", checkedAt: "check-1", attempts: 1, structureAttempts: 2, repairAttempts: 1, checkOutcome: "differences",
        findings: [{ id: "f1", modelId: "table", layer: "model", code: "constraint-marker", observation: "字段标记与约束不同", evidence: [{ source: "constraint", reference: "fk-order", detail: "明确外键" }], verification: "verified", repairable: true }],
        repairHistory: [{ round: 1, target: "model", issueIds: ["f1"], beforeFingerprint: "old", status: "rejected", changes: ["候选改变了模型标题"], reason: "越过授权字段" }], stopReason: "候选越界，保留上一份有效模型" },
    }] }];
    const { container } = render(<GenerationTranscript taskKey="review-details" steps={reviewSteps} active={false} finalMessage="生成完成，问题待确认。" />);
    expect(container.querySelector('[data-slot="diagram-review-details"]')).toBeNull();
    expect(container.querySelector('[data-slot="generation-task-issues"]')).toBeNull();
    expect(container).not.toHaveTextContent("字段标记与约束不同");
    expect(container).not.toHaveTextContent("明确外键");
    expect(container).not.toHaveTextContent("候选改变了模型标题");
    expect(container).not.toHaveTextContent("候选越界");
    expect(screen.getByTestId("generation-task-step")).toHaveTextContent("视觉检查");
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
    expect(screen.getAllByText("分析参与者与用例")[0]).not.toHaveAttribute("data-slot", "ai-shimmer");
    rerender(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], calls: [{ ...calls[0], output: "模型正文新增\n\n- **要点**\n\n```ts\nconst x = 1\n```" }, calls[1]] }]} active finalMessage="" />);
    expect(screen.getByText("生成模型")).toBe(heading);
    expect(screen.queryByText("模型正文新增")).not.toBeInTheDocument();
    expect(screen.queryByText("要点")).not.toBeInTheDocument();
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector('[data-slot="transcript-prose"]')).toBeNull();
  });

  it("keeps failures and retry controls visible when the process is folded", () => {
    render(<GenerationTranscript taskKey="a" steps={[{ ...steps[0], status: "failed", calls: [{ ...steps[0].calls[0], status: "failed", subtaskId: "usecase", message: "关系缺失，需要修复。" }] }]} active={false} finalMessage="" onRetry={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "思考过程" }));
    expect(screen.getByText(/关系缺失，需要修复/)).toBeVisible();
    expect(screen.getByRole("button", { name: "重试此模型" })).toBeVisible();
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
    render(<GenerationTranscript taskKey="parallel" steps={[steps[0], { ...steps[0], stage: "render_svg", title: "生成图形预览", messages: [], calls: [] }]} active finalMessage="" />);
    expect(screen.queryByText(/任务状态/)).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="chain-of-thought-step"][data-status="active"]')).toHaveLength(2);
  });

  it("groups generation, rendering and visual review without generated descriptions", () => {
    const description = "展示学生和管理员与预约系统的交互关系。";
    const contextSteps: TranscriptStep[] = [
      { ...steps[0], stage: "generate_context", title: "生成系统环境图", finished: true, status: "completed", messages: [], calls: [{ ...steps[0].calls[0], output: description, status: "completed", thinking: false }] },
      { ...steps[0], stage: "render_context", title: "渲染系统环境图", finished: true, status: "completed", messages: [], calls: [] },
      { ...steps[0], stage: "verify_diagram_visual", title: "视觉检查", finished: true, status: "completed", messages: [], calls: [{ ...steps[0].calls[0], id: "visual", output: "", reasoning: "对照图片核对节点。", status: "completed", thinking: false,
        inputImages: [{ url: "data:image/png;base64,cG5n", caption: "视觉检查使用的环境图" }] }] },
    ];
    const { container } = render(<GenerationTranscript taskKey="context" steps={contextSteps} active={false} finalMessage="系统环境图已生成。" />);
    const chain = container.querySelector('[data-slot="chain-of-thought"]')!;
    expect(screen.getAllByRole("button", { name: "思考过程" })).toHaveLength(1);
    expect(within(chain as HTMLElement).getAllByTestId("generation-task-step")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "执行过程" })).not.toBeInTheDocument();
    expect(screen.queryByText(description)).not.toBeInTheDocument();
    const image = screen.getByRole("img", { name: "视觉检查使用的环境图" });
    expect(image.closest('[data-testid="generation-task-step"]')).toHaveAttribute("aria-label", "视觉检查");
    expect(image.closest('[data-slot="chain-of-thought-image"]')).toHaveTextContent("视觉检查使用的环境图");
    const summary = screen.getByRole("region", { name: "输出总结" });
    expect(chain.contains(summary)).toBe(false);
    expect(summary).toHaveTextContent("系统环境图已生成。");
    expect(summary).toHaveClass("text-black", "dark:text-foreground");
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
