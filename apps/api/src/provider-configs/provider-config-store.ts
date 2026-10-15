// Owns secure model provider configuration storage and no-readback API key views.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  providerModelCapabilitySchema,
  type ProviderModelCapability,
  type ProviderModelCapabilityMap,
} from "@uml-platform/contracts";
import { normalizeProviderAllowedModels } from "./default-provider-models.js";
import {
  inferOpenAiCompatibleProvider,
  normalizeManagedProviderBaseUrl,
  ProviderConfigPolicyError,
} from "./provider-url-policy.js";

export { ProviderConfigPolicyError } from "./provider-url-policy.js";

export type ProviderConfigStatus = "active" | "disabled" | "revoked";
export type ProviderRiskState = "low" | "medium" | "high" | "critical";
export type ProviderBreakerState = "closed" | "open";
export type ProviderConfigScopeType = "system" | "user" | "project";

export interface ProviderBreakerView {
  state: ProviderBreakerState;
  failureCount: number;
  openedAt: string | null;
  lastFailureAt: string | null;
}

export type ProviderBreakerProbeStatus = "cooldown" | "in_progress";

export type ProviderBreakerProbeDecision =
  | {
      acquired: true;
      providerConfig: ProviderConfigView;
      retryAfterSeconds: 0;
      leaseStartedAt: string;
    }
  | {
      acquired: false;
      providerConfig: ProviderConfigView | null;
      retryAfterSeconds: number;
      status: ProviderBreakerProbeStatus;
    };

export interface ProviderConfigView {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  allowlisted: boolean;
  maskedKey: string;
  keyPurpose: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  riskState: ProviderRiskState;
  defaultModel: string;
  allowedModels: string[];
  modelCapabilities: ProviderModelCapabilityMap;
  quota: string;
  status: ProviderConfigStatus;
  scopeType: ProviderConfigScopeType;
  scopeId: string | null;
  breakerState: ProviderBreakerState;
  breakerFailureCount: number;
  breakerOpenedAt: string | null;
  breakerLastFailureAt: string | null;
}

export interface ProviderAuditLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  ip: string;
  result: "success" | "blocked" | "failed";
  createdAt: string;
}

interface StoredProviderConfig {
  view: ProviderConfigView;
  apiKeyCiphertext: string;
  apiKeyHash: string;
  breakerProbeStartedAt: string | null;
}

export interface ProviderConfigStore {
  create(input: {
    name: string;
    provider?: string;
    baseUrl: string;
    apiKey: string;
    defaultModel: string;
    allowedModels: string[];
    modelCapabilities?: ProviderModelCapabilityMap;
    keyPurpose?: string;
    createdBy: string;
    quota?: string;
    riskState?: ProviderRiskState;
    scopeType?: ProviderConfigScopeType;
    scopeId?: string | null;
  }): ProviderConfigView;
  list(): ProviderConfigView[];
  get(id: string): ProviderConfigView | null;
  updateMetadata?(id: string, input: {
    allowedModels?: string[];
    apiKey?: string;
    baseUrl?: string;
    modelCapabilities?: ProviderModelCapabilityMap;
    defaultModel?: string;
    keyPurpose?: string;
    name?: string;
    provider?: string;
    quota?: string;
    scopeId?: string | null;
    scopeType?: ProviderConfigScopeType;
  }, actor: string): ProviderConfigView | null;
  rotate(id: string, apiKey: string, actor: string): ProviderConfigView | null;
  disable?(id: string, actor: string): ProviderConfigView | null;
  enable?(id: string, actor: string): ProviderConfigView | null;
  revoke(id: string, actor: string): ProviderConfigView | null;
  getSecret(id: string): string | null;
  markUsed(id: string): ProviderConfigView | null;
  recordFailure?(id: string): ProviderConfigView | null;
  resetBreaker?(id: string): ProviderConfigView | null;
  tryAcquireBreakerProbe(input: {
    id: string;
    now: Date;
    cooldownMs: number;
    leaseMs: number;
  }): ProviderBreakerProbeDecision | Promise<ProviderBreakerProbeDecision>;
  getSecretForBreakerProbe(id: string): string | null | Promise<string | null>;
  completeBreakerProbe(
    id: string,
    outcome: "success" | "failure",
    leaseStartedAt: string,
  ): ProviderConfigView | null | Promise<ProviderConfigView | null>;
  recordAudit?(input: {
    actor: string;
    action: string;
    target: string;
    result: ProviderAuditLog["result"];
  }): void | Promise<void>;
  listAuditLogs(): ProviderAuditLog[];
}

export class ProviderConfigSecretError extends Error {}

