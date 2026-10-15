// Renders fixed-layout lineage node cards without graph-canvas dependencies.
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileCode2,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Network,
  ScrollText,
  Workflow,
} from "lucide-react";
import type { ComponentType, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared/ui/button";
import { cn } from "../../../shared/ui/utils";
import type {
  LineageNode,
  LineageNodeKind,
  LineageNodeStatus,
} from "../lib/lineage-graph-model";

const STATUS_STYLES: Record<
  LineageNodeStatus,
  {
    card: string;
    badge: string;
    icon: ComponentType<{ className?: string }>;
  }
> = {
  "not-generated": {
    card: "border-border bg-card text-card-foreground",
    badge: "bg-muted text-muted-foreground",
    icon: Clock3,
  },
  current: {
    card: "border-success/30 bg-card text-card-foreground ring-1 ring-success/10",
    badge: "bg-success/10 text-success",
    icon: CheckCircle2,
  },
  stale: {
    card: "border-warning/40 bg-card text-card-foreground ring-1 ring-warning/15",
    badge: "bg-warning/10 text-warning",
    icon: AlertCircle,
  },
  error: {
    card: "border-destructive/40 bg-card text-card-foreground ring-1 ring-destructive/15",
    badge: "bg-destructive/10 text-destructive",
    icon: AlertCircle,
  },
  running: {
    card: "border-primary/40 bg-card text-card-foreground ring-1 ring-primary/15",
    badge: "bg-info/10 text-info",
    icon: Loader2,
  },
  interrupted: {
    card: "border-warning/40 bg-card text-card-foreground ring-1 ring-warning/15",
    badge: "bg-warning/10 text-warning",
    icon: AlertCircle,
  },
};

export const LINEAGE_KIND_STYLES: Record<
  LineageNodeKind,
  {
    icon: ComponentType<{ className?: string }>;
    iconBox: string;
    iconColor: string;
  }
> = {
  rule: {
    icon: ListChecks,
    iconBox: "border-border bg-muted/60",
    iconColor: "text-info",
  },
  "requirement-model": {
    icon: Network,
    iconBox: "border-border bg-muted/60",
    iconColor: "text-info",
  },
  "design-model": {
    icon: Workflow,
    iconBox: "border-border bg-muted/60",
    iconColor: "text-primary",
  },
  document: {
    icon: ScrollText,
    iconBox: "border-border bg-muted/60",
    iconColor: "text-warning",
  },
  
};

type LineageNodeCardProps = {
  node: LineageNode;
  selected: boolean;
  muted: boolean;
  registerNode: (element: HTMLElement | null) => void;
  onSelect: (node: LineageNode) => void;
  onPrimaryAction: (node: LineageNode) => void;
};

function NodeIcon({ status }: { status: LineageNodeStatus }) {
  const Icon = STATUS_STYLES[status].icon;
  return (
    <Icon
      className={cn("size-3.5", status === "running" && "animate-spin")}
      aria-hidden="true"
    />
  );
}

export function LineageKindIcon({
  kind,
  className,
}: Pick<LineageNode, "kind"> & { className?: string }) {
  const style = LINEAGE_KIND_STYLES[kind];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border",
        style.iconBox,
        className,
      )}
      aria-hidden="true"
    >
      <Icon className={cn("size-[18px]", style.iconColor)} />
    </span>
  );
}

export function LineageNodeCard({
  node,
  selected,
  muted,
  registerNode,
  onSelect,
  onPrimaryAction,
}: LineageNodeCardProps) {
  const { t } = useTranslation();
  const styles = STATUS_STYLES[node.status];
  const statusKey = node.status === "not-generated" ? "not_generated" : node.status;
  const kindKey = node.kind.replace("-", "_");
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(node);
  };

  return (
    <article
      ref={registerNode}
      role="button"
      tabIndex={0}
      data-testid={`lineage-node-${node.id}`}
      data-lineage-kind={node.kind}
      data-lineage-status={node.status}
      data-lineage-viewable={node.hasViewableArtifact ? "true" : "false"}
      aria-label={`${node.stageLabel} ${node.label}`}
      onClick={() => onSelect(node)}
      onKeyDown={handleKeyDown}
      className={cn(
        "group relative min-h-[128px] rounded-lg border p-3.5 pl-4 text-left shadow-sm transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        styles.card,
        selected && "ring-2 ring-primary ring-offset-2",
        muted && "opacity-25 grayscale",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <LineageKindIcon kind={node.kind} />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold leading-6">{node.label}</h3>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
                  styles.badge,
                )}
              >
                <NodeIcon status={node.status} />
                {t(`lineage.statuses.${statusKey}`)}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {t(`lineage.kinds.${kindKey}`)}
              </span>
            </div>
          </div>
        </div>
        <div className="shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("lineage.more", { label: node.label })}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(node);
            }}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="mt-3 min-w-0">
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
          {node.description}
        </p>
        <p className="mt-2 line-clamp-1 text-xs leading-5 text-muted-foreground">
          {node.reason}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="truncate text-xs text-muted-foreground">{node.stageLabel}</span>
        <Button
          type="button"
          variant={node.status === "current" ? "outline" : "secondary"}
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          disabled={node.status === "running"}
          onClick={(event) => {
            event.stopPropagation();
            onPrimaryAction(node);
          }}
        >
          {node.actionLabel}
        </Button>
      </div>
    </article>
  );
}
