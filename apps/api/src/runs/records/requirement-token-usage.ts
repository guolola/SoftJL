// Persists actual engineering provider usage once per call for durable run history fallback.
import type { ModelCapacity, ModelTokenUsage, RunSnapshot } from "@uml-platform/contracts";
import type { LlmTransport, StreamTokenUsage } from "../../llm.js";
import { standardContextBudget } from "../../adapters/llm/pi-provider.js";
import type { RunRecord } from "./run-record-store.js";

export function emptyRequirementTokenUsage(model: string, capacity?: ModelCapacity): ModelTokenUsage {
  return { model, ...(capacity ? { capacity } : {}), contextBudget: standardContextBudget(capacity), contextTokens: null,
    lastCall: null, cumulative: { total: 0, calls: 0, unreportedCalls: 0 } };
}

function count(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function appendUsage(current: ModelTokenUsage, raw: StreamTokenUsage | undefined) {
  const input = count(raw?.inputTokens), output = count(raw?.outputTokens);
  const total = count(raw?.totalTokens) ?? (input !== null && output !== null ? input + output : null);
  current.contextTokens = total;
  current.lastCall = total !== null && input !== null && output !== null
    ? { input, output, cacheRead: count(raw?.cachedInputTokens), cacheWrite: null, total }
    : null;
  if (total === null) current.cumulative.unreportedCalls++;
  else { current.cumulative.calls++; current.cumulative.total += total; }
}

export function withRequirementTokenUsage(record: RunRecord, model: string, transport: LlmTransport): LlmTransport {
  return { async *streamChatCompletion(input) {
    let reported: StreamTokenUsage | undefined;
    try {
      yield* transport.streamChatCompletion({ ...input, onTokenUsage(value) {
        // Providers may emit more than one usage frame. Only their latest cumulative frame counts for this call.
        reported = value;
        input.onTokenUsage?.(value);
      } });
    } finally {
      const snapshot = record.snapshot as RunSnapshot;
      const usage = snapshot.tokenUsage?.model === model ? snapshot.tokenUsage : emptyRequirementTokenUsage(model);
      appendUsage(usage, reported);
      snapshot.tokenUsage = usage;
      // Persist counters independently of streamed text so a reload during a later stage retains real usage.
      void record.persist?.(record);
    }
  } };
}