export function createUnverifiedModelCapability(
  modelId: string,
  probedAt = new Date().toISOString(),
): ProviderModelCapability {
  return {
    id: modelId,
    category: "text_chat",
    structuredOutputMode: "compatible",
    supportsJsonSchema: false,
    supportsJsonObject: false,
    strictJson: "unknown",
    modeLabel: "兼容模式",
    warning: "该模型能力未验证，将使用普通输出和服务端校验修复。",
    probeStatus: "unknown",
    probeReason: "model was added manually or has no saved probe result",
    probedAt,
  };
}

export function normalizeProviderModelCapabilities(
  allowedModels: string[],
  capabilities?: ProviderModelCapabilityMap | null,
  { fillMissing = false }: { fillMissing?: boolean } = {},
): ProviderModelCapabilityMap {
  const byId = new Map<string, ProviderModelCapability>();
  Object.values(capabilities ?? {}).forEach((capability) => {
    const parsed = providerModelCapabilitySchema.safeParse(capability);
    if (parsed.success) byId.set(parsed.data.id, parsed.data);
  });

  const normalized: ProviderModelCapabilityMap = {};
  allowedModels.forEach((model) => {
    const capability = byId.get(model);
    if (capability) {
      normalized[model] = capability;
      return;
    }
    if (fillMissing) {
      normalized[model] = createUnverifiedModelCapability(model);
    }
  });
  return normalized;
}

function createSecretKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function encryptSecret(apiKey: string, secretKey: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString(
    "base64",
  )}`;
}

function decryptSecret(payload: string, secretKey: Buffer) {
  const [ivBase64, tagBase64, ciphertextBase64] = payload.split(".");
  if (!ivBase64 || !tagBase64 || !ciphertextBase64) {
    throw new ProviderConfigSecretError("Provider secret payload is invalid");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretKey,
    Buffer.from(ivBase64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function hashSecret(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function maskApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  const lastFour = trimmed.slice(-4);
  const prefixMatch = /^[A-Za-z0-9]+-/.exec(trimmed);
  const prefix = prefixMatch?.[0] ?? "";
  return `${prefix}...${lastFour}`;
}

export function createProviderConfigStore({
  secret,
  breakerFailureThreshold = 3,
}: {
  secret?: string;
  breakerFailureThreshold?: number;
} = {}): ProviderConfigStore {
  const secretKey = createSecretKey(
    secret ??
      process.env.UML_PROVIDER_CONFIG_SECRET ??
      "local-provider-config-secret-for-development-only",
  );
  const records = new Map<string, StoredProviderConfig>();
  const auditLogs: ProviderAuditLog[] = [];

  function audit(input: {
    actor: string;
    action: string;
    target: string;
    result: ProviderAuditLog["result"];
  }) {
    auditLogs.unshift({
      id: randomUUID(),
      actor: input.actor,
      action: input.action,
      target: input.target,
      ip: "unknown",
      result: input.result,
      createdAt: new Date().toISOString(),
    });
  }

  function cloneView(view: ProviderConfigView): ProviderConfigView {
    return {
      ...view,
      allowedModels: [...view.allowedModels],
      modelCapabilities: Object.fromEntries(
        Object.entries(view.modelCapabilities).map(([model, capability]) => [
          model,
          { ...capability },
        ]),
      ),
    };
  }

  function normalizeScope(input: {
    scopeType?: ProviderConfigScopeType;
    scopeId?: string | null;
  }) {
    const scopeType = input.scopeType ?? "system";
    const scopeId = input.scopeId?.trim() || null;
    if (scopeType === "system") return { scopeType, scopeId: null };
    if (!scopeId) {
      throw new ProviderConfigPolicyError(
        "Provider config user and project scopes require a scope id",
      );
    }
    return { scopeType, scopeId };
  }

  function closeBreaker(view: ProviderConfigView) {
    view.breakerState = "closed";
    view.breakerFailureCount = 0;
    view.breakerOpenedAt = null;
    view.breakerLastFailureAt = null;
  }

  function millisecondsUntil(timestamp: string | null, durationMs: number, now: Date) {
    const startedAt = timestamp ? Date.parse(timestamp) : now.getTime();
    return Math.max(0, startedAt + durationMs - now.getTime());
  }

  function requireAllowedModels(
    defaultModel: string,
    allowedModels: string[] | undefined,
    context: { baseUrl: string; provider: string },
  ) {
    const normalized = normalizeProviderAllowedModels(defaultModel, allowedModels, context);
    if (normalized.length === 0) {
      throw new ProviderConfigPolicyError(
        "Provider config requires at least one allowed model",
      );
    }
    if (!normalized.includes(defaultModel)) {
      throw new ProviderConfigPolicyError(
        "Provider default model must be included in allowed models",
      );
    }
    return normalized;
  }

  return {
    create(input) {
      const baseUrl = normalizeManagedProviderBaseUrl(input.baseUrl);
      const provider = inferOpenAiCompatibleProvider(baseUrl, input.provider);
      const scope = normalizeScope(input);
      const now = new Date().toISOString();
      const id = randomUUID();
      const defaultModel = input.defaultModel.trim();
      const allowedModels = requireAllowedModels(
        defaultModel,
        input.allowedModels,
        { baseUrl, provider },
      );
      const view: ProviderConfigView = {
        id,
        name: input.name.trim(),
        provider,
        baseUrl,
        allowlisted: true,
        maskedKey: maskApiKey(input.apiKey),
        keyPurpose: input.keyPurpose?.trim() || "admin-configured provider key",
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: null,
        riskState: input.riskState ?? "medium",
        defaultModel,
        allowedModels,
        modelCapabilities: normalizeProviderModelCapabilities(
          allowedModels,
          input.modelCapabilities,
          { fillMissing: Boolean(input.modelCapabilities) },
        ),
        quota: input.quota ?? "unlimited",
        status: "active",
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        breakerState: "closed",
        breakerFailureCount: 0,
        breakerOpenedAt: null,
        breakerLastFailureAt: null,
      };
      records.set(id, {
        view,
        apiKeyCiphertext: encryptSecret(input.apiKey.trim(), secretKey),
        apiKeyHash: hashSecret(input.apiKey.trim()),
        breakerProbeStartedAt: null,
      });
      audit({
        actor: input.createdBy,
        action: "create_provider_config",
        target: view.name,
        result: "success",
      });
      return cloneView(view);
    },
    list() {
      return Array.from(records.values(), (record) => cloneView(record.view));
    },
    get(id) {
      const record = records.get(id);
      return record ? cloneView(record.view) : null;
    },
    updateMetadata(id, input, actor) {
      const record = records.get(id);
      if (!record || record.view.status === "revoked") return null;
      const baseUrl = input.baseUrl
        ? normalizeManagedProviderBaseUrl(input.baseUrl)
        : record.view.baseUrl;
      const provider = inferOpenAiCompatibleProvider(baseUrl, input.provider);
      const nextDefaultModel = input.defaultModel?.trim() || record.view.defaultModel;
      const nextAllowedModels = requireAllowedModels(
        nextDefaultModel,
        input.allowedModels ?? record.view.allowedModels,
        { baseUrl, provider },
      );
      const nextScopeType = input.scopeType ?? record.view.scopeType;
      const scope = normalizeScope({
        scopeType: nextScopeType,
        scopeId: nextScopeType === "system" ? null : input.scopeId ?? record.view.scopeId,
      });
      if (input.apiKey?.trim()) {
        const apiKey = input.apiKey.trim();
        record.apiKeyCiphertext = encryptSecret(apiKey, secretKey);
        record.apiKeyHash = hashSecret(apiKey);
        record.view.maskedKey = maskApiKey(apiKey);
        record.view.status = "active";
        closeBreaker(record.view);
        record.breakerProbeStartedAt = null;
      }
      record.view.name = input.name?.trim() || record.view.name;
      record.view.provider = provider;
      record.view.baseUrl = baseUrl;
      record.view.keyPurpose = input.keyPurpose?.trim() || record.view.keyPurpose;
      record.view.defaultModel = nextDefaultModel;
      record.view.allowedModels = nextAllowedModels;
      record.view.modelCapabilities = normalizeProviderModelCapabilities(
        nextAllowedModels,
        input.modelCapabilities ?? record.view.modelCapabilities,
        { fillMissing: Boolean(input.modelCapabilities) },
      );
      record.view.quota = input.quota?.trim() || record.view.quota;
      record.view.scopeType = scope.scopeType;
      record.view.scopeId = scope.scopeId;
      record.view.updatedAt = new Date().toISOString();
      audit({
        actor,
        action: "update_provider_config",
        target: record.view.name,
        result: "success",
      });
      return cloneView(record.view);
    },
    rotate(id, apiKey, actor) {
      const record = records.get(id);
      if (!record) return null;
      record.apiKeyCiphertext = encryptSecret(apiKey.trim(), secretKey);
      record.apiKeyHash = hashSecret(apiKey.trim());
      record.view.maskedKey = maskApiKey(apiKey);
      record.view.status = "active";
      record.view.updatedAt = new Date().toISOString();
      closeBreaker(record.view);
      record.breakerProbeStartedAt = null;
      audit({
        actor,
        action: "rotate_provider_key",
        target: record.view.name,
        result: "success",
      });
      return cloneView(record.view);
    },
    disable(id, actor) {
      const record = records.get(id);
      if (!record || record.view.status === "revoked") return null;
      record.view.status = "disabled";
      record.view.updatedAt = new Date().toISOString();
      audit({
        actor,
        action: "disable_provider_config",
        target: record.view.name,
        result: "success",
      });
      return cloneView(record.view);
    },
    enable(id, actor) {
      const record = records.get(id);
      if (!record || record.view.status === "revoked") return null;
      record.view.status = "active";
      record.view.updatedAt = new Date().toISOString();
      audit({
        actor,
        action: "enable_provider_config",
        target: record.view.name,
        result: "success",
      });
      return cloneView(record.view);
    },
    revoke(id, actor) {
      const record = records.get(id);
      if (!record) return null;
      record.view.status = "revoked";
      record.view.updatedAt = new Date().toISOString();
      audit({
        actor,
        action: "revoke_provider_key",
        target: record.view.name,
        result: "success",
      });
      return cloneView(record.view);
    },
    getSecret(id) {
      const record = records.get(id);
      if (!record || record.view.status !== "active") return null;
      return decryptSecret(record.apiKeyCiphertext, secretKey);
    },
    markUsed(id) {
      const record = records.get(id);
      if (!record) return null;
      record.view.lastUsedAt = new Date().toISOString();
      record.view.updatedAt = record.view.lastUsedAt;
      return cloneView(record.view);
    },
    recordFailure(id) {
      const record = records.get(id);
      if (!record) return null;
      const now = new Date().toISOString();
      record.view.breakerFailureCount += 1;
      record.view.breakerLastFailureAt = now;
      if (record.view.breakerFailureCount >= breakerFailureThreshold) {
        record.view.breakerState = "open";
        record.view.breakerOpenedAt = record.view.breakerOpenedAt ?? now;
        record.breakerProbeStartedAt = null;
      }
      record.view.updatedAt = now;
      return cloneView(record.view);
    },
    resetBreaker(id) {
      const record = records.get(id);
      if (!record) return null;
      closeBreaker(record.view);
      record.breakerProbeStartedAt = null;
      record.view.updatedAt = new Date().toISOString();
      return cloneView(record.view);
    },
    tryAcquireBreakerProbe({ id, now, cooldownMs, leaseMs }) {
      const record = records.get(id);
      if (!record || record.view.breakerState !== "open") {
        return {
          acquired: false,
          providerConfig: record ? cloneView(record.view) : null,
          retryAfterSeconds: 0,
          status: "cooldown",
        };
      }

      const cooldownRemainingMs = millisecondsUntil(
        record.view.breakerOpenedAt ?? record.view.breakerLastFailureAt,
        cooldownMs,
        now,
      );
      const leaseRemainingMs = record.breakerProbeStartedAt
        ? millisecondsUntil(record.breakerProbeStartedAt, leaseMs, now)
        : 0;
      if (cooldownRemainingMs > 0 || leaseRemainingMs > 0) {
        return {
          acquired: false,
          providerConfig: cloneView(record.view),
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(Math.max(cooldownRemainingMs, leaseRemainingMs) / 1_000),
          ),
          status: leaseRemainingMs > 0 ? "in_progress" : "cooldown",
        };
      }

      record.breakerProbeStartedAt = now.toISOString();
      return {
        acquired: true,
        providerConfig: cloneView(record.view),
        retryAfterSeconds: 0,
        leaseStartedAt: record.breakerProbeStartedAt,
      };
    },
    getSecretForBreakerProbe(id) {
      const record = records.get(id);
      if (!record || record.view.status !== "active" || !record.breakerProbeStartedAt) {
        return null;
      }
      return decryptSecret(record.apiKeyCiphertext, secretKey);
    },
    completeBreakerProbe(id, outcome, leaseStartedAt) {
      const record = records.get(id);
      if (!record || record.breakerProbeStartedAt !== leaseStartedAt) return null;
      const now = new Date().toISOString();
      record.breakerProbeStartedAt = null;
      if (outcome === "success") {
        closeBreaker(record.view);
        record.view.lastUsedAt = now;
      } else {
        record.view.breakerState = "open";
        record.view.breakerFailureCount += 1;
        record.view.breakerOpenedAt = now;
        record.view.breakerLastFailureAt = now;
      }
      record.view.updatedAt = now;
      return cloneView(record.view);
    },
    recordAudit(input) {
      audit(input);
    },
    listAuditLogs() {
      return auditLogs.map((log) => ({ ...log }));
    },
  };
}
