// Reuses the recorded total duration for old messages; unavailable stream statistics remain explicitly unknown.
export * from "@assistant-ui/react";
import { useAuiState, useMessageTiming as upstreamTiming } from "@assistant-ui/react";
import { homeText, useHomeLocale } from "./home-locale";
export function useMessageTiming() {
  useHomeLocale();
  const timing = upstreamTiming();
  const duration = useAuiState(s => s.message.metadata.custom?.durationMs);
  return timing ?? (typeof duration === "number" ? { totalStreamTime: duration, firstTokenTime: undefined, tokensPerSecond: undefined, totalChunks: homeText("Not recorded") } : undefined);
}
