// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.
"use client";
import { homeText, useHomeLocale } from "../integration/home-locale";


import {
  type AssistantState,
  AuiIf,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { ArrowDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SelectionToolbar } from "./elements/quote.aui";
import { Skeleton } from "./ui/skeleton";
import { cn } from "./lib/utils";
import { Composer, EditComposer } from "../integration/intro-entry";
import { ConversationBudget } from "./conversation-budget";
import { Greeting } from "./greeting";
import { ProjectThreadMessage } from "../integration/project-thread-message";
import { FollowUps, Suggestions } from "../integration/intro-entry";

const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  (!s.thread.isLoading || s.threads.isLoading);

const isHistoryLoadingView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  s.thread.isLoading &&
  !s.thread.isDisabled &&
  !s.threads.isLoading;

export function Thread(): ReactNode {
  useHomeLocale();
  const isEmpty = useAuiState(isNewChatView);
  const footer = (
    <div data-testid="conversation-composer-footer" className="relative mx-auto flex w-full max-w-(--thread-max-width) shrink-0 flex-col gap-3 overflow-visible pb-5">
      <ThreadPrimitive.ScrollToBottom asChild>
        <button
          type="button"
          aria-label={homeText("Scroll to bottom")}
          className="border-foreground/10 bg-background hover:border-foreground/25 rounded-control absolute -top-11 z-10 grid size-8 place-items-center self-center border transition-colors disabled:invisible"
        >
          <ArrowDownIcon className="size-4" />
        </button>
      </ThreadPrimitive.ScrollToBottom>
      <FollowUps />
      <ConversationBudget>
        <Composer />
        <AuiIf condition={isNewChatView}>
          <Suggestions />
        </AuiIf>
      </ConversationBudget>
    </div>
  );

  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Share scroll controls with the footer while only messages occupy the scrollable viewport. */}
      <ThreadPrimitive.ViewportProvider>
        <ThreadPrimitive.Viewport
          data-testid="conversation-message-viewport"
          turnAnchor="top"
          className={cn(
            // The gutter is reserved whether or not a scrollbar is showing, so the
            // thread and its composer do not shift sideways on the first reply
            // that overflows. Only classic scrollbars take layout space, so the
            // jump appears on Windows and on macOS set to always show them.
            "relative flex min-h-0 flex-1 [scrollbar-gutter:stable_both-edges] flex-col overflow-y-auto px-4 pt-6 md:px-6",
            isEmpty && "justify-center",
          )}
        >
          <AuiIf condition={isNewChatView}>
            <Greeting />
          </AuiIf>
          <AuiIf condition={isHistoryLoadingView}>
            <div
              role="status"
              className="animate-in fade-in fill-mode-both mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-y-6 [animation-delay:150ms] [animation-duration:200ms]"
            >
              <span className="sr-only">{homeText("Loading conversation")}</span>
              <Skeleton className="rounded-thread ml-auto h-9 w-2/5 motion-reduce:animate-none" />
              <div className="flex flex-col gap-y-2">
                <Skeleton className="h-4 w-11/12 motion-reduce:animate-none" />
                <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
                <Skeleton className="h-4 w-3/5 motion-reduce:animate-none" />
              </div>
              <Skeleton className="rounded-thread ml-auto h-9 w-1/3 motion-reduce:animate-none" />
              <div className="flex flex-col gap-y-2">
                <Skeleton className="h-4 w-10/12 motion-reduce:animate-none" />
                <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
              </div>
            </div>
          </AuiIf>

          <div className="mb-12 flex shrink-0 flex-col gap-y-6 empty:hidden">
            <ThreadPrimitive.Messages>
              {({ message }) => {
                if (message.composer.isEditing) return <EditComposer />;
                if (message.role === "user" || message.role === "assistant") return <ProjectThreadMessage />;
                return null;
              }}
            </ThreadPrimitive.Messages>
          </div>

          {isEmpty && footer}
        </ThreadPrimitive.Viewport>
        {!isEmpty && <div className="shrink-0 px-4 md:px-6">{footer}</div>}
        <SelectionToolbar className="border-foreground/10 rounded-control" />
      </ThreadPrimitive.ViewportProvider>
    </ThreadPrimitive.Root>
  );
}
