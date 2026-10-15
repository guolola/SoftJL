// Compact, accessible generation status shared by model target cards.
import { CheckCircle2, CircleDashed, Clock3, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { cn } from "./utils";

export type GenerationStatus = "missing" | "queued" | "running" | "completed" | "failed" | "stale";

const presentation = {
  missing: { icon: CircleDashed, color: "text-muted-foreground", key: "feasibility.status.missing" },
  queued: { icon: Clock3, color: "text-muted-foreground", key: "workspace.sidebar.queued" },
  running: { icon: Loader2, color: "animate-spin text-primary", key: "feasibility.status.generating" },
  completed: { icon: CheckCircle2, color: "text-success", key: "workspace.sidebar.generated" },
  failed: { icon: XCircle, color: "text-destructive", key: "feasibility.status.failed" },
  stale: { icon: TriangleAlert, color: "text-warning", key: "lineage.statuses.stale" },
} as const;

export function GenerationStatusIcon({ status, label }: { status: GenerationStatus; label: string }) {
  const { t } = useTranslation();
  const { icon: Icon, color, key } = presentation[status];
  const description = `${label}：${t(key)}`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span role="img" tabIndex={0} aria-label={description} />}
        data-generation-status={status}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Icon aria-hidden="true" className={cn("size-3.5", color)} />
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  );
}
