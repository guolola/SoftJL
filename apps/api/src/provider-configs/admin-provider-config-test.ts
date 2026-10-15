// Runs admin provider config health checks outside the admin HTTP route registration layer.
import { getModelCapability } from "../model-capabilities.js";
import { getHealthcheckResponseFormat } from "../adapters/llm/response-formats/index.js";
import { runOpenAiCompatibleChatCompletionHealthcheck } from "../llm.js";
import type { AdminActor } from "../security/admin-guard.js";
import type { ProviderConfigStore } from "./provider-config-store.js";
import {
  selectProviderRateLimitPolicy,
  type ProviderRateLimitPolicy,
  type ProviderRateLimitPolicyRecord,
  type ProviderUsageTracker,
} from "./provider-usage-tracker.js";
import {
  classifyProviderTestFailure,
  providerTestError,
  safeProviderHost,
  type ProviderTestFailureKind,
} from "./provider-test-errors.js";

export async function testAdminProviderConfigConnection({
  providerConfigs,
  providerUsageTracker,
  rateLimitPolicies,
  providerRateLimitPolicy,
  providerConfigId,
  actor,
  ipAddress,
  model,
  onFailureDiagnostic,
}: {
  providerConfigs: ProviderConfigStore;
  providerUsageTracker?: ProviderUsageTracker;
  rateLimitPolicies: ProviderRateLimitPolicyRecord[];
  providerRateLimitPolicy: ProviderRateLimitPolicy;
  providerConfigId: string;
  actor: AdminActor;
  ipAddress: string;
  model?: string;
  onFailureDiagnostic?: (diagnostic: {
    errorName: string;
    failureKind: ProviderTestFailureKind;
    providerConfigId: string;
    providerHost: string;
    upstreamStatus: number | null;
  }) => void;
}): Promise<{ statusCode: number; body: unknown }> {
  const providerConfig = await providerConfigs.get(providerConfigId);
  if (!providerConfig) {
    return {
      statusCode: 404,
      body: providerTestError({
        code: "PROVIDER_CONFIG_NOT_FOUND",
        category: "not_found",
      }),
    };
  }
  if (providerConfig.scopeType === "user") {
    return {
      statusCode: 403,
      body: providerTestError({
        code: "PROVIDER_CONFIG_ACCESS_DENIED",
        category: "authorization",
      }),
    };
  }
  if (!providerConfig.allowlisted) {
    return {
      statusCode: 400,
      body: providerTestError({
        code: "PROVIDER_BASE_URL_NOT_ALLOWED",
        category: "validation",
      }),
    };
  }
  if (providerConfig.status !== "active") {
    return {
      statusCode: 400,
      body: providerTestError({
        code: "PROVIDER_CONFIG_INACTIVE",
        category: "validation",
      }),
    };
  }
  if (providerConfig.breakerState === "open") {
    return {
      statusCode: 503,
      body: providerTestError({
        code: "PROVIDER_CIRCUIT_OPEN",
        params: { failureCount: providerConfig.breakerFailureCount },
        details: {
          breaker: {
            state: providerConfig.breakerState,
            failureCount: providerConfig.breakerFailureCount,
            openedAt: providerConfig.breakerOpenedAt,
            lastFailureAt: providerConfig.breakerLastFailureAt,
          },
        },
      }),
    };
  }
  const testModel = model ?? providerConfig.defaultModel;
  if (!providerConfig.allowedModels.includes(testModel)) {
    return {
      statusCode: 400,
      body: providerTestError({
        code: "PROVIDER_MODEL_NOT_ALLOWED",
        category: "validation",
      }),
    };
  }
  const apiKey = await providerConfigs.getSecret(providerConfigId);
  if (!apiKey) {
    return {
      statusCode: 400,
      body: providerTestError({
        code: "PROVIDER_SECRET_REVOKED",
        category: "validation",
      }),
    };
  }

  if (providerUsageTracker) {
    const policy = selectProviderRateLimitPolicy(
      {
        userId: actor.id,
        projectId: null,
        providerConfigId,
        taskType: "provider_test",
        ipAddress,
      },
      rateLimitPolicies,
      providerRateLimitPolicy,
    );
    const limitDecision = await providerUsageTracker.checkLimit({
      userId: actor.id,
      projectId: null,
      ipAddress,
      providerConfigId,
      taskType: "provider_test",
      limit: policy.limit,
      windowSeconds: policy.windowSeconds,
    });
    if (!limitDecision.allowed) {
      return {
        statusCode: 429,
        body: providerTestError({
          code: "PROVIDER_TEST_RATE_LIMITED",
          category: "rate_limit",
          retryable: true,
          details: { rateLimit: limitDecision },
        }),
      };
    }
  }

  const modelCapability = providerConfig.modelCapabilities[testModel];
  const capability = getModelCapability(modelCapability ?? testModel);
  try {
    await runOpenAiCompatibleChatCompletionHealthcheck({
      apiBaseUrl: providerConfig.baseUrl,
      apiKey,
      model: testModel,
      responseFormat: getHealthcheckResponseFormat(modelCapability ?? testModel),
    });
  } catch (error) {
    const breaker = await providerConfigs.recordFailure?.(providerConfigId);
    const failure = classifyProviderTestFailure(error);
    onFailureDiagnostic?.({
      errorName: error instanceof Error ? error.name : "UnknownProviderError",
      failureKind: failure.failureKind,
      providerConfigId,
      providerHost: safeProviderHost(providerConfig.baseUrl),
      upstreamStatus: failure.upstreamStatus,
    });
    return {
      statusCode: failure.httpStatus,
      body: providerTestError({
        code: failure.code,
        retryable: failure.retryable,
        params: breaker
          ? { failureCount: breaker.breakerFailureCount }
          : undefined,
        details: {
          capability,
          failureKind: failure.failureKind,
          upstreamStatus: failure.upstreamStatus,
          breaker: breaker
            ? {
                state: breaker.breakerState,
                failureCount: breaker.breakerFailureCount,
                openedAt: breaker.breakerOpenedAt,
                lastFailureAt: breaker.breakerLastFailureAt,
              }
            : undefined,
        },
      }),
    };
  }

  await providerConfigs.markUsed(providerConfigId);
  await providerConfigs.resetBreaker?.(providerConfigId);
  await providerUsageTracker?.recordUsage({
    userId: actor.id,
    projectId: null,
    ipAddress,
    providerConfigId,
    provider: providerConfig.provider,
    model: testModel,
    taskType: "provider_test",
    outcome: "success",
  });
  return {
    statusCode: 200,
    body: {
      ok: true,
      message: "Provider connection ok",
      capability,
    },
  };
}
