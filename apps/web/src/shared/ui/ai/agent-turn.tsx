// shadcn.io/ai Agent + Message: one generation stage rendered as an agent conversation turn.
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/ui/utils";

export function AgentTurn({
  icon: Icon,
  title,
  badge,
  badgeVariant = "secondary",
  running = false,
  meta,
  children,
  className,
  "data-testid": dataTestId,
}: {
  icon: LucideIcon;
  title: ReactNode;
  badge?: ReactNode;
  badgeVariant?: "secondary" | "outline" | "destructive" | "default";
  running?: boolean;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div data-slot="ai-agent-turn" data-testid={dataTestId} className={cn("flex gap-3", className)}>
      <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full border border-border">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          {badge ? <Badge variant={badgeVariant}>{badge}</Badge> : null}
          {running ? <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" /> : null}
          {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
        </div>
        {children ? <div className="mt-2 flex min-w-0 flex-col gap-2">{children}</div> : null}
      </div>
    </div>
  );
}
