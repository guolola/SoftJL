// Provides the shared Base UI scroll area used by persistent application regions.
import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "./utils";

type ScrollAreaProps = React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportRef?: React.Ref<HTMLDivElement>;
  viewportClassName?: string;
  contentClassName?: string;
  showHorizontalScrollbar?: boolean;
};

function ScrollArea({
  className,
  viewportRef,
  viewportClassName,
  contentClassName,
  showHorizontalScrollbar = false,
  children,
  ...props
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative min-h-0 min-w-0", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className={cn("size-full overflow-auto overscroll-contain", viewportClassName)}
      >
        <ScrollAreaPrimitive.Content
          data-slot="scroll-area-content"
          className={cn("min-h-full min-w-full", contentClassName)}
        >
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        data-slot="scroll-area-scrollbar"
        orientation="vertical"
        className="m-1 w-1.5 rounded-full bg-transparent opacity-0 transition-opacity data-hovering:opacity-100 data-scrolling:opacity-100"
      >
        <ScrollAreaPrimitive.Thumb
          data-slot="scroll-area-thumb"
          className="block h-full w-full rounded-full bg-border/90 transition-colors hover:bg-muted-foreground/60"
        />
      </ScrollAreaPrimitive.Scrollbar>
      {showHorizontalScrollbar ? (
        <ScrollAreaPrimitive.Scrollbar
          data-slot="scroll-area-scrollbar"
          orientation="horizontal"
          className="m-1 h-1.5 rounded-full bg-transparent opacity-0 transition-opacity data-hovering:opacity-100 data-scrolling:opacity-100"
        >
          <ScrollAreaPrimitive.Thumb
            data-slot="scroll-area-thumb"
            className="block h-full w-full rounded-full bg-border/90 transition-colors hover:bg-muted-foreground/60"
          />
        </ScrollAreaPrimitive.Scrollbar>
      ) : null}
    </ScrollAreaPrimitive.Root>
  );
}

export { ScrollArea };
