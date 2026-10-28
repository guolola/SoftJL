import { roundTripRunRecordStore } from "../../../tests/fixtures/runs/run-record-round-trip.js";
// Covers real usage capture, unavailable reports, persisted reloads and per-run counter isolation.
import { strictTestModelCapability } from "../../../tests/fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { ModelCapacity, RunSnapshot } from "@uml-platform/contracts";
import { createScheduledLlmTransport, createInMemoryLlmScheduler } from "../../adapters/llm/llm-scheduler.js";
import { createEmptySnapshot } from "./snapshots.js";
import { createQueuedRunFromSource } from "./run-actions.js";
import { createRunRecordStore, type RunRecord } from "./run-record-store.js";
import { emptyRequirementTokenUsage, withRequirementTokenUsage } from "./requirement-token-usage.js";

const capacity: ModelCapacity = { context: 1000000, output: 8192, source: "models.dev", matchedId: "model", updatedAt: null };

test("engineering usage persists the latest actual frame once per scheduled call without adding cache tokens twice", async () => {
  const record: RunRecord = { snapshot: createEmptySnapshot("usage", "需求", [], [], { tokenUsage: emptyRequirementTokenUsage("model", capacity) }), events: [], listeners: new Set(), terminal: false };
  let persisted = 0; record.persist = () => { persisted++; };
  let call = 0;
  const transport = withRequirementTokenUsage(record, "model", createScheduledLlmTransport({
    scheduler: createInMemoryLlmScheduler(), context: { runId: "usage", model: "model", taskType: "requirements_to_uml" },
    transport: { async *streamChatCompletion(input) {
      call++;
      if (call === 1) {
        input.onTokenUsage?.({ inputTokens: 100, outputTokens: 10, cachedInputTokens: 20, reasoningTokens: 1, totalTokens: 110 });
        yield "first";
        input.onTokenUsage?.({ inputTokens: 120, outputTokens: 20, cachedInputTokens: 30, reasoningTokens: 2, totalTokens: 140 });
      } else yield "provider does not report usage";
    } },
  }));
  const input = { providerSettings: { modelCapability: strictTestModelCapability("model"), apiBaseUrl: "https://llm.test", apiKey: "test", model: "model" }, messages: [] };
  for await (const _ of transport.streamChatCompletion(input)) { /* Drain the provider response. */ }
  const snapshot = record.snapshot as RunSnapshot;
  assert.equal(snapshot.tokenUsage?.contextTokens, 140);
  assert.deepEqual(snapshot.tokenUsage?.lastCall, { input: 120, output: 20, cacheRead: 30, cacheWrite: null, total: 140 });
  assert.deepEqual(snapshot.tokenUsage?.cumulative, { total: 140, calls: 1, unreportedCalls: 0 });
  const store = createRunRecordStore(); store.set("usage", record);
  const restored = roundTripRunRecordStore(store).get("usage")!.snapshot as RunSnapshot;
  assert.deepEqual(restored.tokenUsage, snapshot.tokenUsage);
  for await (const _ of transport.streamChatCompletion(input)) { /* Missing usage must clear the current call. */ }
  assert.equal(snapshot.tokenUsage?.contextTokens, null);
  assert.equal(snapshot.tokenUsage?.lastCall, null);
  assert.deepEqual(snapshot.tokenUsage?.cumulative, { total: 140, calls: 1, unreportedCalls: 1 });
  assert.equal(persisted, 2);
  record.snapshot.status = "failed";
  createQueuedRunFromSource({ runs: store, source: record, action: "retry", sourceRunId: "usage", runId: "retry" });
  const retry = store.get("retry")!.snapshot as RunSnapshot;
  assert.equal(retry.tokenUsage?.contextBudget, 1000000);
  assert.deepEqual(retry.tokenUsage?.cumulative, { total: 0, calls: 0, unreportedCalls: 0 });
  assert.equal(retry.tokenUsage?.lastCall, null);
});
