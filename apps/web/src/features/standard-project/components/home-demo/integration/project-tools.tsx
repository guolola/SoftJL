// Maps persisted modeling tool calls onto assistant-ui ToolCall and ToolTimeline elements.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuiState, type ToolCallMessagePartProps } from "@assistant-ui/react";
import { CheckIcon, CircleHelpIcon, CircleXIcon, LoaderCircleIcon } from "lucide-react";
import { ToolCall } from "./elements/tool-call";
import { ToolTimeline } from "./elements/tool-timeline";
import { useHomeDemo } from "./environment";

const labels: Record<string, [string, string]> = {
  read_project: ["读取项目", "Read project"], read_diagram: ["读取图表", "Read diagrams"],
  ask_questions: ["补充需求", "Clarify requirements"], save_outline: ["保存方案", "Save outline"],
  generate_diagrams: ["生成图表", "Generate diagrams"], save_diagram: ["保存图表", "Save diagram"],
  generate_tests: ["生成测试用例", "Generate test cases"], generate_document: ["生成说明书", "Generate document"],
  remember_decisions: ["保存项目约定", "Save project decisions"],
};

export function useToolPresentation() {
  const { i18n } = useTranslation();
  const { state } = useHomeDemo();
  const messageId = useAuiState(s => s.message.id);
  const zh = i18n.resolvedLanguage?.startsWith("zh");
  const text = (chinese: string, english: string) => zh ? chinese : english;
  const latest = state.rounds.at(-1);
  const owner = state.conversation?.filter(message => message.role === "assistant").at(-1)?.id;
  // The question tool finishes when it publishes the form; the business workflow still waits for an answer.
  const waiting = !!latest?.questions.length && !latest.answers.length && owner === messageId;
  return { text, present: (part: Pick<ToolCallMessagePartProps, "toolName" | "status" | "isError" | "result">) => {
    const running = part.status.type === "running";
    const failed = !!part.isError || part.status.type === "incomplete";
    const awaiting = !running && !failed && part.toolName === "ask_questions" && waiting;
    return {
      label: labels[part.toolName]?.[zh ? 0 : 1] ?? part.toolName,
      running, failed, awaiting,
      outcome: failed ? "failed" as const : awaiting ? "waiting" as const : "completed" as const,
      status: running ? text("正在执行", "Running") : failed ? text("执行失败或已中断", "Failed or interrupted")
        : awaiting ? text("等待回答", "Waiting for answers") : text("已完成", "Completed"),
      icon: running ? LoaderCircleIcon : failed ? CircleXIcon : awaiting ? CircleHelpIcon : CheckIcon,
    };
  } };
}

export function ProjectToolCall(part: ToolCallMessagePartProps) {
  const [open, setOpen] = useState(true);
  const { text, present } = useToolPresentation();
  const tool = present(part);
  // Only names and statuses are persisted today; do not invent request arguments or response payloads.
  return <ToolCall label={tool.status} activeLabel={tool.status} query={tool.label}
    request={tool.label} result={tool.status} requestLabel={text("操作", "Action")} resultLabel={text("状态", "Status")}
    running={tool.running} outcome={tool.outcome} open={open} onOpenChange={setOpen} className="my-2 max-w-none" />;
}

export function ProjectToolTimeline({ indices }: { indices: readonly number[] }) {
  const [open, setOpen] = useState(true);
  const parts = useAuiState(s => s.message.parts);
  const { text, present } = useToolPresentation();
  const calls = indices.map(index => parts[index]).filter(part => part?.type === "tool-call");
  const tools = calls.map(part => ({ part, ...present(part) }));
  const running = tools.some(tool => tool.running);
  const failed = tools.some(tool => tool.failed);
  const waiting = tools.some(tool => tool.awaiting);
  const count = text(`${tools.length} 个工具调用`, `${tools.length} tool calls`);
  return <ToolTimeline steps={tools.map(tool => ({ id: tool.part.toolCallId, verb: tool.status, chip: tool.label, icon: tool.icon, running: tool.running }))}
    visibleSteps={tools.length} streaming={running} open={open} onOpenChange={setOpen}
    restingLabel={`${count} · ${failed ? text("部分执行失败或已中断", "Some calls failed or were interrupted") : waiting ? text("等待回答", "Waiting for answers") : text("已完成", "Completed")}`}
    activeLabel={`${count} · ${text("正在执行", "Running")}`} stats={[]} className="my-2 max-w-none" />;
}
