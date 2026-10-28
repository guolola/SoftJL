// Adapts durable project messages to the homepage source without creating a second conversation store.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExportedMessageRepository, MessageNotSentError, useExternalStoreRuntime, WebSpeechDictationAdapter, WebSpeechSynthesisAdapter, type ThreadMessage, type ThreadMessageLike, type AppendMessage } from "@assistant-ui/react";
import { standardQuoteSchema, type StandardProjectState, type StandardConversationMessage, type ModelContextSettings } from "@uml-platform/contracts";
import type { StandardCommand } from "../services/standard-api";
import { createConversationAttachments, toAssistantAttachment, toProjectAttachment } from "../../../shared/lib/modeling-attachments";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { clearConversationDraft } from "./use-conversation-draft";
import { conversationDate } from "../lib/conversation-presentation";
import { modelingSubmissionError } from "../../../shared/lib/modeling-attachments";

export type SendConversationCommand = (command: StandardCommand) => Promise<boolean | undefined> | undefined;
const convert = (message: StandardConversationMessage): ThreadMessageLike => ({ id: message.id, role: message.role,
    // Missing dates stay deterministic in the runtime and are omitted from the date UI.
    createdAt: conversationDate(message.createdAt) ?? new Date(0),
    content: [...(message.reasoning ? [{ type: "reasoning" as const, text: message.reasoning }] : []),
      ...(message.tools ?? []).map(tool => ({ type: "tool-call" as const, toolCallId: tool.id, toolName: tool.name, args: {},
        ...(tool.status !== "running" ? { result: tool.status, isError: tool.status === "failed" } : {}) })), { type: "text", text: message.text }],
    attachments: message.attachments?.map(toAssistantAttachment), metadata: { custom: { quote: message.quote },
      ...(message.timing ? { timing: message.timing } : {}),
      ...(message.feedback ? { submittedFeedback: { type: message.feedback } } : {}) },
    // Pi finishes emitting the assistant message before executing its tools. Keep the
    // runtime message active until those durable tool calls settle, so pending parts
    // do not inherit a completed message status in either cards or timelines.
    ...(message.role === "assistant" ? { status: message.status !== "failed" && (message.status === "streaming" || message.tools?.some(tool => tool.status === "running")) ? { type: "running" as const }
      : message.status === "failed" ? { type: "incomplete" as const,
        // Interrupted tool-only replies have a separate durable explanation; avoid an empty generic error tile.
        reason: !message.text && message.tools?.some(tool => tool.status === "failed") ? "cancelled" as const : "error" as const }
        : { type: "complete" as const, reason: "stop" as const } } : {}) });

