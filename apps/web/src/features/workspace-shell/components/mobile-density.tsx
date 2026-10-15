// Provides compact mobile layout primitives for workspace pages without changing business data flow.
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../shared/ui/utils";

export const mobileTouchTargetClass = "min-h-11";

export function MobileStatusRail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
}) {
  return (
    <div
      data-workspace-density="status-rail"
      className={cn(
        "grid min-w-0 grid-cols-2 gap-2 min-[430px]:grid-cols-3 md:flex md:flex-wrap",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MobileStatusPill({
  children,
  className,
  ...props
}: {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      data-workspace-density="status-pill"
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground shadow-sm md:h-8",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function MobileRail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
}) {
  return (
    <div
      data-workspace-density="rail"
      className={cn("grid min-w-0 grid-cols-1 gap-2 md:grid md:gap-2", className)}
    >
      {children}
    </div>
  );
}

export function MobileRailCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-workspace-density="rail-card"
      className={cn(
        "min-w-0 snap-start",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MobileCompactGrid({
  children,
  className,
  variant = "standard",
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
  variant?: "standard" | "model-targets" | "document-cards";
}) {
  const densityClass = {
    standard:
      "grid-cols-2 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-3",
    "model-targets":
      "grid-cols-2 gap-2 md:gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1900px]:grid-cols-6",
    "document-cards":
      "grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
  }[variant];

  return (
    <div
      data-workspace-density="compact-grid"
      data-mobile-card-density={variant === "standard" ? "two-column" : variant}
      className={cn(
        "grid min-w-0",
        densityClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
