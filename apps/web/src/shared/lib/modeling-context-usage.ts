// Shares provider token usage and meter semantics between quick and engineering modeling.
export type TokenUsage = {
  totalTokens?: number;
  /** Distinguishes the last provider call from the live session context total. */
  breakdownScope?: "lastCall";
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
};

export function getUsagePercent(totalTokens: number | undefined, modelContextWindow: number): number {
  if (!totalTokens || !Number.isFinite(totalTokens) || !(modelContextWindow > 0) || !Number.isFinite(modelContextWindow)) return 0;
  return Math.min(Math.max((totalTokens / modelContextWindow) * 100, 0), 100);
}

function getUsageSeverity(percent: number): "normal" | "warning" | "critical" {
  if (percent > 85) return "critical";
  if (percent >= 65) return "warning";
  return "normal";
}

export function getStrokeColor(percent: number): string {
  const severity = getUsageSeverity(percent);
  return severity === "critical" ? "stroke-red-500" : severity === "warning" ? "stroke-amber-500" : "stroke-foreground";
}

export function getBarColor(percent: number): string {
  const severity = getUsageSeverity(percent);
  return severity === "critical" ? "bg-red-500" : severity === "warning" ? "bg-amber-500" : "bg-foreground";
}

export function getPercentColor(percent: number): string {
  const severity = getUsageSeverity(percent);
  return severity === "critical" ? "text-red-500" : severity === "warning" ? "text-amber-500" : "text-muted-foreground";
}

// Providers disagree on whether cache and reasoning counts are included in input
// and output. Report the supplied breakdown without inventing additive shares.
export function getContextSegments(usage: TokenUsage | undefined): Array<{ label: string; tokens: number }> {
  if (!usage) return [];
  return [
    { label: "Input", tokens: usage.inputTokens ?? 0 },
    { label: "Cached input", tokens: usage.cachedInputTokens ?? 0 },
    { label: "Output", tokens: usage.outputTokens ?? 0 },
    { label: "Reasoning", tokens: usage.reasoningTokens ?? 0 },
  ].filter((segment) => Number.isFinite(segment.tokens) && segment.tokens > 0);
}
