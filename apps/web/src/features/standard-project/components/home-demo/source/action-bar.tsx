// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.
"use client";
import { homeText, useHomeLocale } from "../integration/home-locale";


import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
} from "../integration/assistant-primitives";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  SquareIcon,
  Volume2Icon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { MessageTiming } from "./elements/message-timing.aui";
import { FeedbackActions } from "./apps/docs/components/pages/docs/assistant/assistant-action-bar";
import { actionButtonClass, menuContentClass, menuItemClass } from "./styles";
import { cn } from "./lib/utils";

export function AssistantActionBar(): ReactNode {
  useHomeLocale();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide={feedbackOpen ? "never" : "not-last"}
      className="flex items-center gap-1.5"
    >
      <ActionBarPrimitive.Copy
        aria-label={homeText("Copy response")}
        className={actionButtonClass}
      >
        <AuiIf condition={(s) => s.message.isCopied}>
          <CheckIcon className="size-4" />
        </AuiIf>
        <AuiIf condition={(s) => !s.message.isCopied}>
          <CopyIcon className="size-4" />
        </AuiIf>
      </ActionBarPrimitive.Copy>
      <FeedbackActions surface="home_thread" onOpenChange={setFeedbackOpen} />
      <AuiIf
        condition={(s) =>
          s.thread.capabilities.speech && s.message.speech == null
        }
      >
        <ActionBarPrimitive.Speak
          aria-label={homeText("Read aloud")}
          className={actionButtonClass}
        >
          <Volume2Icon className="size-4" />
        </ActionBarPrimitive.Speak>
      </AuiIf>
      <AuiIf condition={(s) => s.message.speech != null}>
        <ActionBarPrimitive.StopSpeaking
          aria-label={homeText("Stop reading")}
          className={cn(actionButtonClass, "text-foreground")}
        >
          <SquareIcon className="size-3.5 fill-current" />
        </ActionBarPrimitive.StopSpeaking>
      </AuiIf>
      <ActionBarPrimitive.Reload
        aria-label={homeText("Regenerate response")}
        className={actionButtonClass}
      >
        <RefreshCwIcon className="size-4" />
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={homeText("More actions")}
            className={cn(
              actionButtonClass,
              "data-[state=open]:text-foreground",
            )}
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className={menuContentClass}
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className={menuItemClass}>
              <DownloadIcon className="size-3.5" />{homeText("Export as Markdown")}</ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
      <MessageTiming
        side="bottom"
        className="text-muted-foreground/70 hover:text-foreground ms-1 rounded-none p-1 text-[11px] hover:bg-transparent"
      />
    </ActionBarPrimitive.Root>
  );
}

export function BranchPicker({ className }: { className?: string }): ReactNode {
  useHomeLocale();
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "text-muted-foreground inline-flex items-center font-mono text-[11px] tabular-nums",
        className,
      )}
    >
      <BranchPickerPrimitive.Previous
        aria-label={homeText("Previous version")}
        className={actionButtonClass}
      >
        <ChevronLeftIcon className="size-4" />
      </BranchPickerPrimitive.Previous>
      <span>
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next
        aria-label={homeText("Next version")}
        className={actionButtonClass}
      >
        <ChevronRightIcon className="size-4" />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}
