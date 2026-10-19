// Matches the upstream AI SDK hook: report the newest provider usage, without inventing a zero count.
import { useMemo } from "react";
import { useHomeDemo } from "./environment";
export function useThreadTokenUsage() {
  const { state, model } = useHomeDemo();
  const usage = state.tokenUsage?.model === model ? state.tokenUsage : undefined;
  return useMemo(() => !usage?.lastCall ? undefined : {
    totalTokens: usage.lastCall.total,
    inputTokens: usage.lastCall?.input ?? undefined,
    cachedInputTokens: usage.lastCall?.cacheRead ?? undefined,
    outputTokens: usage.lastCall?.output ?? undefined,
  }, [usage]);
}
