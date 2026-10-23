// Connects durable project questions to assistant-ui's standalone QuestionFlow.
import { useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import { useTranslation } from "react-i18next";
import { QuestionFlow } from "../../../../../shared/assistant-ui/elements/question-flow";
import { questionFlowAnswers, questionFlowReceipt, questionFlowSteps, questionRoundForMessage, type QuestionRound, type QuestionSelections } from "../../../lib/conversation-question-flow";
import { useHomeDemo } from "./environment";

export function ConversationQuestions() {
  const { state } = useHomeDemo();
  const messageId = useAuiState(s => s.message.id);
  const round = questionRoundForMessage(state, messageId);
  return round ? <ProjectQuestionFlow key={round.questions.map(question => question.id).join(",")} round={round} /> : null;
}

function ProjectQuestionFlow({ round }: { round: QuestionRound }) {
  const { t } = useTranslation();
  const { disabled, onAnswer } = useHomeDemo();
  const [choice, setChoice] = useState<QuestionSelections>();
  const modelScope = round.purpose === "generation_scope";
  const obsoleteScope = modelScope && round.questions.some(question => !question.scopeChoices);
  const persisted = questionFlowReceipt(round);
  // Freeform historical replies remain in the user's message; never fabricate option identifiers for them.
  if (round.answers.length && !persisted) return null;
  const complete = async (selections: QuestionSelections) => {
    if (disabled) throw new Error(t("standardProject.generationBlocked"));
    const answers = questionFlowAnswers(round, selections);
    if (!answers) throw new Error(t("standardProject.inquiry.invalidSelection"));
    const accepted = await onAnswer({ operation: "chat", answers, message: answers.map(answer => answer.answer).join("\n") });
    if (!accepted) throw new Error(t("standardProject.inquiry.submitFailed"));
    setChoice(selections);
  };
  return <>
    <QuestionFlow steps={questionFlowSteps(round, answer => t("standardProject.recommendation", { answer }))}
      choice={persisted ?? choice} onComplete={!disabled && !obsoleteScope && !round.answers.length ? complete : undefined}
      completeLabel={t(`standardProject.inquiry.${modelScope ? "generate" : "submit"}`)}
      aria-label={t(`standardProject.inquiry.${modelScope ? "models" : "business"}`)} />
    {obsoleteScope && <p role="status">{t("standardProject.inquiry.refreshScope")}</p>}
  </>;
}
