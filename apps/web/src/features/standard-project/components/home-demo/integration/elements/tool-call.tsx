// assistant-ui Tool Elements, adapted for project status and localization. See ../../LICENSE.
"use client";

import { CheckIcon, ChevronRightIcon, CircleHelpIcon, CircleXIcon } from "lucide-react";
import { cn } from "../../source/lib/utils";
import {
  CollapsibleRoot as Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../source/elements/collapsible-root";
import {
  collapsePanel,
  field,
  mono,
  ShimmerLabel,
} from "../../source/elements/surfaces";

export interface ToolCallProps {
  label: string;
  query: string;
  request: string;
  result: string;
  running: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  outcome?: "completed" | "failed" | "waiting";
  requestLabel: string;
  resultLabel: string;
}

export function ToolCall({
  label,
  query,
  request,
  result,
  running,
  open,
  onOpenChange,
  className,
  outcome = "completed",
  requestLabel,
  resultLabel,
}: ToolCallProps) {
  return (
    <Collapsible
      data-slot="tool-call"
      data-outcome={running ? "running" : outcome}
      open={open}
      onOpenChange={onOpenChange}
      className={cn("w-full max-w-sm", className)}
    >
      <CollapsibleTrigger className="group/trigger text-muted-foreground hover:text-foreground/90 flex w-full items-center gap-2 rounded-md py-1 text-[13.5px] transition-colors outline-none">
        <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none" />
        <ShimmerLabel active={running} className="shrink-0 text-start whitespace-nowrap">{label}</ShimmerLabel>
        <span
          className={cn(
            mono,
            "bg-foreground/[0.06] text-foreground/70 min-w-0 truncate rounded-md px-1.5 py-0.5",
          )}
        >
          {query}
        </span>
        <span className="ms-auto flex w-4 shrink-0 items-center justify-end">
          {!running && outcome === "completed" && (
            <CheckIcon className="fade-in zoom-in-90 animate-in size-3.5 text-emerald-500 duration-200" />
          )}
          {!running && outcome === "failed" && <CircleXIcon className="text-destructive size-3.5" />}
          {!running && outcome === "waiting" && <CircleHelpIcon className="size-3.5" />}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(collapsePanel, "outline-none")}>
        <div className={cn(field, "mt-2 overflow-hidden rounded-2xl text-xs")}>
          <div className="px-3.5 pt-2.5 pb-2">
            <p className={cn(mono, "text-muted-foreground mb-1")}>{requestLabel}</p>
            <p className="text-muted-foreground font-mono break-words">
              {request}
            </p>
          </div>
          <div className="bg-foreground/[0.06] mx-3.5 h-px" />
          <div className="px-3.5 pt-2 pb-2.5">
            <p className={cn(mono, "text-muted-foreground mb-1")}>{resultLabel}</p>
            <p className="text-foreground/90 break-words">{result}</p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
