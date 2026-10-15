// Provides the in-memory admin rate-limit policy store when no tracker persistence is available.
import { randomUUID } from "node:crypto";
import type {
  ProviderRateLimitPolicyRecord,
  ProviderUsageTracker,
} from "./provider-usage-tracker.js";

export function createFallbackRateLimitPolicyStore() {
  const policies: ProviderRateLimitPolicyRecord[] = [];
  return {
    async listRateLimitPolicies() {
      return policies.map((policy) => ({ ...policy }));
    },
    async createRateLimitPolicy(
      input: Omit<ProviderRateLimitPolicyRecord, "id" | "createdAt" | "updatedAt">,
    ) {
      const now = new Date().toISOString();
      const policy: ProviderRateLimitPolicyRecord = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...input,
      };
      policies.unshift(policy);
      return { ...policy };
    },
    async updateRateLimitPolicy(
      id: string,
      input: Partial<
        Omit<ProviderRateLimitPolicyRecord, "id" | "createdAt" | "updatedAt">
      >,
    ) {
      const policy = policies.find((item) => item.id === id);
      if (!policy) return null;
      Object.assign(policy, input, { updatedAt: new Date().toISOString() });
      return { ...policy };
    },
  };
}

export function createRateLimitPolicyStoreWithFallback(
  providerUsageTracker?: ProviderUsageTracker,
) {
  const fallbackStore = createFallbackRateLimitPolicyStore();
  return {
    listRateLimitPolicies:
      providerUsageTracker?.listRateLimitPolicies?.bind(providerUsageTracker) ??
      fallbackStore.listRateLimitPolicies,
    createRateLimitPolicy:
      providerUsageTracker?.createRateLimitPolicy?.bind(providerUsageTracker) ??
      fallbackStore.createRateLimitPolicy,
    updateRateLimitPolicy:
      providerUsageTracker?.updateRateLimitPolicy?.bind(providerUsageTracker) ??
      fallbackStore.updateRateLimitPolicy,
  };
}
