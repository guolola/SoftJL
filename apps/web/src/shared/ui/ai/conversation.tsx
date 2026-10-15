// shadcn.io/ai Conversation: scrolling container that follows streaming agent turns.
import * as React from "react";

import { cn } from "@/shared/ui/utils";

export function Conversation({
  className,
  autoScroll = true,
  ...props
}: React.ComponentProps<"div"> & { autoScroll?: boolean }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!autoScroll || !ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  });
  return (
    <div
      ref={ref}
      data-slot="ai-conversation"
      className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4", className)}
      {...props}
    />
  );
}
