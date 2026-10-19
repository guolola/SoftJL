// Aggregates whole-run provider consumption for authorized history views without guessing missing usage.
import type { RunTokenConsumption } from "@uml-platform/contracts";
import type { RunTelemetryStore, LlmRequestTelemetry } from "../../runs/records/run-telemetry-store.js";
import type { RunRecord } from "./run-record-store.js";

const tokenFields = ["totalTokens", "inputTokens", "outputTokens", "cachedInputTokens", "reasoningTokens"] as const;
const reportedCount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const emptyConsumption = (): RunTokenConsumption => ({ totalTokens: null, inputTokens: null, outputTokens: null,
  cachedInputTokens: null, reasoningTokens: null, calls: 0, unreportedCalls: 0 });

export function aggregateRunTokenConsumption(entries: LlmRequestTelemetry[]): RunTokenConsumption {
  const consumption = emptyConsumption();
  // PostgreSQL deduplicates telemetry IDs. Keep the same accounting semantics for other store implementations.
  for (const entry of new Map(entries.map(entry => [entry.id, entry])).values()) {
    const usage = entry.usage;
    // A call cancelled while queued never reached a provider and consumed no reported tokens.
    if (entry.providerStartedAt === null && !tokenFields.some(field => reportedCount(usage?.[field]))) continue;
    consumption.calls++;
    if (![usage?.inputTokens, usage?.outputTokens, usage?.totalTokens].every(reportedCount)) consumption.unreportedCalls++;
    for (const field of tokenFields) {
      const value = usage?.[field];
      if (reportedCount(value)) consumption[field] = (consumption[field] ?? 0) + value;
    }
  }
  return consumption;
}

function snapshotConsumption(record: RunRecord): RunTokenConsumption | undefined {
  if (!("tokenUsage" in record.snapshot) || !record.snapshot.tokenUsage) return undefined;
  const cumulative = record.snapshot.tokenUsage.cumulative;
  if (!reportedCount(cumulative.calls) || !reportedCount(cumulative.unreportedCalls)) return undefined;
  return { ...emptyConsumption(), totalTokens: cumulative.calls > 0 && reportedCount(cumulative.total) ? cumulative.total : null,
    calls: cumulative.calls + cumulative.unreportedCalls, unreportedCalls: cumulative.unreportedCalls };
}

export async function loadProjectRunTokenConsumption(input: {
  projectId: string; records: RunRecord[]; analyticsStore?: Partial<Pick<RunTelemetryStore, "listTelemetry">>;
}): Promise<Map<string, RunTokenConsumption>> {
  const records = input.records.filter(record => record.metadata?.projectId === input.projectId);
  const runIds = new Set(records.map(record => record.snapshot.runId));
  const result = new Map<string, RunTokenConsumption>();
  if (!runIds.size) return result;
  const entries = input.analyticsStore?.listTelemetry ? await input.analyticsStore.listTelemetry({
    // Run IDs and project are the database predicates; time cannot trim delayed/failure telemetry from a run.
    from: "1970-01-01T00:00:00.000Z", to: "9999-12-31T23:59:59.999Z", projectId: input.projectId, runIds: [...runIds],
  }).catch(() => []) : [];
  const byRun = new Map<string, LlmRequestTelemetry[]>();
  for (const entry of entries) {
    if (entry.projectId !== input.projectId || !runIds.has(entry.runId)) continue;
    const group = byRun.get(entry.runId) ?? [];
    group.push(entry); byRun.set(entry.runId, group);
  }
  for (const record of records) {
    const group = byRun.get(record.snapshot.runId);
    const consumption = group?.length ? aggregateRunTokenConsumption(group) : snapshotConsumption(record);
    if (consumption) result.set(record.snapshot.runId, consumption);
  }
  return result;
}
