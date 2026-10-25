// Shows server-confirmed tool attempts without mounting model JSON or source contents.
import { Check, Circle, CircleAlert, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../shared/ui/utils";
import type { TranscriptStep, TranscriptToolCall } from "../lib/generation-transcript";

export function GenerationToolCalls({ tools, artifactType, revalidation = false }: { tools: TranscriptToolCall[]; artifactType?: TranscriptStep["artifactType"]; revalidation?: boolean }) {
  const { t } = useTranslation();
  return <ol aria-label={t("generation.tools.label")} className="space-y-2 text-sm">
    {tools.map(tool => {
      const Icon = tool.status === "running" ? LoaderCircle : tool.status === "completed" ? Check : tool.status === "failed" ? CircleAlert : Circle;
      const validationType = tool.name === "validate_requirement_rules" ? "requirement-rules" : artifactType ?? "model";
      const label = tool.name === "validate_model" || tool.name === "validate_requirement_rules"
        ? t(`generation.tools.${revalidation ? "revalidation" : "validation"}.${validationType}`) : t(`generation.tools.names.${tool.name}`);
      return <li key={tool.id} className="min-w-0" data-slot="generation-tool-call">
        <div className="flex items-start gap-2">
          <Icon aria-hidden="true" className={cn("mt-0.5 size-3 shrink-0", tool.status === "running" && "animate-spin motion-reduce:animate-none", tool.status === "failed" && "text-warning")} />
          <span className="min-w-0 flex-1">
            <span className="break-words text-foreground">{label}{tool.source && `：${tool.source.label ?? t(`generation.tools.sources.${tool.source.sourceType}`)}`}</span>
          </span>
          <span className="shrink-0 text-xs">{t(`generation.tools.status.${tool.status === "completed" && tool.name !== "get_upstream_artifact" ? "passed" : tool.status}`)}</span>
        </div>
        {(tool.errorCount !== undefined || tool.warningCount !== undefined) && <p className="mt-0.5 pl-5 text-xs text-muted-foreground">
          {tool.errorCount !== undefined && t("generation.tools.errors", { count: tool.errorCount })}
          {tool.warningCount !== undefined && t("generation.tools.warnings", { count: tool.warningCount })}
        </p>}
      </li>;
    })}
  </ol>;
}
