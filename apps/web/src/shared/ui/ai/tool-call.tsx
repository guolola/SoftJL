// shadcn.io/ai Tool: collapsible tool-call/result list used for trace entries.
import { ChevronDown, Wrench } from "lucide-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { cn } from "@/shared/ui/utils";

export function ToolCall({
  title,
  entries,
  className,
}: {
  title: React.ReactNode;
  entries: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("rounded-lg border border-border", className)}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <Wrench className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{title}</span>
          <span className="text-muted-foreground shrink-0">({entries.length})</span>
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-3 py-2">
        <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
          {entries.map((entry, index) => (
            <li key={`${entry}-${index}`} className="break-words">
              {entry}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
