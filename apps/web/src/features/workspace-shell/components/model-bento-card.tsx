// Shared Bento-style model target card used by workspace generation stages.
import { SpotlightCard } from "../../../shared/ui/interactive-card";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "../../../shared/ui/badge";
import { Checkbox } from "../../../shared/ui/checkbox";
import { cn } from "../../../shared/ui/utils";
import { GenerationStatusIcon, type GenerationStatus } from "../../../shared/ui/generation-status-icon";
import { categoryChipTone } from "../../../shared/ui/category-tones";

type ModelBentoCardProps = {
  label: string;
  english: string;
  description: string;
  singleLineDescription?: boolean;
  icon: LucideIcon;
  categoryColorIndex?: number;
  selected: boolean;
  disabled?: boolean;
  countLabel?: ReactNode;
  pendingReview?: boolean;
  title?: string;
  ariaLabel: string;
  checkboxLabel: string;
  status: GenerationStatus;
  content?: ReactNode;
  details?: ReactNode;
  className?: string;
  onSelectedChange: (selected: boolean) => void;
};

export function ModelBentoCard({
  label,
  english,
  description,
  singleLineDescription = false,
  icon: Icon,
  categoryColorIndex,
  selected,
  disabled = false,
  countLabel,
  pendingReview = false,
  title,
  ariaLabel,
  checkboxLabel,
  status,
  content,
  details,
  className,
  onSelectedChange,
}: ModelBentoCardProps) {
  const handleToggle = () => {
    if (!disabled) {
      onSelectedChange(!selected);
    }
  };

  return (
    <SpotlightCard
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      onClick={handleToggle}
      onKeyDown={(event) => {
        if (disabled || event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleToggle();
        }
      }}
      className={cn(
        "group relative h-[212px] min-w-0 gap-0 overflow-hidden p-3 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-[236px] sm:p-5 [&>div]:flex [&>div]:flex-col",
        selected &&
          "ring-1 ring-primary",
        disabled
          ? "cursor-not-allowed"
          : "cursor-pointer hover:bg-muted/50",
        className,
      )}
    >
      <div className="min-w-0 shrink-0">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground sm:size-10",
              categoryColorIndex !== undefined && categoryChipTone(categoryColorIndex),
              disabled && "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-4 sm:size-5" />
          </span>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {countLabel !== undefined && (
              <span
                className={cn(
                  "rounded-md bg-accent px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-4 text-accent-foreground sm:px-2 sm:text-xs",
                  disabled && "bg-muted text-muted-foreground",
                )}
              >
                {countLabel}
              </span>
            )}
            <Checkbox
              checked={selected}
              disabled={disabled}
              name={checkboxLabel}
              aria-label={checkboxLabel}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              onCheckedChange={(value) => onSelectedChange(Boolean(value))}
            />
          </div>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1">
          <h3
            title={label}
            className={cn(
              "min-w-0 truncate text-sm font-semibold leading-5 text-foreground sm:text-base sm:leading-6",
              selected && "text-primary",
              disabled && "text-muted-foreground",
            )}
          >
            {label}
          </h3>
          <GenerationStatusIcon status={status} label={label} />
          {pendingReview && <Badge variant="warning" className="px-1.5 py-0 text-[10px]">待审</Badge>}
        </div>
        <span title={english} className="block truncate font-mono text-[11px] leading-4 text-muted-foreground sm:text-xs sm:leading-5">
          {english}
        </span>
        <p title={description} className={cn("mt-2 text-xs leading-4 text-muted-foreground sm:leading-5", singleLineDescription ? "truncate" : "line-clamp-2")}>
          {description}
        </p>
      </div>
      {(details || content) && (
        // Disabling card selection must not disable viewing an existing artifact or reviewing its inputs.
        <div aria-disabled={false} className="mt-3 min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto overscroll-contain text-[11px] leading-4 text-muted-foreground sm:text-xs sm:leading-5">
          {details}
          {content}
        </div>
      )}
    </SpotlightCard>
  );
}
