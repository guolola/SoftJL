// assistant-ui homepage source; module paths and UI language adapted, layout/styles preserved. See home-demo/LICENSE.
"use client";
import { homeText, useHomeLocale } from "../../integration/home-locale";


import { useMessageTiming } from "../../integration/message-timing";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../lib/utils";
import type { FC } from "react";

const formatTimingMs = (ms: number | undefined): string => {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

/**
 * Shows streaming stats (TTFT, total time, tok/s, chunks) as a badge with a
 * hover/focus tooltip. Renders nothing until the stream completes.
 *
 * Place it inside `ActionBarPrimitive.Root` in your `thread.tsx` so it
 * inherits the action bar's autohide behaviour:
 *
 * ```tsx
 * import { MessageTiming } from "./message-timing.aui";
 *
 * <ActionBarPrimitive.Root >
 *   <ActionBarPrimitive.Copy />
 *   <ActionBarPrimitive.Reload />
 *   <MessageTiming />  // <-- add this
 * </ActionBarPrimitive.Root>
 * ```
 *
 * @param side - Side of the tooltip relative to the badge trigger.
 * @default "right"
 */
export const MessageTiming: FC<{
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}> = ({ className, side = "right" }) => {
  useHomeLocale();
  const timing = useMessageTiming();
  if (timing?.totalStreamTime === undefined) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              data-slot="message-timing-trigger"
              aria-label={homeText("Message timing")}
              className={cn(
                "text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center rounded-md p-1 font-mono text-xs tabular-nums transition-colors",
                className,
              )}
            />
          }
        >
          {formatTimingMs(timing.totalStreamTime)}
        </TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={8}
          data-slot="message-timing-popover"
          className="bg-popover text-popover-foreground border px-3 py-2 [&_[data-slot=tooltip-arrow]]:hidden"
        >
          <div className="grid min-w-35 gap-1.5 text-xs">
            {timing.firstTokenTime !== undefined && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{homeText("First token")}</span>
                <span className="font-mono tabular-nums">
                  {formatTimingMs(timing.firstTokenTime)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{homeText("Total")}</span>
              <span className="font-mono tabular-nums">
                {formatTimingMs(timing.totalStreamTime)}
              </span>
            </div>
            {timing.tokensPerSecond !== undefined && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{homeText("Speed")}</span>
                <span className="font-mono tabular-nums">
                  {timing.tokensPerSecond.toFixed(1)}{homeText("tok/s")}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{homeText("Chunks")}</span>
              <span className="font-mono tabular-nums">
                {timing.totalChunks}
              </span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
