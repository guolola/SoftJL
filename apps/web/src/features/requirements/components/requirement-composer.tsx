// Adapts the shared quick-modeling composer to engineering source drafts and rules-only tasks.
import { useEffect, useMemo, useRef, useState } from "react";
import { AssistantRuntimeProvider, MessageNotSentError, useExternalStoreRuntime, WebSpeechDictationAdapter, type AppendMessage, type ThreadMessageLike } from "@assistant-ui/react";
import type { StandardAttachment } from "@uml-platform/contracts";
import { useTranslation } from "react-i18next";
import { useWorkspaceProjectId } from "../../../services/workspace-repository";
import { ModelingComposer } from "../../../shared/ui/modeling-composer";
import { ModelingComposerAttachments } from "../../../shared/ui/modeling-composer-attachments";
import { ModelingModelSelector } from "../../../shared/ui/modeling-model-selector";
import { ProviderIcon } from "../../../shared/ui/provider-icon";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { useModelingReasoning } from "../../../shared/lib/modeling-reasoning";
import { getProviderModelLabel, inferProviderModelGroup } from "../../../shared/lib/provider-model-display";
import { createConversationAttachments, toProjectAttachment } from "../../../shared/lib/modeling-attachments";
import { useRequirementModelContext } from "../hooks/use-requirement-model-context";
import { useRequirementTextHistory } from "../hooks/use-requirement-text-history";
import { clearRequirementComposerDraft, readRequirementComposerDraft, saveRequirementComposerDraft } from "../lib/requirement-composer-draft";

export type RequirementComposerOptions = { attachments?: StandardAttachment[]; reasoning?: boolean };
type Props = {
  text: string;
  initialized: boolean;
  hasUncommittedDraft: boolean;
  disabled: boolean;
  submitDisabled: boolean;
  running: boolean;
  canCancel: boolean;
  compact: boolean;
  submitLabel: string;
  descriptionId: string;
  onTextChange: (text: string) => void;
  onSubmit: (options: RequirementComposerOptions) => Promise<boolean>;
  onCancel: () => Promise<void>;
};
const EMPTY_MESSAGES: ThreadMessageLike[] = [];

