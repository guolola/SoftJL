// Groups one turn's activity without replacing runtime IDs, action targets, question forms, or rich replies.
import { useRef, useState } from "react";
import { MessagePrimitive, ThreadPrimitive, useAuiState, useScrollLock } from "@assistant-ui/react";
import { useTranslation } from "react-i18next";
import type { StandardConversationMessage } from "@uml-platform/contracts";
import { assistantActivityGroup, conversationDate, conversationDay } from "../../../lib/conversation-presentation";
import { AssistantMessage, UserMessage } from "../source/messages";
import { EditComposer } from "../source/composer";
import { useHomeDemo } from "./environment";
import { DaySeparator } from "./elements/day-separator";
import { RunActivity, type RunActivityStatus } from "./elements/run-activity";
import { ProjectToolCall, ProjectToolTimeline, useToolPresentation } from "./project-tools";

const toolComponents = { tools: { Fallback: ProjectToolCall } };

function RunMessageReasoning() {
  const parts = useAuiState(s => s.message.parts);
  return <>{parts.map((part, index) => part.type === "reasoning" && part.text.trim()
    ? <p key={index} className="text-muted-foreground whitespace-pre-wrap">{part.text}</p> : null)}</>;
}

function RunMessageTools() {
  const parts = useAuiState(s => s.message.parts);
  const { present } = useToolPresentation();
  const indices = parts.flatMap((part, index) => part.type === "tool-call" && !present(part).failed && !present(part).awaiting ? [index] : []);
  return <>
    {indices.length > 1 ? <ProjectToolTimeline indices={indices} /> : indices.map(index => <MessagePrimitive.PartByIndex key={index} index={index} components={toolComponents} />)}
  </>;
}

function RunMessageAttention() {
  const parts = useAuiState(s => s.message.parts);
  const { present } = useToolPresentation();
  return <>{parts.map((part, index) => part.type === "tool-call" && (present(part).failed || present(part).awaiting)
    ? <MessagePrimitive.PartByIndex key={index} index={index} components={toolComponents} /> : null)}</>;
}

function RunMessageAnswer() {
  return <AssistantMessage hideActivity />;
}

function ProjectAssistantRun({ messages, start }: { messages: readonly StandardConversationMessage[]; start: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lockScroll = useScrollLock(ref, 200);
  const { state } = useHomeDemo();
  const { text } = useToolPresentation();
  const thread = useAuiState(s => s.thread.messages);
  const latest = state.rounds.at(-1);
  const ownsQuestions = !latest?.answers.length && !!latest?.questions.length && messages.at(-1)?.id === state.conversation?.at(-1)?.id;
  const running = messages.some(message => message.status === "streaming" || message.tools?.some(tool => tool.status === "running"));
  const failed = messages.some(message => message.status === "failed" || message.tools?.some(tool => tool.status === "failed"));
  const stopped = state.run?.status === "stopped" && messages.at(-1)?.id === state.conversation?.at(-1)?.id;
  const status: RunActivityStatus = running ? "running" : ownsQuestions ? "requires-action" : stopped ? "cancelled" : failed ? "error" : "complete";
  const statusLabel = running ? text("正在处理", "Working") : ownsQuestions ? text("等待回答", "Waiting for answers")
    : stopped ? text("处理已停止", "Stopped") : failed ? text("处理失败或已中断", "Failed or interrupted") : text("处理完成", "Completed");
  // MessageByIndex retains each original runtime scope, so feedback/reload still target the real message ID.
  const render = (message: StandardConversationMessage, component: () => React.JSX.Element) => {
    const index = thread.findIndex(item => item.id === message.id);
    return index < 0 ? null : <ThreadPrimitive.MessageByIndex key={message.id} index={index}
      components={{ AssistantMessage: component, UserMessage, EditComposer }} />;
  };
  const entries = messages.flatMap((message, index) => {
    const hasTools = message.tools?.some(tool => tool.status !== "failed" && !(ownsQuestions && index === messages.length - 1 && tool.name === "ask_questions"));
    return [
      ...(message.reasoning?.trim() ? [{ id: `${message.id}:reasoning`, kind: "reasoning" as const, label: text("正在推理", "Reasoning"), content: render(message, RunMessageReasoning) }] : []),
      ...(hasTools ? [{ id: `${message.id}:tools`, kind: "tool" as const, label: text("工具操作", "Tool activity"), content: render(message, RunMessageTools) }] : []),
    ];
  });
  return <div ref={ref} data-activity-start={start}>
    <RunActivity status={status} statusLabel={statusLabel} entries={entries} open={open}
      onOpenChange={value => { lockScroll(); setOpen(value); }}
      attention={<>{messages.map(message => render(message, RunMessageAttention))}</>}>
      {messages.map((message, index) => message.text.trim() || message.attachments?.length || (ownsQuestions && index === messages.length - 1)
        ? render(message, RunMessageAnswer) : null)}
    </RunActivity>
  </div>;
}

export function ProjectThreadMessage() {
  const { state } = useHomeDemo();
  const { i18n } = useTranslation();
  const id = useAuiState(s => s.message.id);
  const role = useAuiState(s => s.message.role);
  const history = state.conversation ?? [];
  const index = history.findIndex(message => message.id === id);
  const message = history[index];
  const group = assistantActivityGroup(history, index);
  if (group && group.start !== index) return null;
  const date = message && conversationDate(message.createdAt);
  const previousDay = history.slice(0, index).reverse().find(item => conversationDate(item.createdAt));
  const showDay = date && conversationDay(message!.createdAt) !== (previousDay && conversationDay(previousDay.createdAt));
  const locale = i18n.resolvedLanguage?.startsWith("zh") ? "zh-CN" : "en-US";
  const day = showDay ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(date) : undefined;
  return <DaySeparator day={day}>
    <div className="group/message relative">
      {group ? <ProjectAssistantRun messages={group.messages} start={group.start} /> : role === "user" ? <UserMessage /> : <AssistantMessage />}
      {date && <time dateTime={date.toISOString()} title={date.toLocaleString(locale)}
        className="text-muted-foreground pointer-events-none block text-end font-mono text-[11px] opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
        {new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}
      </time>}
    </div>
  </DaySeparator>;
}
