// Prepares one durable user turn and its pre-turn checkpoint before HTTP acknowledgement or model execution.
import { randomUUID } from "node:crypto";
import type { StandardProjectState } from "@uml-platform/contracts";
import type { StandardCommand } from "./standard-project-pipeline.js";
import { restoreStandardSession } from "../../records/standard-agent-session.js";
import { conversationTurnMarker } from "../../records/standard-conversation-revision.js";
import { resolveStandardScopeAnswers } from "./standard-generation-scope.js";
import { detectUnsupportedStandardDiagrams, recordUnsupportedDiagramRequest } from "./standard-diagram-support.js";

export function standardUserMessageId(command: StandardCommand, state: StandardProjectState) {
  return `user:${command.requestId ?? state.run?.id ?? randomUUID()}`;
}

export function prepareStandardAgentTurn(projectId: string, command: StandardCommand, state: StandardProjectState, id = standardUserMessageId(command, state)) {
  const existing = state.conversation?.find(message => message.id === id);
  if (existing) return existing;
  const latest = state.rounds.at(-1);
  if (state.unsupportedDiagramRequest && command.useRecommendations) throw new Error("替代方案必须通过询问组件明确选择并确认，不能使用推荐快捷操作");
  const unsupported = command.answers?.length ? [] : detectUnsupportedStandardDiagrams(command.message ?? "");
  if (command.useRecommendations && latest?.purpose === "generation_scope" && !latest.answers.length && !latest.questions.some(question => question.scopeChoices)) {
    throw new Error("该范围问题缺少模型类型标识，请重新发起模型选择");
  }
  const answers = !unsupported.length && latest && !latest.answers.length ? latest.questions.map(question => {
    const submitted = command.answers?.find(answer => answer.questionId === question.id);
    if (submitted) return submitted;
    if (command.useRecommendations && question.scopeChoices) {
      const choices = question.scopeChoices.filter(choice => choice.recommended);
      return { questionId: question.id, answer: choices.map(choice => choice.label).join("、"), selectedOptionIds: choices.map(choice => choice.id) };
    }
    // A free-form message may start a different request; it cannot answer an ID-based model choice.
    if (question.scopeChoices) return { questionId: question.id, answer: "" };
    return { questionId: question.id, answer: command.message?.trim() || (command.useRecommendations ? question.recommendation : "") };
  }) : [];
  // Validate against the pending question before acknowledging or changing durable state.
  const selection = !unsupported.length && (command.answers?.length || (command.useRecommendations && latest?.questions.some(question => question.scopeChoices)))
    ? resolveStandardScopeAnswers(latest, command.answers?.length ? command.answers : answers, state.unsupportedDiagramRequest) : undefined;
  const answerText = answers.map(answer => answer.answer).join("\n");
  const submitted = command.message?.trim();
  const text = submitted || (answers.length ? answerText : command.useRecommendations ? "按推荐方案继续生成，不再追问。" : command.attachments?.length ? "请根据附件分析项目需求。" : "");
  if (!text) throw new Error("请填写消息");
  const userMessage = { id, role: "user" as const, text, status: "completed" as const, createdAt: new Date().toISOString(), attachments: command.attachments, quote: command.quote,
    ...(selection !== undefined || command.answers?.length ? { answers: structuredClone(answers) } : {}) };
  // Capture clarification and Pi context before applying this turn so edits restore the exact boundary.
  const manager = restoreStandardSession(projectId, state.piSession);
  manager.appendCustomEntry(conversationTurnMarker, { messageId: id, rounds: structuredClone(state.rounds), generationScope: structuredClone(state.generationScope), unsupportedDiagramRequest: structuredClone(state.unsupportedDiagramRequest) });
  state.piSession = { entries: structuredClone(manager.getEntries()), leafId: manager.getLeafId() };
  state.conversation ??= []; state.conversation.push(userMessage);
  if (!state.description) state.description = text;
  if (answers.length && answers.every(answer => answer.answer)) state.rounds[state.rounds.length - 1]!.answers = answers;
  if (selection !== undefined) {
    state.generationScope = { status: "confirmed", kinds: selection };
    delete state.unsupportedDiagramRequest;
  }
  if (unsupported.length) recordUnsupportedDiagramRequest(state, unsupported, id, command.language);
  return userMessage;
}
