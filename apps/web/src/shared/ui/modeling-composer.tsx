// Shared assistant-ui input surface; each modeling workflow supplies its own runtime and business controls.
"use client";

import { type ReactNode } from "react";
import { AuiIf, ComposerPrimitive } from "@assistant-ui/react";
import { MicIcon, PlusIcon, SquareIcon } from "lucide-react";
import { cn } from "./utils";
import { ModelingGenerationButton } from "./modeling-generation-button";

export type ModelingComposerProps = {
  modelControls?: ReactNode;
  contextDisplay?: ReactNode;
  beforeInput?: ReactNode;
  commands?: ReactNode;
  attachments?: ReactNode;
  children?: ReactNode;
  placeholder: string;
  inputId?: string;
  inputLabel?: string;
  inputDescriptionId?: string;
  inputClassName?: string;
  toolbarTestId?: string;
  submitLabel: string;
  cancelLabel: string;
  submitDisabled?: boolean;
  cancelDisabled?: boolean;
  inputDisabled?: boolean;
  onTextChange?: (text: string) => void;
  addAttachmentLabel?: string;
  startDictationLabel?: string;
  stopDictationLabel?: string;
  className?: string;
};

export function ModelingComposer({
  modelControls,
  contextDisplay,
  beforeInput,
  commands,
  attachments,
  children,
  placeholder,
  inputId,
  inputLabel,
  inputDescriptionId,
  inputClassName,
  toolbarTestId,
  submitLabel,
  cancelLabel,
  submitDisabled,
  cancelDisabled,
  inputDisabled,
  onTextChange,
  addAttachmentLabel = "Add attachment",
  startDictationLabel = "Start voice input",
  stopDictationLabel = "Stop voice input",
  className,
}: ModelingComposerProps): ReactNode {
  return (
    <ComposerPrimitive.TriggerPopoverRoot>
      <ComposerPrimitive.Root
        data-slot="modeling-composer"
        className={cn("relative w-full", className)}
        onSubmit={(event) => { if (submitDisabled) event.preventDefault(); }}
      >
        {commands}
        <ComposerPrimitive.AttachmentDropzone asChild>
          <div className="border-foreground/10 bg-muted/30 focus-within:border-foreground/25 data-[dragging=true]:border-foreground/40 rounded-2xl rounded-thread flex flex-col border transition-colors data-[dragging=true]:border-dashed">
            {beforeInput}
            <div className="has-[.aui-attachment-root]:px-3 has-[.aui-attachment-root]:pt-3">
              {attachments}
            </div>
            <ComposerPrimitive.Input
              asChild
              disabled={inputDisabled}
              submitMode={(submitDisabled ? "none" : "enter") as "none" | "enter"}
              onChange={(event) => onTextChange?.(event.currentTarget.value)}
            >
              <textarea
                id={inputId}
                data-composer-input
                aria-label={inputLabel}
                aria-describedby={inputDescriptionId}
                placeholder={placeholder}
                rows={1}
                className={cn("placeholder:text-muted-foreground field-sizing-content max-h-48 w-full resize-none bg-transparent px-4 pt-3 pb-2 text-base leading-6 focus:outline-none", inputClassName)}
              />
            </ComposerPrimitive.Input>
            <div data-testid={toolbarTestId} className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-2 pb-2 sm:flex-nowrap">
              <div className="flex max-w-full min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <ComposerPrimitive.AddAttachment asChild disabled={inputDisabled}>
                  <button type="button" aria-label={addAttachmentLabel} className="text-muted-foreground hover:text-foreground rounded-[0.5rem] rounded-control grid size-7 shrink-0 place-items-center transition-colors disabled:opacity-40">
                    <PlusIcon className="size-4" />
                  </button>
                </ComposerPrimitive.AddAttachment>
                {modelControls}
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {contextDisplay}
                <AuiIf condition={(s) => s.thread.capabilities.dictation && s.composer.dictation == null}>
                  <ComposerPrimitive.Dictate asChild disabled={inputDisabled}>
                    <button type="button" aria-label={startDictationLabel} className="text-muted-foreground hover:text-foreground rounded-[0.5rem] rounded-control grid size-7 place-items-center transition-colors disabled:opacity-40">
                      <MicIcon className="size-4" />
                    </button>
                  </ComposerPrimitive.Dictate>
                </AuiIf>
                <AuiIf condition={(s) => s.composer.dictation != null}>
                  <ComposerPrimitive.StopDictation asChild>
                    <button type="button" aria-label={stopDictationLabel} className="text-destructive rounded-[0.5rem] rounded-control grid size-7 place-items-center transition-colors">
                      <SquareIcon className="size-3 animate-pulse fill-current" />
                    </button>
                  </ComposerPrimitive.StopDictation>
                </AuiIf>
                <AuiIf condition={(s) => !s.thread.isRunning}>
                  <ComposerPrimitive.Send asChild disabled={submitDisabled}>
                    <ModelingGenerationButton label={submitLabel} iconOnly />
                  </ComposerPrimitive.Send>
                </AuiIf>
                <AuiIf condition={(s) => s.thread.isRunning}>
                  <ComposerPrimitive.Cancel asChild disabled={cancelDisabled}>
                    <button type="button" aria-label={cancelLabel} className="bg-primary text-primary-foreground rounded-[0.5rem] rounded-control grid size-7 place-items-center disabled:opacity-40">
                      <SquareIcon className="size-3 fill-current" />
                    </button>
                  </ComposerPrimitive.Cancel>
                </AuiIf>
              </div>
            </div>
            {children}
          </div>
        </ComposerPrimitive.AttachmentDropzone>
      </ComposerPrimitive.Root>
    </ComposerPrimitive.TriggerPopoverRoot>
  );
}
