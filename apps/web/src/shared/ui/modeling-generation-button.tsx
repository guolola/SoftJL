// Shares the generation action's label and arrow while allowing compact composer send buttons.
import type { ComponentPropsWithRef } from "react";
import { ArrowUpIcon, Loader2 } from "lucide-react";
import { primeCompletionChime } from "../lib/completion-chime";
import { cn } from "./utils";

export function ModelingGenerationButton({ label, busy = false, iconOnly = false, className, title, onClick, ...props }: ComponentPropsWithRef<"button"> & { label: string; busy?: boolean; iconOnly?: boolean }) {
  return <button type="button" {...props} aria-label={label} title={title ?? label}
    // Unlock audio within the user's gesture so the later completion chime satisfies autoplay rules.
    onClick={(event) => { primeCompletionChime(); onClick?.(event); }}
    className={cn("bg-primary text-primary-foreground rounded-[0.5rem] rounded-control inline-flex h-7 shrink-0 items-center justify-center gap-1.5 text-xs font-medium transition-opacity disabled:opacity-40", iconOnly ? "w-7" : "px-2.5", className)}>
    {!iconOnly && label}
    {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <ArrowUpIcon aria-hidden="true" className="size-4" />}
  </button>;
}
