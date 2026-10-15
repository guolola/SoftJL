// Centralizes run provider config resolution, rate-limit gates, and usage accounting.
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  apiErrorResponseSchema,
  type ApiError,
  type ProviderSettings,
  type ProviderSettingsInput,
} from "@uml-platform/contracts";
import type { GenerationUsageService } from "../../generation/generation-usage.js";
import { resolveProviderCircuitAccess } from "../../provider-configs/provider-circuit-recovery.js";
import type {
  ProviderConfigStore,
  ProviderConfigView,
} from "../../provider-configs/provider-config-store.js";
import type {
  ProviderRateLimitPolicy,
  ProviderTaskType,
  ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import type { RunRecord, RunRecordMetadata } from "../records/run-record-store.js";

type RunAccessResolver = {
  resolveRunAccess(request: FastifyRequest): Promise<{
    userId?: string;
    email?: string | null;
  }>;
};

function stringHeader(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function organizationIdFromRequest(request: FastifyRequest) {
  return stringHeader(request, "x-uml-organization-id") ?? null;
}

function ipAddressFromRequest(request: FastifyRequest) {
  return stringHeader(request, "x-forwarded-for")?.split(",")[0]?.trim() ??
    request.ip ??
    null;
}

function isManagedProviderSettings(
  providerSettings: ProviderSettingsInput | undefined,
): providerSettings is Extract<ProviderSettingsInput, { providerConfigId: string }> {
  return Boolean(providerSettings && "providerConfigId" in providerSettings);
}

function canRunWithProviderConfig(
  providerConfig: ProviderConfigView,
  metadata: RunRecordMetadata | undefined,
) {
  if (providerConfig.scopeType === "system") return true;
  if (providerConfig.scopeType === "user") {
    return Boolean(metadata?.userId && providerConfig.scopeId === metadata.userId);
  }
  if (providerConfig.scopeType === "project") {
    return Boolean(
      metadata?.projectId && providerConfig.scopeId === metadata.projectId,
    );
  }
  return false;
}

export async function resolveProviderSettingsForRun({
  providerSettings,
  metadata,
  providerConfigs,
}: {
  providerSettings: ProviderSettingsInput | undefined;
  metadata: RunRecordMetadata | undefined;
  providerConfigs?: ProviderConfigStore;
  request?: FastifyRequest;
  reply?: FastifyReply;
}): Promise<
  | { ok: true; providerSettings: ProviderSettings }
  | { ok: false; statusCode: number; error: ApiError }
> {
  const isProjectRun = Boolean(metadata?.projectId);
  const failure = (
    statusCode: number,
    code: string,
    category: ApiError["category"] = "provider",
    retryable = false,
  ) => ({
    ok: false as const,
    statusCode,
    error: { code, category, retryable },
  });

  if (!providerSettings) {
    return failure(400, "PROVIDER_CONFIG_INVALID");
  }

  if (isManagedProviderSettings(providerSettings)) {
    // Demo placeholders are only meaningful in the server-authorized offline branch.
    if (providerSettings.providerConfigId === "offline-demo" ||
      providerSettings.model === "offline-demo-fixed-artifacts") {
      return failure(400, "PROVIDER_CONFIG_INVALID");
    }
    if (!isProjectRun) {
      return failure(401, "AUTHENTICATION_REQUIRED", "authentication");
    }
    if (!providerConfigs) {
      return failure(500, "INTERNAL_ERROR", "internal", true);
    }
    const providerConfig = await providerConfigs.get(providerSettings.providerConfigId);
    if (!providerConfig || !canRunWithProviderConfig(providerConfig, metadata)) {
      return failure(400, "PROVIDER_CONFIG_INVALID");
    }
    if (!providerConfig.allowlisted) {
      return failure(400, "PROVIDER_BASE_URL_NOT_ALLOWED", "validation");
    }
    if (providerConfig.status !== "active") {
      return failure(400, "PROVIDER_CONFIG_INACTIVE");
    }
    if (!providerConfig.allowedModels.includes(providerSettings.model)) {
      return failure(400, "PROVIDER_MODEL_NOT_ALLOWED", "validation");
    }
    const circuit = await resolveProviderCircuitAccess({
      providerConfigs,
      providerConfig,
      model: providerSettings.model,
    });
    return circuit.ok
      ? { ok: true, providerSettings: circuit.providerSettings }
      : circuit;
  }

  return failure(400, "PROVIDER_CONFIG_INVALID");
}

export function providerResolutionFailureResponse(
  reply: FastifyReply,
  resolution: { ok: false; statusCode: number; error: ApiError },
) {
  reply.code(resolution.statusCode);
  return apiErrorResponseSchema.parse({ error: resolution.error });
}

function providerConfigIdFromSettings(providerSettings: ProviderSettingsInput | undefined) {
  return isManagedProviderSettings(providerSettings)
    ? providerSettings.providerConfigId
    : null;
}

export async function resolveProviderConfigIdForRun({
  providerSettings,
}: {
  providerSettings: ProviderSettingsInput | undefined;
}) {
  return providerConfigIdFromSettings(providerSettings);
}

export function snapshotProviderSettings(record: RunRecord) {
  const settings = (record.snapshot as { providerSettings?: unknown }).providerSettings;
  return settings && typeof settings === "object"
    ? (settings as ProviderSettingsInput)
    : undefined;
}

export function rememberProviderSettings(
  record: RunRecord,
  providerSettings: ProviderSettingsInput | undefined,
  resolved?: { providerConfigId: string | null; model: string },
) {
  const settingsToRemember =
    providerSettings ??
    (resolved?.providerConfigId
      ? {
          providerConfigId: resolved.providerConfigId,
          model: resolved.model,
        }
      : undefined);
  if (!settingsToRemember) return;
  (record.snapshot as { providerSettings?: ProviderSettingsInput }).providerSettings =
    settingsToRemember;
}

export function isActiveRun(record: RunRecord) {
  return (
    !record.terminal &&
    (record.snapshot.status === "queued" || record.snapshot.status === "running")
  );
}

export function taskTypeForRun(record: RunRecord): ProviderTaskType {
  const snapshot = record.snapshot;
  if ("selectedArtifacts" in snapshot) return "feasibility_analysis";
  if ("documentKind" in snapshot) return "document_generation";
  
  if ("designModelTraceability" in snapshot) return "design_modeling";
  return "requirements_to_uml";
}

export async function recordProviderUsage({
  usageTracker,
  providerConfigId,
  metadata,
  request,
  taskType,
}: {
  usageTracker?: ProviderUsageTracker;
  providerConfigId: string | null;
  metadata?: RunRecordMetadata;
  request: FastifyRequest;
  taskType: ProviderTaskType;
}) {
  if (!usageTracker || !providerConfigId) return;
  await usageTracker.recordUsage({
    userId: metadata?.userId ?? null,
    projectId: metadata?.projectId ?? null,
    organizationId: organizationIdFromRequest(request),
    ipAddress: ipAddressFromRequest(request),
    providerConfigId,
    taskType,
    outcome: "success",
  });
}

export async function checkProviderUsageLimit({
  usageTracker,
  providerConfigId,
  metadata,
  request,
  taskType,
  policy,
  reply,
}: {
  usageTracker?: ProviderUsageTracker;
  providerConfigId: string | null;
  metadata?: RunRecordMetadata;
  request: FastifyRequest;
  taskType: ProviderTaskType;
  policy: ProviderRateLimitPolicy;
  reply: FastifyReply;
}) {
  if (!usageTracker || !providerConfigId) return true;

  const decision = await usageTracker.checkLimit({
    userId: metadata?.userId ?? null,
    projectId: metadata?.projectId ?? null,
    organizationId: organizationIdFromRequest(request),
    ipAddress: ipAddressFromRequest(request),
    providerConfigId,
    taskType,
    limit: policy.limit,
    windowSeconds: policy.windowSeconds,
  });
  if (decision.allowed) return true;

  reply.code(429);
  return {
    message: "Provider rate limit exceeded",
    rateLimit: decision,
  };
}

export async function checkGenerationUsageLimit({
  generationUsage,
  runAccessGuard,
  request,
  reply,
}: {
  generationUsage?: GenerationUsageService;
  runAccessGuard: RunAccessResolver;
  request: FastifyRequest;
  reply: FastifyReply;
}) {
  if (!generationUsage) return true;
  const access = await runAccessGuard.resolveRunAccess(request);
  if (!access.userId) return true;
  const decision = await generationUsage.checkGenerationLimit({
    userId: access.userId,
    email: access.email,
    ipAddress: ipAddressFromRequest(request),
  });
  if (decision.allowed) return true;

  reply.code(429);
  return {
    message: "Guest generation limit exceeded",
    generationUsage: decision.usage,
  };
}

export async function recordGenerationUsage({
  generationUsage,
  runAccessGuard,
  request,
  taskType,
  providerConfigId,
}: {
  generationUsage?: GenerationUsageService;
  runAccessGuard: RunAccessResolver;
  request: FastifyRequest;
  taskType: ProviderTaskType;
  providerConfigId: string | null;
}) {
  if (!generationUsage) return;
  const access = await runAccessGuard.resolveRunAccess(request);
  if (!access.userId) return;
  await generationUsage.recordGenerationUsage({
    userId: access.userId,
    email: access.email,
    ipAddress: ipAddressFromRequest(request),
    taskType,
    providerConfigId,
  });
}
