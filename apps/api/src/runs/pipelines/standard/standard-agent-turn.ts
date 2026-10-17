// Prepares one durable user turn and its pre-turn checkpoint before HTTP acknowledgement or model execution.
import { randomUUID } from "node:crypto";
import type { StandardProjectState } from "@uml-platform/contracts";
import type { StandardCommand } from "./standard-project-pipeline.js";
import { restoreStandardSession } from "../../records/standard-agent-session.js";
import { conversationTurnMarker } from "../../records/standard-conversation-revision.js";

export function standardUserMessageId(command: StandardCommand, state: StandardProjectState) {
  return `user:${command.requestId ?? state.run?.id ?? randomUUID()}`;
}

export function prepareStandardAgentTurn(projectId: string, command: StandardCommand, state: StandardProjectState, id = standardUserMessageId(command, state)) {
  const existing = state.conversation?.find(message => message.id === id);
  if (existing) return existing;
  const latest = state.rounds.at(-1);
  const answers = latest && !latest.answers.length ? latest.questions.map(question => ({ questionId: question.id,
    answer: command.answers?.find(answer => answer.questionId === question.id)?.answer || command.message?.trim() || (command.useRecommendations ? question.recommendation : "") })) : [];
  const answerText = answers.map(answer => answer.answer).join("\n");
  const legacyText = answers.map(answer => `${latest!.questions.find(question => question.id === answer.questionId)!.title}：${answer.answer}`).join("\n");
  const submitted = command.message?.trim();
  // Older clients echoed the assistant's question with each answer. Strip only that exact generated form.
  const text = (submitted === legacyText ? answerText : submitted) || (answers.length ? answerText : command.useRecommendations ? "按推荐方案继续生成，不再追问。" : command.attachments?.length ? "请根据附件分析项目需求。" : "");
  if (!text) throw new Error("请填写消息");
  const userMessage = { id, role: "user" as const, text, status: "completed" as const, createdAt: new Date().toISOString(), attachments: command.attachments, quote: command.quote };
  // Capture clarification and Pi context before applying this turn so edits restore the exact boundary.
  const manager = restoreStandardSession(projectId, state.piSession);
  manager.appendCustomEntry(conversationTurnMarker, { messageId: id, rounds: structuredClone(state.rounds), generationScope: structuredClone(state.generationScope) });
  state.piSession = { entries: structuredClone(manager.getEntries()), leafId: manager.getLeafId() };
  state.conversation ??= []; state.conversation.push(userMessage);
  if (!state.description) state.description = text;
  if (answers.length && answers.every(answer => answer.answer)) state.rounds[state.rounds.length - 1]!.answers = answers;
  return userMessage;
}
