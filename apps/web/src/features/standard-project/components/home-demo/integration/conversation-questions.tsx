// Renders durable model choices and clarification questions inside the owning assistant message.
import { useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../../shared/ui/button";
import { Checkbox } from "../../../../../shared/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "../../../../../shared/ui/radio-group";
import { Input } from "../../../../../shared/ui/input";
import { useHomeDemo } from "./environment";

export function ConversationQuestions() {
  const { state } = useHomeDemo();
  const messageId = useAuiState(s => s.message.id);
  const latest = state.rounds.at(-1);
  if (!latest?.questions.length || latest.answers.length) return null;
  // Only the replacement question tied to this unsupported request can collect new consent.
  if (state.unsupportedDiagramRequest && !latest.questions.some(question => question.id === state.unsupportedDiagramRequest!.questionId)) return null;
  const owner = state.conversation?.filter(message => message.role === "assistant").at(-1)?.id ?? `clarification:${state.rounds.length}`;
  return owner === messageId ? <BusinessQuestions key={`${state.rounds.length}:${latest.questions.map(question => question.id).join(",")}`} /> : null;
}

function BusinessQuestions() {
  const { t } = useTranslation();
  const { state, disabled, onAnswer } = useHomeDemo();
  const questions = state.rounds.at(-1)!.questions;
  const modelScope = state.rounds.at(-1)!.purpose === "generation_scope";
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const locked = disabled || submitting;
  const obsoleteScope = modelScope && !questions.some(question => question.scopeChoices);
  const answers = questions.map(question => question.scopeChoices
    ? { questionId: question.id, answer: question.scopeChoices.filter(choice => selected[question.id]?.includes(choice.id)).map(choice => choice.label).join("、"), selectedOptionIds: selected[question.id] ?? [] }
    : { questionId: question.id, answer: custom[question.id]?.trim() || selected[question.id]?.join("、") || "" });
  const complete = !obsoleteScope && answers.every(answer => answer.answer);
  const toggle = (questionId: string, optionId: string, checked: boolean) => setSelected(current => {
    const question = questions.find(question => question.id === questionId)!;
    const options = current[questionId] ?? [];
    // A decline is exclusive, including when the model question otherwise permits multiple choices.
    const scopeChoice = question.scopeChoices?.find(choice => choice.id === optionId);
    const next = !checked ? options.filter(id => id !== optionId)
      : scopeChoice?.kinds.length === 0 ? [optionId]
      : [...options.filter(id => !question.scopeChoices || question.scopeChoices.some(choice => choice.id === id && choice.kinds.length)), optionId];
    return { ...current, [questionId]: next };
  });
  const submit = async () => {
    if (locked || !complete) return;
    setSubmitting(true);
    try { await onAnswer({ operation: "chat", answers,
      // Questions belong to the assistant; the user turn contains only the submitted answers.
      message: answers.map(answer => answer.answer).join("\n") }); }
    finally { setSubmitting(false); }
  };
  const recommend = () => {
    const defaults = Object.fromEntries(questions.map(question => [question.id, question.scopeChoices
      ? question.scopeChoices.filter(choice => choice.recommended).map(choice => choice.id)
      : question.options.filter(option => question.recommendation.includes(option))]));
    setSelected(defaults);
    setCustom(Object.fromEntries(questions.filter(question => !question.scopeChoices && !defaults[question.id]?.length).map(question => [question.id, question.recommendation])));
  };
  return <section className="conversation-questions" aria-label={t(`standardProject.inquiry.${modelScope ? "models" : "business"}`)}>
    {questions.map(question => {
      const options = question.scopeChoices?.map(choice => ({ value: choice.id, label: choice.label })) ?? question.options.map(option => ({ value: option, label: option }));
      return <fieldset key={question.id} disabled={locked || obsoleteScope}>
      <legend>{question.title}</legend>
      <p>{t("standardProject.recommendation", { answer: question.recommendation })}</p>
      {question.multiple ? <div className="conversation-questions-options">{options.map(option => <label key={option.value}>
        <Checkbox checked={selected[question.id]?.includes(option.value) ?? false} onCheckedChange={checked => toggle(question.id, option.value, checked === true)} />
        <span>{option.label}</span>
      </label>)}</div> : <RadioGroup value={selected[question.id]?.[0] ?? ""} onValueChange={value => setSelected(current => ({ ...current, [question.id]: [String(value)] }))} aria-label={question.title}>
        {options.map(option => <label key={option.value}><RadioGroupItem value={option.value} /><span>{option.label}</span></label>)}
      </RadioGroup>}
      {!question.scopeChoices && <label className="conversation-questions-custom"><span>{t("standardProject.inquiry.custom")}</span>
        <Input aria-label={`${question.title}：${t("standardProject.inquiry.custom")}`} maxLength={4000} value={custom[question.id] ?? ""} onChange={event => setCustom(current => ({ ...current, [question.id]: event.target.value }))} />
      </label>}
    </fieldset>; })}
    <div className="conversation-questions-actions">
      <Button type="button" variant="outline" disabled={locked || obsoleteScope} onClick={recommend}>{t("standardProject.inquiry.useAnswers")}</Button>
      {modelScope && questions.some(question => question.multiple && question.scopeChoices) && <Button type="button" variant="outline" disabled={locked || obsoleteScope} onClick={() => {
        setSelected(current => ({ ...current, ...Object.fromEntries(questions.filter(question => question.multiple && question.scopeChoices).map(question => [question.id, question.scopeChoices!.filter(choice => choice.kinds.length).map(choice => choice.id)])) }));
      }}>{t("standardProject.inquiry.all")}</Button>}
      <Button type="button" disabled={locked || !complete} onClick={() => void submit()}>{t(`standardProject.inquiry.${modelScope ? "generate" : "submit"}`)}</Button>
    </div>
    {!complete && <p role="status">{t(`standardProject.inquiry.${obsoleteScope ? "refreshScope" : "complete"}`)}</p>}
  </section>;
}
