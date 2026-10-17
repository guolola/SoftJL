// Formats per-run reported token totals without inventing counts for missing provider telemetry.
import type { PlatformRunTokenConsumption } from "../services/platform-api";

const tokenCount = new Intl.NumberFormat("en-US", { useGrouping: false, maximumFractionDigits: 3 });

export function formatRunTokenCount(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return `${tokenCount.format(value / 1000)}k`;
}

export function runTokenConsumptionPresentation(consumption: PlatformRunTokenConsumption | undefined) {
  const metrics = {
    total: formatRunTokenCount(consumption?.totalTokens),
    input: formatRunTokenCount(consumption?.inputTokens),
    output: formatRunTokenCount(consumption?.outputTokens),
    cachedInput: formatRunTokenCount(consumption?.cachedInputTokens),
    reasoning: formatRunTokenCount(consumption?.reasoningTokens),
  };
  const hasReportedUsage = Object.values(metrics).some((value) => value !== null);
  const calls = Math.max(0, consumption?.calls ?? 0);
  const unreportedCalls = Math.max(0, consumption?.unreportedCalls ?? 0);
  return {
    metrics,
    calls,
    unreportedCalls,
    hasReportedUsage,
    // A call can report input but omit output or total; keep each known sum
    // while clearly marking the aggregate as partial instead of implying completeness.
    partial: hasReportedUsage && unreportedCalls > 0,
  };
}
