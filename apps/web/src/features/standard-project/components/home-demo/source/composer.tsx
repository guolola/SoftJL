// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.
"use client";
import { homeText, useHomeLocale } from "../integration/home-locale";


import {
  ComposerPrimitive,
  MessagePrimitive,
  unstable_useMentionAdapter,
} from "@assistant-ui/react";
import { useMemo, type ReactNode } from "../integration/composer-hooks";
import { ModelingComposer } from "@/shared/ui/modeling-composer";
import { ModelingComposerAttachments } from "@/shared/ui/modeling-composer-attachments";
import { ComposerTriggerPopover } from "./elements/composer-trigger-popover.aui";
import { ContextDisplay } from "./elements/context-display.aui";
import { ModelSelector } from "../integration/reasoning-switch";
import { ComposerQuotePreview } from "./elements/quote.aui";
import { docsModelOptions } from "./apps/docs/components/pages/docs/assistant/docs-model-options";
import {
  DEFAULT_MODEL_ID,
  getContextWindow,
  isAvailableModelId,
  supportsReasoningEffort,
} from "../integration/model";
import {
  createPersistedPreference,
  usePersistedPreference,
} from "../integration/persisted-preference";
import { COMMAND_ICONS, HOME_COMMANDS } from "./commands";

const homeModelPreference = createPersistedPreference<string>({
  key: "aui-home-model",
  fallback: DEFAULT_MODEL_ID,
  read: (raw) => (isAvailableModelId(raw) ? raw : null),
});

// High effort stays off the anonymous landing page: it multiplies the cost
// of a request the rate limit counts as one.
const HOME_EFFORT_OPTIONS = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Med" },
] as const;

const homeEffortPreference = createPersistedPreference<string>({
  key: "aui-home-effort",
  fallback: "low",
  read: (raw) =>
    HOME_EFFORT_OPTIONS.some((option) => option.id === raw) ? raw : null,
});

export function Composer(): ReactNode {
  useHomeLocale();
  const commands = unstable_useMentionAdapter({
    items: HOME_COMMANDS,
    includeModelContextTools: false,
    iconMap: COMMAND_ICONS,
  });
  const model = usePersistedPreference(homeModelPreference);
  const effort = usePersistedPreference(homeEffortPreference);
  const models = useMemo(
    () =>
      docsModelOptions().map((option) =>
        supportsReasoningEffort(option.id)
          ? { ...option, efforts: HOME_EFFORT_OPTIONS }
          : option,
      ),
    [],
  );

  return (
    <ModelingComposer
      placeholder={homeText("Send a message...")}
      submitLabel={homeText("Send message")}
      cancelLabel={homeText("Stop generating")}
      addAttachmentLabel={homeText("Add attachment")}
      startDictationLabel={homeText("Start voice input")}
      stopDictationLabel={homeText("Stop voice input")}
      commands={
        <ComposerTriggerPopover
          char="/"
          adapter={commands.adapter}
          directive={commands.directive}
          iconMap={COMMAND_ICONS}
          emptyItemsLabel={homeText("No matching command")}
          className="w-72"
        />
      }
      beforeInput={<ComposerQuotePreview className="bg-foreground/[0.04] rounded-control mx-3 mt-3" />}
      attachments={<ModelingComposerAttachments translate={homeText} />}
      modelControls={
        <ModelSelector
          models={models}
          value={model}
          onValueChange={homeModelPreference.set}
          effort={effort}
          onEffortChange={homeEffortPreference.set}
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground rounded-control h-7 min-w-0 text-[13px] font-normal"
        />
      }
      contextDisplay={
        <ContextDisplay.Text
          modelContextWindow={getContextWindow(model)}
          side="top"
          className="text-muted-foreground hover:text-foreground rounded-control h-7 px-2 text-[11px] hover:bg-transparent"
        />
      }
    />
  );
}

export function EditComposer(): ReactNode {
  useHomeLocale();
  return (
    <MessagePrimitive.Root
      data-role="user"
      className="mx-auto flex w-full max-w-(--thread-max-width) flex-col items-end"
    >
      <ComposerPrimitive.Root className="border-foreground/10 bg-muted/30 focus-within:border-foreground/25 rounded-thread flex w-full max-w-[85%] flex-col border transition-colors">
        <ComposerPrimitive.Input asChild>
          <textarea
            autoFocus
            aria-label={homeText("Edit message")}
            rows={1}
            className="field-sizing-content max-h-48 min-h-12 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-6 focus:outline-none"
          />
        </ComposerPrimitive.Input>
        <div className="flex items-center justify-end gap-1.5 px-2.5 pb-2.5">
          <ComposerPrimitive.Cancel asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground rounded-control h-8 px-3 text-[13px] transition-colors"
            >{homeText("Cancel")}</button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <button
              type="button"
              className="bg-primary text-primary-foreground rounded-control h-8 px-3 text-[13px] font-medium transition-opacity disabled:opacity-40"
            >{homeText("Update")}</button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}