export function RequirementComposer(props: Props) {
  const { t, i18n } = useTranslation();
  const projectId = useWorkspaceProjectId();
  const { settings, modelContext } = useRequirementModelContext(projectId);
  const [reasoning, setReasoning] = useModelingReasoning();
  const [speech, setSpeech] = useState<object>({});
  const [draftReady, setDraftReady] = useState(false);
  const [submissionPending, setSubmissionPending] = useState(false);
  const [preparingAttachments, setPreparingAttachments] = useState(false);
  const baseText = useRef(props.text);
  const restoredProject = useRef<string | null>(null);
  const restoringText = useRef<string | null>(null);
  const sending = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const supportsVision = modelContext?.capacity.capabilities?.vision === true;
  const supportsReasoning = modelContext?.capacity.capabilities?.reasoning === true;
  const attachments = useMemo(() => createConversationAttachments(supportsVision), [supportsVision]);
  const models = useMemo(() => settings.providerModelOptions.map((id) => ({
    id,
    name: id === modelContext?.model ? modelContext.capacity.name ?? getProviderModelLabel(id) : getProviderModelLabel(id),
    icon: <ProviderIcon providerId={inferProviderModelGroup(id, settings.providerLabel).id} className="size-3.5" />,
  })), [modelContext, settings.providerLabel, settings.providerModelOptions]);
  const translateModelControl = (value: string) => {
    const labels: Record<string, string> = { "Select model": "standardProject.chat.selectModel", "Search models...": "standardProject.chat.searchModels", "No models found.": "standardProject.chat.noModels", Reasoning: "requirements.composer.reasoning", Model: "standardProject.chat.selectModel" };
    return labels[value] ? t(labels[value]) : value;
  };

  useEffect(() => {
    if (WebSpeechDictationAdapter.isSupported()) setSpeech({ dictation: new WebSpeechDictationAdapter({ language: i18n.language }) });
    else setSpeech({});
  }, [i18n.language]);

  const send = async (message: AppendMessage) => {
    if (latest.current.disabled || latest.current.submitDisabled || latest.current.running || sending.current) throw new MessageNotSentError();
    const text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    const files = message.attachments?.map(toProjectAttachment) ?? [];
    if ((!text.trim() && files.length === 0) || files.length > 4 || text.length + files.reduce((sum, file) => sum + (file.type === "document" ? file.text.length : 0), 0) > 60000) {
      floatingAlert.error(t("standardProject.chat.attachmentSize"));
      throw new MessageNotSentError();
    }
    if (files.some((file) => file.type === "image") && !supportsVision) {
      floatingAlert.error(t("standardProject.chat.visionRequired"));
      throw new MessageNotSentError();
    }
    sending.current = true;
    setSubmissionPending(true);
    // This is a persistent source editor: sending never clears its requirement text.
    runtime.thread.composer.setText(text);
    latest.current.onTextChange(text);
    try {
      const accepted = await latest.current.onSubmit({ ...(files.length ? { attachments: files } : {}), ...(supportsReasoning ? { reasoning } : {}) });
      if (!accepted) throw new MessageNotSentError();
      if (projectId) clearRequirementComposerDraft(projectId);
      runtime.thread.composer.setText(latest.current.text);
    } catch {
      // assistant-ui restores rejected submissions itself; an existing copy would be concatenated twice.
      runtime.thread.composer.setText("");
      throw new MessageNotSentError();
    } finally {
      sending.current = false;
      setSubmissionPending(false);
    }
  };
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: EMPTY_MESSAGES,
    convertMessage: (message) => message,
    isDisabled: props.disabled || props.running || submissionPending || preparingAttachments,
    isSendDisabled: props.submitDisabled || submissionPending,
    isRunning: props.running,
    onNew: send,
    onCancel: props.canCancel ? props.onCancel : undefined,
    adapters: { ...speech, attachments },
  });
  const textHistory = useRequirementTextHistory(props.text, (text) => {
    runtime.thread.composer.setText(text);
    latest.current.onTextChange(text);
    if (projectId) saveRequirementComposerDraft(projectId, text, baseText.current);
  }, props.disabled || props.running || submissionPending || preparingAttachments);
  const { reset: resetTextHistory, record: recordTextHistory } = textHistory;

  useEffect(() => {
    if (!props.initialized) return;
    const identity = `${projectId ?? "local-workspace"}:${props.disabled ? "read" : "write"}`;
    if (restoredProject.current === identity) return;
    restoredProject.current = identity;
    baseText.current = latest.current.text;
    const saved = projectId && !props.disabled ? readRequirementComposerDraft(projectId, baseText.current) : null;
    if (saved !== null && saved !== latest.current.text) {
      resetTextHistory(saved);
      restoringText.current = saved;
      runtime.thread.composer.setText(saved);
      latest.current.onTextChange(saved);
    } else {
      resetTextHistory(latest.current.text);
      runtime.thread.composer.setText(latest.current.text);
    }
    setDraftReady(true);
    // Repository providers key the workspace by project; background snapshots must not reseed drafts.
  }, [props.disabled, props.initialized, projectId, runtime, resetTextHistory]);

  useEffect(() => {
    if (!draftReady || sending.current) return;
    if (props.disabled) {
      runtime.thread.composer.setText(props.text);
      return;
    }
    // Strict-mode remounts may run effects before the restored value reaches the session props.
    if (restoringText.current !== null) {
      if (props.text !== restoringText.current) return;
      restoringText.current = null;
    }
    if (!props.hasUncommittedDraft) baseText.current = props.text;
    if (runtime.thread.composer.getState().text !== props.text) runtime.thread.composer.setText(props.text);
    if (projectId) saveRequirementComposerDraft(projectId, props.text, baseText.current);
  }, [draftReady, projectId, props.disabled, props.hasUncommittedDraft, props.text, runtime]);

  useEffect(() => {
    let observedText = runtime.thread.composer.getState().text;
    return runtime.thread.composer.subscribe(() => {
      const state = runtime.thread.composer.getState();
      setPreparingAttachments(Boolean(state.submission));
      const textChanged = state.text !== observedText;
      observedText = state.text;
      // Metadata/permission notifications must not replace a newer external source with stale runtime text.
      // Actual runtime text changes also cover dictation and paste without a native textarea event.
      if (textChanged && !state.submission && !sending.current && state.text !== latest.current.text) {
        recordTextHistory(state.text);
        latest.current.onTextChange(state.text);
      }
    });
  }, [runtime, recordTextHistory]);

  const translateAttachment = (value: string) => {
    const remove = /^Remove (.+)$/s.exec(value);
    if (remove) return t("standardProject.chat.removeFile", { name: remove[1] });
    const preview = /^Preview(?: of)? (.+)$/s.exec(value);
    if (preview) return t("standardProject.chat.previewFile", { name: preview[1] });
    const attachment = /^(Image|Document|File|图片|文档|文件) attachment (.+)$/s.exec(value);
    if (attachment) return `${attachment[1]} ${attachment[2]}`;
    const labels: Record<string, string> = { Image: "image", Document: "document", File: "file", "Upload failed": "uploadFailed", ", upload failed": "uploadFailed", ", uploading": "uploading" };
    return labels[value] ? t(`standardProject.chat.${labels[value]}`) : value;
  };
  return <AssistantRuntimeProvider runtime={runtime}>
    <ModelingComposer
      className="mt-3"
      toolbarTestId="requirements-input-toolbar"
      placeholder={`${t("requirements.source.guidance")}\n\n${t("requirements.source.placeholder")}`}
      inputId="requirement-text"
      inputLabel={t("requirements.source.description")}
      inputDescriptionId={props.descriptionId}
      inputProps={textHistory.inputProps}
      inputClassName={`min-h-0 max-h-none field-sizing-fixed overflow-y-auto ${props.compact ? "h-[240px]" : "h-80"}`}
      inputDisabled={props.disabled || props.running || submissionPending || preparingAttachments}
      submitDisabled={props.submitDisabled || submissionPending}
      cancelDisabled={!props.canCancel}
      submitLabel={props.submitLabel}
      cancelLabel={t("requirements.composer.stop")}
      addAttachmentLabel={t("standardProject.chat.addAttachment")}
      startDictationLabel={t("standardProject.chat.dictate")}
      stopDictationLabel={t("standardProject.chat.stopDictation")}
      onTextChange={(text) => {
        if (latest.current.disabled || latest.current.running) return;
        recordTextHistory(text);
        latest.current.onTextChange(text);
        if (projectId) saveRequirementComposerDraft(projectId, text, baseText.current);
      }}
      attachments={<ModelingComposerAttachments translate={translateAttachment} />}
      modelControls={<ModelingModelSelector models={models} value={settings.defaultModel}
        onValueChange={(model) => patchUserSettings({ defaultModel: model })}
        disabled={props.disabled || props.running || submissionPending || preparingAttachments}
        reasoning={reasoning} reasoningSupported={supportsReasoning} translate={translateModelControl}
        onReasoningChange={setReasoning} />}
    />
  </AssistantRuntimeProvider>;
}
