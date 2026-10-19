// Verifies whole-run accounting, partial reports, run isolation and durable current snapshot accounting.
import assert from "node:assert/strict";
import test from "node:test";
import { runTokenConsumptionSchema } from "@uml-platform/contracts";
import type { LlmRequestTelemetry } from "../../runs/records/run-telemetry-store.js";
import { createEmptySnapshot } from "./snapshots.js";
import type { RunRecord } from "./run-record-store.js";
import { emptyRequirementTokenUsage } from "./requirement-token-usage.js";
import { aggregateRunTokenConsumption, loadProjectRunTokenConsumption } from "./run-token-consumption.js";
import { createInMemoryRunTelemetryStore } from "./run-telemetry-store.js";

function entry(id: string, patch: Partial<LlmRequestTelemetry> = {}): LlmRequestTelemetry {
  return { id, runId: "run", projectId: "project", providerStartedAt: "2026-10-17T00:00:01.000Z",
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 30, reasoningTokens: 5 }, ...patch } as LlmRequestTelemetry;
}
function record(runId: string, projectId = "project"): RunRecord {
  return { snapshot: createEmptySnapshot(runId, "需求", []), events: [], listeners: new Set(), terminal: true,
    metadata: { projectId, createdAt: "2026-10-17T00:00:00.000Z" } };
}

test("community telemetry isolates project and selected runs before history aggregation", async () => {
  const store = createInMemoryRunTelemetryStore();
  for (const row of [entry("visible"), entry("other-project", { projectId: "private" }), entry("other-run", { runId: "other" })]) {
    await store.recordTelemetry({ ...row, queuedAt: "2026-10-17T00:00:00.000Z" });
  }
  const filters = { from: "2026-10-01", to: "2026-11-01", projectId: "project", runIds: ["run"] };
  assert.deepEqual((await store.listTelemetry(filters)).map(row => row.id), ["visible"]);
  assert.deepEqual(await store.listTelemetry({ ...filters, runIds: [] }), []);
  const usage = await loadProjectRunTokenConsumption({ projectId: "project", records: [record("run")], analyticsStore: store });
  assert.equal(usage.get("run")?.totalTokens, 120);
});

test("consumption includes every actual success, repair, failed and cancelled call without adding cached input twice", () => {
  const success = entry("success");
  const consumption = aggregateRunTokenConsumption([
    success, entry("repair", { stage: "render_svg", model: "other-model", providerConfigId: "other-provider" }),
    entry("failed", { outcome: "failed" }), entry("cancelled", { outcome: "cancelled" }), success,
    entry("queued-cancel", { providerStartedAt: null, outcome: "cancelled", usage: null }),
  ]);
  assert.deepEqual(runTokenConsumptionSchema.parse(consumption), {
    totalTokens: 480, inputTokens: 400, outputTokens: 80, cachedInputTokens: 120, reasoningTokens: 20, calls: 4, unreportedCalls: 0,
  });
});

test("partial usage sums known dimensions and missing usage remains null instead of becoming zero", () => {
  const consumption = aggregateRunTokenConsumption([
    entry("known"), entry("partial", { usage: { inputTokens: 40, outputTokens: null, totalTokens: null, cachedInputTokens: null, reasoningTokens: 3 } }),
    entry("missing", { usage: null }),
  ]);
  assert.deepEqual(consumption, { totalTokens: 120, inputTokens: 140, outputTokens: 20, cachedInputTokens: 30, reasoningTokens: 8, calls: 3, unreportedCalls: 2 });
  assert.deepEqual(aggregateRunTokenConsumption([entry("missing", { usage: null })]), {
    totalTokens: null, inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null, calls: 1, unreportedCalls: 1,
  });
  assert.equal(aggregateRunTokenConsumption([entry("zero", { usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: null, reasoningTokens: null } })]).totalTokens, 0);
});

test("history reads project and all requested runs in one query and falls back only to cumulative snapshot totals", async () => {
  const first = record("run"), second = record("second"), persisted = record("persisted");
  const usage = emptyRequirementTokenUsage("model");
  usage.lastCall = { input: 1, output: 1, total: 2, cacheRead: 1, cacheWrite: null };
  usage.cumulative = { total: 900, calls: 3, unreportedCalls: 1 };
  if ("requirementModelTraceability" in persisted.snapshot) persisted.snapshot.tokenUsage = usage;
  let reads = 0;
  const result = await loadProjectRunTokenConsumption({ projectId: "project", records: [first, second, persisted, record("foreign", "private")], analyticsStore: {
    async listTelemetry(filters) {
      reads++;
      assert.equal(filters.projectId, "project");
      assert.deepEqual(filters.runIds, ["run", "second", "persisted"]);
      return [entry("first"), entry("second", { runId: "second", usage: null }), entry("wrong-project", { projectId: "private" }), entry("wrong-run", { runId: "unrequested" })];
    },
  } });
  assert.equal(reads, 1);
  assert.equal(result.get("run")?.totalTokens, 120);
  assert.equal(result.get("second")?.totalTokens, null);
  assert.deepEqual(result.get("persisted"), { totalTokens: 900, inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null, calls: 4, unreportedCalls: 1 });
  assert.equal(result.has("foreign"), false);
  assert.equal(result.has("unrequested"), false);
});
