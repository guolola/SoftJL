// Projects Pi's full persisted history into safe usage counters; diagram workers are deliberately excluded.
import type { StandardTokenUsage } from "@uml-platform/contracts";

export function standardTokenUsage(entries: unknown[], context: { tokens: number | null; contextWindow: number } | undefined, model: string, budget: number): StandardTokenUsage {
  const usage: StandardTokenUsage = { model, contextBudget: context?.contextWindow ?? budget, contextTokens: context?.tokens ?? null,
    lastCall: null, cumulative: { total: 0, calls: 0, unreportedCalls: 0 } };
  for (const entry of entries) {
    const message = (entry as { type?: string; message?: { role?: string; usage?: Record<string, number> } })?.message;
    if (message?.role !== "assistant") continue;
    const raw = message.usage;
    // Pi initializes missing provider usage to zeros. That is unknown usage, not a free request.
    if (!raw || ![raw.input, raw.output, raw.cacheRead, raw.cacheWrite, raw.totalTokens].every(value => Number.isFinite(value) && value! >= 0) || !raw.totalTokens) {
      usage.lastCall = null; usage.cumulative.unreportedCalls++; continue;
    }
    usage.lastCall = { input: raw.input! + raw.cacheRead! + raw.cacheWrite!, output: raw.output!,
      cacheRead: raw.cacheRead || null, cacheWrite: raw.cacheWrite || null, total: raw.totalTokens };
    usage.cumulative.total += raw.totalTokens; usage.cumulative.calls++;
  }
  return usage;
}