export function useConversationRuntime({ state, projectId, disabled, canCancel, onSend, onCancel, onFeedback, modelContext, reasoning }: {
  state: StandardProjectState; projectId: string; disabled: boolean; canCancel: boolean; onSend: SendConversationCommand; onCancel: () => Promise<unknown>;
  onFeedback: (id: string, type: "positive" | "negative") => Promise<unknown>; modelContext?: ModelContextSettings; reasoning: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [speech, setSpeech] = useState<object>({});
  const [rejectedEdit, setRejectedEdit] = useState<AppendMessage | null>(null);
  useEffect(() => { setSpeech({
    ...(typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined" ? { speech: new WebSpeechSynthesisAdapter() } : {}),
    ...(WebSpeechDictationAdapter.isSupported() ? { dictation: new WebSpeechDictationAdapter({ language: i18n.language }) } : {}),
  }); }, [i18n.language]);
  const attachments = useMemo(() => createConversationAttachments(modelContext?.capacity.capabilities?.vision === true), [modelContext?.capacity.capabilities?.vision]);
  const messages = useMemo(() => state.conversation ?? [], [state.conversation]);
  // The project hook reconciles its pending user turn with the durable snapshot. Import
  // that full linear history so replaced suffixes cannot survive as browser-only branches.
  const messageRepository = useMemo(() => ExportedMessageRepository.fromArray(messages.map(convert)), [messages]);
  const send = async (message: AppendMessage, operation: "chat" | "edit") => {
      const text = message.content.filter(part => part.type === "text").map(part => part.text).join("\n");
      if (disabled || (!text.trim() && !message.attachments?.length)) throw new MessageNotSentError();
      const files = message.attachments?.map(toProjectAttachment); const quote = standardQuoteSchema.safeParse(message.metadata.custom.quote);
      const error = modelingSubmissionError(text, files ?? [], quote.success ? quote.data.text : "");
      if (error) {
        floatingAlert.error(error); throw new MessageNotSentError();
      }
      if (files?.some(file => file.type === "image") && modelContext?.capacity.capabilities?.vision !== true) {
        floatingAlert.error(t("standardProject.chat.visionRequired")); throw new MessageNotSentError();
      }
      if (operation === "edit" && !state.conversation?.some(item => item.id === message.sourceId && item.role === "user")) throw new MessageNotSentError();
      if (!await onSend({ operation, ...(text.trim() ? { message: text } : {}), ...(files?.length ? { attachments: files } : {}),
        ...(quote.success ? { quote: quote.data } : {}), ...(modelContext?.capacity.capabilities?.reasoning ? { reasoning } : {}),
        language: i18n.language.startsWith("zh") ? "zh-CN" : "en",
        ...(operation === "edit" ? { messageId: message.sourceId!, expectedHeadId: state.conversation!.at(-1)!.id } : {}) })) throw new MessageNotSentError();
      if (operation === "chat") clearConversationDraft(projectId, text);
  };
  const runtime = useExternalStoreRuntime<ThreadMessage>({ messageRepository, isRunning: state.run?.status === "running", isDisabled: disabled,
    onNew: message => send(message, "chat"),
    onEdit: !disabled && state.conversation?.some(item => item.role === "user") ? async message => {
      try { await send(message, "edit"); }
      catch (error) { setRejectedEdit(message); throw error; }
    } : undefined,
    onReload: !disabled && state.conversation?.some(item => item.role === "user") ? async (_, config) => {
      const index = state.conversation!.findIndex(item => item.id === config.sourceId && item.role === "assistant");
      if (disabled || index < 0 || !state.conversation!.slice(0, index).some(item => item.role === "user")) throw new MessageNotSentError();
      if (!await onSend({ operation: "regenerate", messageId: config.sourceId!, expectedHeadId: state.conversation!.at(-1)!.id,
        language: i18n.language.startsWith("zh") ? "zh-CN" : "en", ...(modelContext?.capacity.capabilities?.reasoning ? { reasoning } : {}) })) throw new MessageNotSentError();
    } : undefined,
    onCancel: canCancel ? async () => { if (state.run?.status === "running") await onCancel(); } : undefined,
    adapters: { ...speech, attachments, ...(!disabled ? { feedback: { submit: ({ message, type }) => { void onFeedback(message.id, type); } } } : {}) },
    suggestions: !disabled && state.conversation?.at(-1)?.role === "assistant" && state.conversation.at(-1)?.status === "completed"
      && !(state.rounds.at(-1)?.questions.length && !state.rounds.at(-1)?.answers.length)
      ? (state.conversation.at(-1)?.suggestions ?? []).map(prompt => ({ prompt })) : [],
  });
  useEffect(() => {
    if (!rejectedEdit || disabled) return;
    setRejectedEdit(null);
    if (!rejectedEdit.sourceId || !state.conversation?.some(item => item.id === rejectedEdit.sourceId && item.role === "user")) return;
    // The upstream edit composer exits as soon as it dispatches. Restore its own editor only
    // after a rejected request unlocks the runtime, preserving the separate new-message draft.
    const editor = runtime.thread.getMessageById(rejectedEdit.sourceId).composer;
    editor.beginEdit();
    editor.setText(rejectedEdit.content.filter(part => part.type === "text").map(part => part.text).join("\n"));
  }, [rejectedEdit, disabled, runtime, state.conversation]);
  return runtime;
}
