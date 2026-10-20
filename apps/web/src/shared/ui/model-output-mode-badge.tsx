// Keeps the three model output capability labels consistent across model selectors.
import { useTranslation } from "react-i18next";
import type { ProviderStructuredOutputMode } from "@uml-platform/contracts";
import { cn } from "./utils";

export function ModelOutputModeBadge({ mode, className }: { mode: ProviderStructuredOutputMode; className?: string }) {
  const { t } = useTranslation();
  return <span data-slot="model-output-mode-badge" data-mode={mode} className={cn(
    "shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium",
    mode === "strict_json"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : mode === "json_object"
        ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
        : "bg-muted text-muted-foreground",
    className,
  )}>
    {t(mode === "strict_json" ? "modelPicker.modes.strictJson" : mode === "json_object" ? "modelPicker.modes.jsonObject" : "modelPicker.modes.compatible")}
  </span>;
}
