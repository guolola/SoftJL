// Verifies open Provider circuits recover through one bounded probe after cooldown.
import assert from "node:assert/strict";
import test from "node:test";
import { ProviderHttpError } from "../llm.js";
import { createProviderConfigStore } from "./provider-config-store.js";
import { resolveProviderCircuitAccess } from "./provider-circuit-recovery.js";

function openProviderCircuit() {
  const store = createProviderConfigStore({
    secret: "provider-circuit-test-secret",
    breakerFailureThreshold: 3,
  });
  const created = store.create({
    name: "Platform Provider",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-provider-circuit-test",
    defaultModel: "gpt-4.1",
    allowedModels: ["gpt-4.1"],
    createdBy: "admin-user",
  });
  store.recordFailure?.(created.id);
  store.recordFailure?.(created.id);
  const opened = store.recordFailure?.(created.id);
  assert.equal(opened?.breakerState, "open");
  return { store, provider: opened! };
}

test("open circuit returns retry metadata until cooldown elapses", async () => {
  const { store, provider } = openProviderCircuit();
  const openedAt = new Date(provider.breakerOpenedAt!);
  const result = await resolveProviderCircuitAccess({
    providerConfigs: store,
    providerConfig: provider,
    model: "gpt-4.1",
    now: new Date(openedAt.getTime() + 120_000),
    cooldownMs: 300_000,
    runHealthcheck: async () => assert.fail("probe must not run during cooldown"),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.statusCode, 503);
  assert.equal(result.error.code, "PROVIDER_CIRCUIT_OPEN");
  assert.equal(result.error.retryable, true);
  assert.equal(result.error.params?.failureCount, 3);
  assert.equal(result.error.params?.retryAfterSeconds, 180);
  assert.equal(
    (result.error.details?.breaker as { probeStatus?: string }).probeStatus,
    "cooldown",
  );
});

test("one recovery probe closes the circuit and returns usable settings", async () => {
  const { store, provider } = openProviderCircuit();
  const openedAt = new Date(provider.breakerOpenedAt!);
  let probeCount = 0;
  const result = await resolveProviderCircuitAccess({
    providerConfigs: store,
    providerConfig: provider,
    model: "gpt-4.1",
    now: new Date(openedAt.getTime() + 301_000),
    cooldownMs: 300_000,
    runHealthcheck: async () => {
      probeCount += 1;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(probeCount, 1);
  assert.equal((await store.get(provider.id))?.breakerState, "closed");
  assert.equal((await store.get(provider.id))?.breakerFailureCount, 0);
  if (!result.ok) return;
  assert.equal(result.recovered, true);
  assert.equal(result.providerSettings.model, "gpt-4.1");
});

test("probe lease rejects concurrent recovery and can be reclaimed after expiry", async () => {
  const { store, provider } = openProviderCircuit();
  const eligibleAt = new Date(new Date(provider.breakerOpenedAt!).getTime() + 301_000);
  const first = await store.tryAcquireBreakerProbe({
    id: provider.id,
    now: eligibleAt,
    cooldownMs: 300_000,
    leaseMs: 60_000,
  });
  const concurrent = await store.tryAcquireBreakerProbe({
    id: provider.id,
    now: eligibleAt,
    cooldownMs: 300_000,
    leaseMs: 60_000,
  });
  const reclaimed = await store.tryAcquireBreakerProbe({
    id: provider.id,
    now: new Date(eligibleAt.getTime() + 61_000),
    cooldownMs: 300_000,
    leaseMs: 60_000,
  });

  assert.equal(first.acquired, true);
  assert.equal(concurrent.acquired, false);
  if (!concurrent.acquired) {
    assert.equal(concurrent.status, "in_progress");
    assert.equal(concurrent.retryAfterSeconds, 60);
  }
  assert.equal(reclaimed.acquired, true);
  if (first.acquired && reclaimed.acquired) {
    assert.equal(
      await store.completeBreakerProbe(provider.id, "success", first.leaseStartedAt),
      null,
    );
    assert.equal((await store.get(provider.id))?.breakerState, "open");
    assert.equal(
      (await store.completeBreakerProbe(
        provider.id,
        "success",
        reclaimed.leaseStartedAt,
      ))?.breakerState,
      "closed",
    );
  }
});

test("failed recovery probe keeps the circuit open and refreshes diagnostics", async () => {
  const { store, provider } = openProviderCircuit();
  const openedAt = new Date(provider.breakerOpenedAt!);
  const result = await resolveProviderCircuitAccess({
    providerConfigs: store,
    providerConfig: provider,
    model: "gpt-4.1",
    now: new Date(openedAt.getTime() + 301_000),
    cooldownMs: 300_000,
    runHealthcheck: async () => {
      throw new ProviderHttpError({
        status: 502,
        detail: "upstream unavailable",
        message: "Provider HTTP 502",
      });
    },
  });

  assert.equal(result.ok, false);
  const updated = await store.get(provider.id);
  assert.equal(updated?.breakerState, "open");
  assert.equal(updated?.breakerFailureCount, 4);
  assert.ok(updated?.breakerOpenedAt);
  assert.ok(updated?.breakerLastFailureAt);
  if (result.ok) return;
  assert.equal(
    (result.error.details?.breaker as { probeStatus?: string }).probeStatus,
    "probe_failed",
  );
  assert.equal(
    (result.error.details?.probeFailure as { upstreamStatus?: number }).upstreamStatus,
    502,
  );
});
