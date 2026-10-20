// Uses the live session context for the meter; provider-call details remain a separate breakdown.
import { useMemo } from "react";
import { useHomeDemo } from "./environment";
export function useThreadTokenUsage() {
  const { state, model } = useHomeDemo();
  const usage = state.tokenUsage?.model === model ? state.tokenUsage : undefined;
  return useMemo(() => {
    // Compaction invalidates the old context measurement until the session reports a fresh one.
    if (state.contextStatus === "compacting" || usage?.contextTokens == null) return undefined;
    return {
      totalTokens: usage.contextTokens,
      breakdownScope: usage.lastCall ? "lastCall" as const : undefined,
      inputTokens: usage.lastCall?.input,
      cachedInputTokens: usage.lastCall?.cacheRead ?? undefined,
      outputTokens: usage.lastCall?.output,
    };
  }, [usage, state.contextStatus]);
}
