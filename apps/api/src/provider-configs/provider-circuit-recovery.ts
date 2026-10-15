// Coordinates single-lease Provider circuit recovery probes without exposing stored secrets.
import type { ApiError, ProviderSettings } from "@uml-platform/contracts";
import { getHealthcheckResponseFormat } from "../adapters/llm/response-formats/index.js";
import { runOpenAiCompatibleChatCompletionHealthcheck } from "../llm.js";
import type {
  ProviderConfigStore,
  ProviderConfigView,
} from "./provider-config-store.js";
import { classifyProviderTestFailure } from "./provider-test-errors.js";

export const DEFAULT_PROVIDER_BREAKER_COOLDOWN_SECONDS = 300;
export const PROVIDER_BREAKER_PROBE_TIMEOUT_MS = 30_000;
export const PROVIDER_BREAKER_PROBE_LEASE_MS = 60_000;

type ProbeStatus = "cooldown" | "in_progress" | "probe_failed";

export type ProviderCircuitResolution =
  | {
      ok: true;
      providerSettings: ProviderSettings;
      recovered: boolean;
    }
  | {
      ok: false;
      statusCode: 400 | 503;
      error: ApiError;
    };

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function providerBreakerCooldownMs() {
  return positiveInteger(
    process.env.UML_PROVIDER_BREAKER_COOLDOWN_SECONDS,
    DEFAULT_PROVIDER_BREAKER_COOLDOWN_SECONDS,
  ) * 1_000;
}

function circuitError(
  providerConfig: ProviderConfigView,
  retryAfterSeconds: number,
  probeStatus: ProbeStatus,
  probeFailure?: {
    code: string;
    failureKind: string;
    upstreamStatus: number | null;
  },
): ApiError {
  return {
    code: "PROVIDER_CIRCUIT_OPEN",
    category: "provider",
    retryable: true,
    params: {
      failureCount: providerConfig.breakerFailureCount,
      retryAfterSeconds,
      openedAt: providerConfig.breakerOpenedAt,
      lastFailureAt: providerConfig.breakerLastFailureAt,
      probeStatus,
    },
    details: {
      breaker: {
        state: providerConfig.breakerState,
        failureCount: providerConfig.breakerFailureCount,
        openedAt: providerConfig.breakerOpenedAt,
        lastFailureAt: providerConfig.breakerLastFailureAt,
        retryAfterSeconds,
        probeStatus,
      },
      ...(probeFailure ? { probeFailure } : {}),
    },
  };
}

function invalidSecretError(): ApiError {
  return {
    code: "PROVIDER_SECRET_REVOKED",
    category: "provider",
    retryable: false,
  };
}

function resolvedSettings(
  providerConfig: ProviderConfigView,
  apiKey: string,
  model: string,
): ProviderSettings {
  const modelCapability = providerConfig.modelCapabilities[model];
  return {
    apiBaseUrl: providerConfig.baseUrl,
    apiKey,
    model,
    ...(modelCapability ? { modelCapability } : {}),
  };
}

export async function resolveProviderCircuitAccess({
  providerConfigs,
  providerConfig,
  model,
  now = new Date(),
  cooldownMs = providerBreakerCooldownMs(),
  probeTimeoutMs = PROVIDER_BREAKER_PROBE_TIMEOUT_MS,
  probeLeaseMs = PROVIDER_BREAKER_PROBE_LEASE_MS,
  runHealthcheck = runOpenAiCompatibleChatCompletionHealthcheck,
}: {
  providerConfigs: ProviderConfigStore;
  providerConfig: ProviderConfigView;
  model: string;
  now?: Date;
  cooldownMs?: number;
  probeTimeoutMs?: number;
  probeLeaseMs?: number;
  runHealthcheck?: typeof runOpenAiCompatibleChatCompletionHealthcheck;
}): Promise<ProviderCircuitResolution> {
  if (providerConfig.breakerState === "closed") {
    const apiKey = await providerConfigs.getSecret(providerConfig.id);
    return apiKey
      ? {
          ok: true,
          providerSettings: resolvedSettings(providerConfig, apiKey, model),
          recovered: false,
        }
      : { ok: false, statusCode: 400, error: invalidSecretError() };
  }

  const lease = await providerConfigs.tryAcquireBreakerProbe({
    id: providerConfig.id,
    now,
    cooldownMs,
    leaseMs: probeLeaseMs,
  });
  if (!lease.acquired) {
    return {
      ok: false,
      statusCode: 503,
      error: circuitError(
        lease.providerConfig ?? providerConfig,
        lease.retryAfterSeconds,
        lease.status,
      ),
    };
  }

  const apiKey = await providerConfigs.getSecretForBreakerProbe(providerConfig.id);
  if (!apiKey) {
    await providerConfigs.completeBreakerProbe(
      providerConfig.id,
      "failure",
      lease.leaseStartedAt,
    );
    return { ok: false, statusCode: 400, error: invalidSecretError() };
  }

  try {
    const modelCapability = providerConfig.modelCapabilities[model];
    await runHealthcheck({
      apiBaseUrl: providerConfig.baseUrl,
      apiKey,
      model,
      responseFormat: getHealthcheckResponseFormat(modelCapability ?? model),
      responseTimeoutMs: probeTimeoutMs,
    });
  } catch (error) {
    const failure = classifyProviderTestFailure(error);
    const updated =
      (await providerConfigs.completeBreakerProbe(
        providerConfig.id,
        "failure",
        lease.leaseStartedAt,
      )) ??
      providerConfig;
    return {
      ok: false,
      statusCode: 503,
      error: circuitError(updated, Math.ceil(cooldownMs / 1_000), "probe_failed", {
        code: failure.code,
        failureKind: failure.failureKind,
        upstreamStatus: failure.upstreamStatus,
      }),
    };
  }

  const recovered =
    (await providerConfigs.completeBreakerProbe(
      providerConfig.id,
      "success",
      lease.leaseStartedAt,
    )) ??
    providerConfig;
  return {
    ok: true,
    providerSettings: resolvedSettings(recovered, apiKey, model),
    recovered: true,
  };
}
