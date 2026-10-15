// Adapts AI Elements' task timeline to the workspace's shared collapsible primitives.
import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import { Brain, ChevronDown, Circle, type LucideIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../collapsible";
import { cn } from "../utils";

const ChainOfThoughtContext = createContext(true);

export function ChainOfThought({ open, defaultOpen = true, onOpenChange, className, children, ...props }:
  Omit<ComponentProps<typeof Collapsible>, "open" | "defaultOpen" | "onOpenChange"> & {
    open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void;
  }) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  // Streaming updates never override the reader's choice to fold the whole task.
  return <ChainOfThoughtContext.Provider value={isOpen}>
    <Collapsible {...props} open={isOpen} onOpenChange={(next) => { setInternalOpen(next); onOpenChange?.(next); }} className={cn("min-w-0 text-sm leading-6", className)} data-slot="chain-of-thought">{children}</Collapsible>
  </ChainOfThoughtContext.Provider>;
}

export function ChainOfThoughtHeader({ className, children, ...props }: ComponentProps<typeof CollapsibleTrigger>) {
  const open = useContext(ChainOfThoughtContext);
  return <CollapsibleTrigger {...props} className={cn("flex w-full items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground", className)} data-slot="chain-of-thought-header">
    <Brain className="size-4 shrink-0" aria-hidden="true" />
    <span>{children ?? "Chain of Thought"}</span>
    <ChevronDown className={cn("ml-auto size-4 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
  </CollapsibleTrigger>;
}

export function ChainOfThoughtContent({ className, ...props }: ComponentProps<typeof CollapsibleContent>) {
  // Keep nested reasoning mounted so folding the task preserves its disclosure state.
  return <CollapsibleContent {...props} keepMounted className={cn("mt-4 min-w-0 space-y-4", className)} data-slot="chain-of-thought-content" />;
}

export function ChainOfThoughtStep({ icon: Icon = Circle, iconClassName, label, status = "complete", statusLabel, children, className, ...props }:
  Omit<ComponentProps<"section">, "title"> & { icon?: LucideIcon; iconClassName?: string; label: ReactNode; status?: "complete" | "active" | "pending"; statusLabel?: string }) {
  return <section {...props} className={cn("flex min-w-0 gap-2 text-sm leading-6 text-muted-foreground", className)} data-slot="chain-of-thought-step" data-status={status}>
    <div className="flex w-4 shrink-0 flex-col items-center gap-2 pt-1">
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", status === "active" && "text-foreground", iconClassName)} />
      <div className="min-h-3 flex-1 border-l border-border/70" aria-hidden="true" />
    </div>
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex items-start gap-2">
        <h3 className={cn("min-w-0 flex-1 break-words text-sm font-normal leading-6", status === "active" && "text-foreground")}>{label}</h3>
        {statusLabel && <span className="shrink-0 text-xs leading-6">{statusLabel}</span>}
      </div>
      {children && <div className="min-w-0 space-y-3" data-slot="chain-of-thought-step-content">{children}</div>}
    </div>
  </section>;
}

export function ChainOfThoughtImage({ caption, className, children, ...props }: ComponentProps<"figure"> & { caption?: string }) {
  return <figure {...props} className={cn("min-w-0 space-y-2", className)} data-slot="chain-of-thought-image">
    <div className="flex min-w-0 items-center justify-center overflow-hidden rounded-lg bg-muted p-3">{children}</div>
    {caption && <figcaption className="break-words text-xs leading-5 text-muted-foreground">{caption}</figcaption>}
  </figure>;
}
