// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.
"use client";
import { homeText, useHomeLocale } from "../integration/home-locale";


import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import type { ReactNode } from "react";
import { ShimmerLabel } from "./elements/surfaces";
import { CollapsibleTrigger } from "./ui/collapsible";
import {
  TraceLine,
  TraceMarker,
  formatDuration,
  useToolDuration,
} from "./trace-line";

export const disclosureContentClass =
  "border-foreground/10 ms-[5px] border-s ps-4";

export function DisclosureTrigger({
  live,
  label,
  detail,
}: {
  live: boolean;
  label: string;
  detail?: string;
}): ReactNode {
  useHomeLocale();
  return (
    <CollapsibleTrigger className="group/trigger my-1 flex max-w-full items-baseline gap-2 text-left font-mono text-[12px] outline-none [font-variant-ligatures:none] focus-visible:underline">
      <TraceMarker
        live={live}
        className="group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90"
      />
      <span className="text-muted-foreground group-hover/trigger:text-foreground min-w-0 truncate transition-colors">
        {live ? (
          <ShimmerLabel>
            {homeText(label)}
            {detail ? ` ${homeText(detail)}` : null}
          </ShimmerLabel>
        ) : (
          <>
            {homeText(label)}
            {detail ? ` ${homeText(detail)}` : null}
          </>
        )}
      </span>
    </CollapsibleTrigger>
  );
}

export function ToolCall({
  toolName,
  args,
  status,
}: ToolCallMessagePartProps): ReactNode {
  useHomeLocale();
  const isRunning = status?.type === "running";
  const duration = useToolDuration(isRunning);
  const searchQuery =
    toolName === "search_docs" && typeof args.query === "string"
      ? args.query
      : undefined;

  return (
    <TraceLine
      live={isRunning}
      label={
        searchQuery !== undefined
          ? isRunning
            ? homeText("searching")
            : homeText("searched")
          : isRunning
            ? homeText("running")
            : homeText("ran")
      }
      detail={
        searchQuery !== undefined ? `the docs for “${searchQuery}”` : toolName
      }
      {...(duration !== null ? { meta: formatDuration(duration) } : {})}
    />
  );
}
