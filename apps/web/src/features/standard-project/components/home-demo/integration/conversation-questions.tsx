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
  const answers = questions.map(question => ({ questionId: question.id, answer: custom[question.id]?.trim() || selected[question.id]?.join("、") || "" }));
  const complete = answers.every(answer => answer.answer);
  const submit = async () => {
    if (locked || !complete) return;
    setSubmitting(true);
    try { await onAnswer({ operation: "chat", answers,
      // Questions belong to the assistant; the user turn contains only the submitted answers.
      message: answers.map(answer => answer.answer).join("\n") }); }
    finally { setSubmitting(false); }
  };
  const recommend = () => {
    // Scope recommendations may name models without repeating each option's explanatory suffix.
    const defaults = Object.fromEntries(questions.map(question => [question.id, question.options.filter(option => {
      if (question.recommendation.includes(option)) return true;
      const name = option.replace(/^\s*\d+[.、)）]\s*/u, "").split(/\s+[—–-]\s+|[（(]/u)[0]!;
      return modelScope && question.recommendation.split(/[；;。]/u)[0]!.includes(name);
    })]));
    setSelected(defaults);
    setCustom(Object.fromEntries(questions.filter(question => !defaults[question.id]?.length).map(question => [question.id, question.recommendation])));
  };
  return <section className="conversation-questions" aria-label={t(`standardProject.inquiry.${modelScope ? "models" : "business"}`)}>
    {questions.map(question => <fieldset key={question.id} disabled={locked}>
      <legend>{question.title}</legend>
      <p>{t("standardProject.recommendation", { answer: question.recommendation })}</p>
      {question.multiple ? <div className="conversation-questions-options">{question.options.map(option => <label key={option}>
        <Checkbox checked={selected[question.id]?.includes(option) ?? false} onCheckedChange={checked => setSelected(current => ({ ...current, [question.id]: checked ? [...(current[question.id] ?? []), option] : (current[question.id] ?? []).filter(item => item !== option) }))} />
        <span>{option}</span>
      </label>)}</div> : <RadioGroup value={selected[question.id]?.[0] ?? ""} onValueChange={value => setSelected(current => ({ ...current, [question.id]: [String(value)] }))} aria-label={question.title}>
        {question.options.map(option => <label key={option}><RadioGroupItem value={option} /><span>{option}</span></label>)}
      </RadioGroup>}
      <label className="conversation-questions-custom"><span>{t("standardProject.inquiry.custom")}</span>
        <Input aria-label={`${question.title}：${t("standardProject.inquiry.custom")}`} maxLength={4000} value={custom[question.id] ?? ""} onChange={event => setCustom(current => ({ ...current, [question.id]: event.target.value }))} />
      </label>
    </fieldset>)}
    <div className="conversation-questions-actions">
      <Button type="button" variant="outline" disabled={locked} onClick={recommend}>{t("standardProject.inquiry.useAnswers")}</Button>
      {modelScope && <Button type="button" variant="outline" disabled={locked} onClick={() => { setSelected(Object.fromEntries(questions.map(question => [question.id, question.options]))); setCustom({}); }}>{t("standardProject.inquiry.all")}</Button>}
      <Button type="button" disabled={locked || !complete} onClick={() => void submit()}>{t(`standardProject.inquiry.${modelScope ? "generate" : "submit"}`)}</Button>
    </div>
    {!complete && <p role="status">{t("standardProject.inquiry.complete")}</p>}
  </section>;
}
