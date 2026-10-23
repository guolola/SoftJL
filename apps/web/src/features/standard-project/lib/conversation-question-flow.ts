// Maps durable question rounds to the official QuestionFlow props without owning its interaction state.
import type { StandardAnswer, StandardProjectState, StandardQuestion } from "@uml-platform/contracts";
import type { QuestionFlowStep } from "../../../shared/assistant-ui/elements/question-flow";

export type QuestionRound = StandardProjectState["rounds"][number];
export type QuestionSelections = Record<string, string[]>;

function optionsFor(question: StandardQuestion) {
  return question.scopeChoices?.map(choice => ({ id: choice.id, label: choice.label }))
    ?? question.options.map((label, index) => ({ id: `option_${index}`, label }));
}

export function questionFlowSteps(round: QuestionRound, recommendation: (text: string) => string): QuestionFlowStep[] {
  return round.questions.map(question => ({
    id: question.id, question: question.title, description: recommendation(question.recommendation),
    options: optionsFor(question), selectionMode: question.multiple ? "multiple" : "single", minSelections: 1,
  }));
}

export function questionFlowAnswers(round: QuestionRound, selections: QuestionSelections): StandardAnswer[] | null {
  if (round.purpose === "generation_scope" && round.questions.some(question => !question.scopeChoices)) return null;
  if (Object.keys(selections).some(id => !round.questions.some(question => question.id === id))) return null;
  const answers: StandardAnswer[] = [];
  for (const question of round.questions) {
    const ids = selections[question.id] ?? [];
    const options = optionsFor(question);
    if (!ids.length || new Set(ids).size !== ids.length || (!question.multiple && ids.length !== 1)
      || ids.some(id => !options.some(option => option.id === id))) return null;
    // Declining generation cannot authorize any positive choice in the same answer.
    if (ids.length > 1 && question.scopeChoices?.some(choice => !choice.kinds.length && ids.includes(choice.id))) return null;
    const selected = options.filter(option => ids.includes(option.id));
    answers.push({ questionId: question.id, answer: selected.map(option => option.label).join("、"),
      ...(question.scopeChoices ? { selectedOptionIds: selected.map(option => option.id) } : {}) });
  }
  return answers;
}

export function questionFlowReceipt(round: QuestionRound): QuestionSelections | undefined {
  if (round.answers.length !== round.questions.length) return undefined;
  const result: QuestionSelections = {};
  for (const question of round.questions) {
    const answer = round.answers.find(item => item.questionId === question.id);
    if (!answer) return undefined;
    const options = optionsFor(question);
    const ids = answer.selectedOptionIds ?? options.filter(option => option.label === answer.answer).map(option => option.id);
    if (!ids.length || ids.some(id => !options.some(option => option.id === id))) return undefined;
    result[question.id] = ids;
  }
  return result;
}

export function questionRoundForMessage(state: StandardProjectState, messageId: string): QuestionRound | undefined {
  const messages = state.conversation ?? [];
  for (const round of [...state.rounds].reverse()) {
    if (round.answers.length) {
      // Persisted answer IDs locate a receipt at the actual question message, including after reload.
      const answerMessage = [...messages].reverse().find(message => message.role === "user" && round.answers.every(answer =>
        message.answers?.some(item => item.questionId === answer.questionId && item.answer === answer.answer)));
      const answerAt = answerMessage ? messages.indexOf(answerMessage) : -1;
      if (answerAt >= 0 && messages.slice(0, answerAt).reverse().find(message => message.role === "assistant")?.id === messageId) return round;
    } else if (round === state.rounds.at(-1)) {
      if (state.unsupportedDiagramRequest && !round.questions.some(question => question.id === state.unsupportedDiagramRequest!.questionId)) continue;
      if ([...messages].reverse().find(message => message.role === "assistant")?.id === messageId) return round;
    }
  }
  return undefined;
}
