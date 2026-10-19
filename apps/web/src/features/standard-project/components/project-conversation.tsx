// Mounts the unchanged upstream content area; settings, drafts and commands stay behind data adapters.
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { StandardProjectState } from "@uml-platform/contracts";
import { Thread } from "./home-demo/source/thread";
import { CommandInstructions } from "./home-demo/source/commands";
import { HomeDemoEnvironment } from "./home-demo/integration/environment";
import { HomeDemoPortals } from "./home-demo/integration/portals";
import { configureHomeModels } from "./home-demo/integration/model";
import { homeEffortPreference, usePersistedPreference } from "./home-demo/integration/persisted-preference";
import { useConversationRuntime, type SendConversationCommand } from "../hooks/use-conversation-runtime";
import { useConversationSettings } from "../hooks/use-conversation-settings";
import { useConversationDraft, saveConversationDraft } from "../hooks/use-conversation-draft";

function DraftBinding({ projectId }: { projectId: string }) { useConversationDraft(projectId); return null; }
export function ProjectConversation({ projectId, state, disabled, canCancel, displayName, onSend, onCancel, onFeedback }: {
  projectId: string; state: StandardProjectState; disabled: boolean; canCancel: boolean; displayName?: string;
  onSend: SendConversationCommand; onCancel: () => Promise<unknown>; onFeedback: (id: string, type: "positive" | "negative") => Promise<unknown>;
}) {
  const { i18n } = useTranslation();
  const { settings, modelContext } = useConversationSettings(projectId);
  const reasoning = usePersistedPreference(homeEffortPreference) === "medium";
  const configured = !!settings.providerConfigId && settings.providerModelOptions.includes(settings.defaultModel);
  const runtime = useConversationRuntime({ state, projectId, disabled: disabled || !configured, canCancel, onSend, onCancel, onFeedback, modelContext, reasoning });
  const modelRevision = configureHomeModels(settings, modelContext, disabled || !configured, state.tokenUsage);
  return <AssistantRuntimeProvider runtime={runtime}>
    <HomeDemoEnvironment value={{ projectId, displayName, model: settings.defaultModel, modelRevision, modelContext, state, disabled: disabled || !configured,
      onAnswer: command => onSend({ ...command, language: i18n.language.startsWith("zh") ? "zh-CN" : "en", ...(modelContext?.capacity.capabilities?.reasoning ? { reasoning } : {}) }) }}>
      <HomeDemoPortals>
        {/* The embedded theme maps body styles onto this root; let the host canvas show through. */}
        <div className="homepage-theme homepage-conversation min-h-0 min-w-0" style={{ "--thread-max-width": "42rem", backgroundColor: "transparent", overflow: "hidden" } as CSSProperties}
          onChangeCapture={event => { if (event.target instanceof HTMLTextAreaElement && event.target.hasAttribute("data-composer-input")) saveConversationDraft(projectId, event.target.value); }}>
          <DraftBinding projectId={projectId} /><CommandInstructions /><Thread />
        </div>
      </HomeDemoPortals>
    </HomeDemoEnvironment>
  </AssistantRuntimeProvider>;
}
