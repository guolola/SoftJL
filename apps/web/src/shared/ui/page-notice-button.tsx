// Presents a compact, consistently placed entry to page guidance dialogs.
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Button } from "./button";
import { cn } from "./utils";

export type PageNoticeTone = "warning" | "destructive" | "info" | "success";

const presentation = {
  warning: {
    icon: AlertTriangle,
    className: "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15 hover:text-warning",
  },
  destructive: {
    icon: AlertCircle,
    className: "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive",
  },
  info: {
    icon: Info,
    className: "border-info/40 bg-info/10 text-info hover:bg-info/15 hover:text-info",
  },
  success: {
    icon: CheckCircle2,
    className: "border-success/40 bg-success/10 text-success hover:bg-success/15 hover:text-success",
  },
} as const;

export function PageNoticeButton({
  label,
  tone = "warning",
  onClick,
  className,
}: {
  label: string;
  tone?: PageNoticeTone;
  onClick: () => void;
  className?: string;
}) {
  const { icon: Icon, className: toneClassName } = presentation[tone];
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn("h-8 w-auto shrink-0 gap-1.5 rounded-lg", toneClassName, className)}
      aria-label={label}
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}
