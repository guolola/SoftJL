// Shares the presentation of semantic status steps without owning workflow state or actions.
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "./utils";

export type StatusFlowTone = "success" | "warning" | "info" | "destructive";

const presentation = {
  success: { icon: CheckCircle2, className: "bg-success/10 text-success" },
  warning: { icon: AlertTriangle, className: "bg-warning/10 text-warning" },
  info: { icon: Info, className: "bg-info/10 text-info" },
  destructive: { icon: XCircle, className: "bg-destructive/10 text-destructive" },
} as const;

export function StatusFlow({ className, ...props }: ComponentProps<"ol">) {
  return <ol className={cn("relative ml-3 border-l border-border", className)} {...props} />;
}

export function StatusFlowItem({ title, tone, icon, className, children, ...props }: Omit<ComponentProps<"li">, "title"> & {
  title: ReactNode;
  tone: StatusFlowTone;
  icon?: LucideIcon;
}) {
  const { icon: DefaultIcon, className: toneClass } = presentation[tone];
  const Icon = icon ?? DefaultIcon;
  return (
    <li className={cn("relative pb-5 pl-6 last:pb-0", className)} data-flow-tone={tone} {...props}>
      <span className={cn("absolute -left-3.5 top-0 flex size-7 items-center justify-center rounded-full", toneClass)} aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <h3 className="font-medium text-foreground">{title}</h3>
      {children}
    </li>
  );
}
