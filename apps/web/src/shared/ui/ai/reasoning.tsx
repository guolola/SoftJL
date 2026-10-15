// Adapts AI Elements' streaming reasoning disclosure to the workspace's Base UI primitives.
import { createContext, memo, useCallback, useContext, useEffect, useRef, useState, type ComponentProps } from "react";
import { Brain, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../collapsible";
import { cn } from "../utils";
import { Shimmer } from "./shimmer";

interface ReasoningContextValue {
  isOpen: boolean;
  isStreaming: boolean;
  duration?: number;
}
const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoning() {
  const context = useContext(ReasoningContext);
  if (!context) throw new Error("Reasoning components must be used within Reasoning");
  return context;
}

export type ReasoningProps = Omit<ComponentProps<typeof Collapsible>, "open" | "defaultOpen" | "onOpenChange"> & {
  isStreaming?: boolean;
  duration?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export const Reasoning = memo(function Reasoning({
  isStreaming = false, duration: givenDuration, defaultOpen, open, onOpenChange, className, children, ...props
}: ReasoningProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? isStreaming);
  const [elapsed, setElapsed] = useState<number>();
  const isOpen = open ?? internalOpen;
  const wasStreaming = useRef(isStreaming);
  const manualChoice = useRef(false);
  const beganAt = useRef<number | null>(isStreaming ? Date.now() : null);
  const setOpen = useCallback((next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  useEffect(() => {
    if (isStreaming && !wasStreaming.current) {
      beganAt.current = Date.now();
      if (!manualChoice.current && defaultOpen !== false) setOpen(true);
    }
    if (!isStreaming && wasStreaming.current) {
      if (beganAt.current !== null) setElapsed(Math.ceil((Date.now() - beganAt.current) / 1000));
      beganAt.current = null;
      if (!manualChoice.current) {
        const timer = setTimeout(() => setOpen(false), 1000);
        wasStreaming.current = isStreaming;
        return () => clearTimeout(timer);
      }
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming, defaultOpen, setOpen]);

  const handleOpenChange = (next: boolean) => {
    manualChoice.current = true;
    setOpen(next);
  };
  return <ReasoningContext.Provider value={{ isOpen, isStreaming, duration: givenDuration ?? elapsed }}>
    <Collapsible {...props} open={isOpen} onOpenChange={handleOpenChange} className={cn("min-w-0", className)}>{children}</Collapsible>
  </ReasoningContext.Provider>;
});

export const ReasoningTrigger = memo(function ReasoningTrigger({ className, children, ...props }: ComponentProps<typeof CollapsibleTrigger>) {
  const { isOpen, isStreaming, duration } = useReasoning();
  return <CollapsibleTrigger {...props} className={cn("flex w-full items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground", className)}>
    {children ?? <><Brain className="size-3.5 shrink-0" aria-hidden="true" />{isStreaming ? <Shimmer>正在思考…</Shimmer> : <span>{duration === undefined ? "思考过程" : `思考了 ${duration} 秒`}</span>}<ChevronDown className={cn("ml-auto size-3.5 shrink-0 transition-transform motion-reduce:transition-none", isOpen && "rotate-180")} aria-hidden="true" /></>}
  </CollapsibleTrigger>;
});

export const ReasoningContent = memo(function ReasoningContent({ className, children, ...props }: Omit<ComponentProps<typeof CollapsibleContent>, "children"> & { children: string }) {
  return <CollapsibleContent {...props} className={cn("mt-2 min-w-0 break-words text-xs leading-5 text-muted-foreground", className)}>
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
  </CollapsibleContent>;
});
