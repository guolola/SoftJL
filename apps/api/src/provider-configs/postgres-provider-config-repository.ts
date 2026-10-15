// Persists provider configuration views and encrypted API keys in PostgreSQL.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { ProviderModelCapabilityMap } from "@uml-platform/contracts";
import type { Queryable } from "../db/transactions.js";
import {
  maskApiKey,
  normalizeProviderModelCapabilities,
  ProviderConfigSecretError,
  type ProviderAuditLog,
  type ProviderConfigStatus,
  type ProviderConfigView,
  type ProviderRiskState,
} from "./provider-config-store.js";
import { normalizeProviderAllowedModels } from "./default-provider-models.js";
import {
  inferOpenAiCompatibleProvider,
  normalizeManagedProviderBaseUrl,
  ProviderConfigPolicyError,
} from "./provider-url-policy.js";

type ProviderConfigRow = {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  allowlisted: boolean;
  masked_key: string;
  key_purpose: string;
  created_by: string;
  created_at: string | Date;
  updated_at: string | Date;
  last_used_at: string | Date | null;
  risk_state: ProviderRiskState;
  default_model: string;
  allowed_models: string[] | string | null;
  model_capabilities: ProviderModelCapabilityMap | string | null;
  quota: string;
  status: ProviderConfigStatus;
  scope_type?: "system" | "user" | "project";
  scope_id?: string | null;
  breaker_state: "closed" | "open";
  breaker_failure_count: string | number;
  breaker_opened_at: string | Date | null;
  breaker_last_failure_at: string | Date | null;
  breaker_probe_started_at: string | Date | null;
};

type SecretRow = {
  secret_ciphertext: string;
};

type AuditLogRow = {
  id: string;
  actor: string | null;
  action: string;
  target: string | null;
  ip: string | null;
  result: ProviderAuditLog["result"] | "failure";
  created_at: string | Date;
};

export type PostgresProviderConfigRepository = ReturnType<
  typeof createPostgresProviderConfigRepository
>;

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

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapProviderRow(row: ProviderConfigRow): ProviderConfigView {
  const persistedAllowedModels = Array.isArray(row.allowed_models)
    ? row.allowed_models
    : row.allowed_models
      ? JSON.parse(row.allowed_models)
      : null;
  const persistedModelCapabilities =
    typeof row.model_capabilities === "string"
      ? JSON.parse(row.model_capabilities)
      : row.model_capabilities;
  const allowedModels = normalizeProviderAllowedModels(
    row.default_model,
    persistedAllowedModels,
    { baseUrl: row.base_url, provider: row.provider },
  );
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseUrl: row.base_url,
    allowlisted: row.allowlisted,
    maskedKey: row.masked_key,
    keyPurpose: row.key_purpose,
    createdBy: row.created_by,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    lastUsedAt: row.last_used_at ? toIsoString(row.last_used_at) : null,
    riskState: row.risk_state,
    defaultModel: row.default_model,
    allowedModels,
    modelCapabilities: normalizeProviderModelCapabilities(
      allowedModels,
      persistedModelCapabilities,
    ),
    quota: row.quota,
    status: row.status,
    scopeType: row.scope_type ?? "system",
    scopeId: row.scope_id ?? null,
    breakerState: row.breaker_state,
    breakerFailureCount: Number(row.breaker_failure_count),
    breakerOpenedAt: row.breaker_opened_at ? toIsoString(row.breaker_opened_at) : null,
    breakerLastFailureAt: row.breaker_last_failure_at
      ? toIsoString(row.breaker_last_failure_at)
      : null,
  };
}

function mapAuditRow(row: AuditLogRow): ProviderAuditLog {
  return {
    id: row.id,
    actor: row.actor ?? "unknown",
    action: row.action,
    target: row.target ?? "",
    ip: row.ip ?? "unknown",
    result: row.result === "failure" ? "failed" : row.result,
    createdAt: toIsoString(row.created_at),
  };
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

const providerViewColumns = `
  id,
  name,
  provider,
  base_url,
  allowlisted,
  masked_key,
  key_purpose,
  created_by,
  created_at,
  updated_at,
  last_used_at,
  risk_state,
  default_model,
  allowed_models,
  model_capabilities,
  quota,
  status,
  scope_type,
  scope_id,
  breaker_state,
  breaker_failure_count,
  breaker_opened_at,
  breaker_last_failure_at,
  breaker_probe_started_at
`;

export function createPostgresProviderConfigRepository({
  db,
  secret,
}: {
  db: Queryable;
  secret?: string;
}) {
  const secretKey = createSecretKey(
    secret ??
      process.env.UML_PROVIDER_CONFIG_SECRET ??
      "local-provider-config-secret-for-development-only",
  );

  async function audit(input: {
    actor: string;
    action: string;
    targetId: string | null;
    target: string;
    result: "success" | "blocked" | "failed";
  }) {
    await db.query(
      `
        insert into audit_logs (
          id,
          actor_user_id,
          action,
          target_type,
          target_id,
          outcome,
          message,
          metadata
        )
        values ($1, $2, $3, 'provider_config', $4, $5, $6, $7)
      `,
      [
        randomUUID(),
        null,
        input.action,
        input.targetId,
        input.result === "failed" ? "failure" : input.result,
        input.target,
        { providerConfigTarget: input.target },
      ],
    );
  }

  return {
    async create(input: {
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
      scopeType?: "system" | "user" | "project";
      scopeId?: string | null;
    }) {
      const baseUrl = normalizeManagedProviderBaseUrl(input.baseUrl);
      const provider = inferOpenAiCompatibleProvider(baseUrl, input.provider);
      const apiKey = input.apiKey.trim();
      const id = randomUUID();
      const maskedKey = maskApiKey(apiKey);
      const defaultModel = input.defaultModel.trim();
      const allowedModels = requireAllowedModels(defaultModel, input.allowedModels, {
        baseUrl,
        provider,
      });
      const modelCapabilities = normalizeProviderModelCapabilities(
        allowedModels,
        input.modelCapabilities,
        { fillMissing: Boolean(input.modelCapabilities) },
      );
      const keyPurpose =
        input.keyPurpose?.trim() || "admin-configured provider key";
      const scopeType = input.scopeType ?? "system";
      const scopeId = scopeType === "system" ? null : input.scopeId?.trim() || null;
      if (scopeType !== "system" && !scopeId) {
        throw new ProviderConfigPolicyError(
          "Provider config user and project scopes require a scope id",
        );
      }
      const result = await db.query<ProviderConfigRow>(
        `
          insert into provider_configs (
            id,
            name,
            provider,
            base_url,
            default_model,
            allowed_models,
            model_capabilities,
            status,
            allowlisted,
            masked_key,
            key_purpose,
            created_by,
            risk_state,
            quota,
            scope_type,
            scope_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, 'active', true, $8, $9, $10, $11, $12, $13, $14)
          returning ${providerViewColumns}
        `,
        [
          id,
          input.name.trim(),
          provider,
          baseUrl,
          defaultModel,
          allowedModels,
          modelCapabilities,
          maskedKey,
          keyPurpose,
          input.createdBy,
          input.riskState ?? "medium",
          input.quota ?? "unlimited",
          scopeType,
          scopeId,
        ],
      );

      await db.query(
        `
          insert into provider_secrets (
            id,
            provider_config_id,
            secret_ciphertext,
            secret_hash,
            key_tail,
            status,
            created_by_user_id
          )
          values ($1, $2, $3, $4, $5, 'active', $6)
        `,
        [
          randomUUID(),
          id,
          encryptSecret(apiKey, secretKey),
          hashSecret(apiKey),
          apiKey.slice(-4),
          null,
        ],
      );
      await audit({
        actor: input.createdBy,
        action: "create_provider_config",
        targetId: id,
        target: input.name.trim(),
        result: "success",
      });

      return mapProviderRow(result.rows[0]);
    },

    async list() {
      const result = await db.query<ProviderConfigRow>(
        `
          select ${providerViewColumns}
          from provider_configs
          order by created_at desc
        `,
      );
      return result.rows.map(mapProviderRow);
    },

    async get(id: string) {
      const result = await db.query<ProviderConfigRow>(
        `
          select ${providerViewColumns}
          from provider_configs
          where id = $1
          limit 1
        `,
        [id],
      );
      return result.rows[0] ? mapProviderRow(result.rows[0]) : null;
    },

    async updateMetadata(id: string, input: {
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
      scopeType?: "system" | "user" | "project";
    }, actor: string) {
      const existing = await this.get(id);
      if (!existing || existing.status === "revoked") return null;
      const baseUrl = input.baseUrl
        ? normalizeManagedProviderBaseUrl(input.baseUrl)
        : existing.baseUrl;
      const provider = inferOpenAiCompatibleProvider(baseUrl, input.provider);
      const defaultModel = input.defaultModel?.trim() || existing.defaultModel;
      const allowedModels = requireAllowedModels(
        defaultModel,
        input.allowedModels ?? existing.allowedModels,
        { baseUrl, provider },
      );
      const modelCapabilities = normalizeProviderModelCapabilities(
        allowedModels,
        input.modelCapabilities ?? existing.modelCapabilities,
        { fillMissing: Boolean(input.modelCapabilities) },
      );
      const scopeType = input.scopeType ?? existing.scopeType;
      const scopeId = scopeType === "system" ? null : input.scopeId ?? existing.scopeId;
      if (scopeType !== "system" && !scopeId) {
        throw new ProviderConfigPolicyError(
          "Provider config user and project scopes require a scope id",
        );
      }
      const apiKey = input.apiKey?.trim();
      if (apiKey) {
        await db.query(
          `
            update provider_secrets
            set status = 'revoked', revoked_at = now()
            where provider_config_id = $1 and status = 'active'
          `,
          [id],
        );
        await db.query(
          `
            insert into provider_secrets (
              id,
              provider_config_id,
              secret_ciphertext,
              secret_hash,
              key_tail,
              status,
              created_by_user_id,
              rotated_at
            )
            values ($1, $2, $3, $4, $5, 'active', $6, now())
          `,
          [
            randomUUID(),
            id,
            encryptSecret(apiKey, secretKey),
            hashSecret(apiKey),
            apiKey.slice(-4),
            null,
          ],
        );
      }
      const result = await db.query<ProviderConfigRow>(
        `
          update provider_configs
          set
            name = $2,
            provider = $3,
            base_url = $4,
            default_model = $5,
            allowed_models = $6,
            model_capabilities = $7,
            key_purpose = $8,
            quota = $9,
            masked_key = $10,
            status = $11,
            breaker_state = case when $12 then 'closed' else breaker_state end,
            breaker_failure_count = case when $12 then 0 else breaker_failure_count end,
            breaker_opened_at = case when $12 then null else breaker_opened_at end,
            breaker_last_failure_at = case when $12 then null else breaker_last_failure_at end,
            breaker_probe_started_at = case when $12 then null else breaker_probe_started_at end,
            scope_type = $13,
            scope_id = $14,
            updated_at = now()
          where id = $1
          returning ${providerViewColumns}
        `,
        [
          id,
          input.name?.trim() || existing.name,
          provider,
          baseUrl,
          defaultModel,
          allowedModels,
          modelCapabilities,
          input.keyPurpose?.trim() || existing.keyPurpose,
          input.quota?.trim() || existing.quota,
          apiKey ? maskApiKey(apiKey) : existing.maskedKey,
          apiKey ? "active" : existing.status,
          Boolean(apiKey),
          scopeType,
          scopeId,
        ],
      );
      await audit({
        actor,
        action: "update_provider_config",
        targetId: id,
        target: input.name?.trim() || existing.name,
        result: "success",
      });
      return result.rows[0] ? mapProviderRow(result.rows[0]) : null;
    },

    async disable(id: string, actor: string) {
      const existing = await this.get(id);
      if (!existing || existing.status === "revoked") return null;
      const result = await db.query<ProviderConfigRow>(
        `
          update provider_configs
          set status = 'disabled', updated_at = now()
          where id = $1
          returning ${providerViewColumns}
        `,
        [id],
      );
      await audit({
        actor,
        action: "disable_provider_config",
        targetId: id,
        target: existing.name,
        result: "success",
      });
      return result.rows[0] ? mapProviderRow(result.rows[0]) : null;
    },

    async enable(id: string, actor: string) {
      const existing = await this.get(id);
      if (!existing || existing.status === "revoked") return null;
      const result = await db.query<ProviderConfigRow>(
        `
          update provider_configs
          set status = 'active', updated_at = now()
          where id = $1
          returning ${providerViewColumns}
        `,
        [id],
      );
      await audit({
        actor,
        action: "enable_provider_config",
        targetId: id,
        target: existing.name,
        result: "success",
      });
      return result.rows[0] ? mapProviderRow(result.rows[0]) : null;
    },

    async rotate(id: string, apiKey: string, actor: string) {
      const existing = await this.get(id);
      if (!existing) return null;
      const trimmedApiKey = apiKey.trim();
      await db.query(
        `
          update provider_secrets
          set status = 'revoked', revoked_at = now()
          where provider_config_id = $1 and status = 'active'
        `,
        [id],
      );
      await db.query(
        `
          insert into provider_secrets (
            id,
            provider_config_id,
            secret_ciphertext,
            secret_hash,
            key_tail,
            status,
            created_by_user_id,
            rotated_at
          )
          values ($1, $2, $3, $4, $5, 'active', $6, now())
        `,
        [
          randomUUID(),
          id,
          encryptSecret(trimmedApiKey, secretKey),
          hashSecret(trimmedApiKey),
          trimmedApiKey.slice(-4),
          null,
        ],
      );
      const result = await db.query<ProviderConfigRow>(
        `
          update provider_configs
          set
            masked_key = $2,
            status = 'active',
            updated_at = now()
          where id = $1
          returning ${providerViewColumns}
        `,
        [id, maskApiKey(trimmedApiKey)],
      );
      await audit({
        actor,
        action: "rotate_provider_key",
        targetId: id,
        target: existing.name,
        result: "success",
      });
      return result.rows[0] ? mapProviderRow(result.rows[0]) : null;
    },

    async revoke(id: string, actor: string) {
      const existing = await this.get(id);
      if (!existing) return null;
      await db.query(
        `
          update provider_secrets
          set status = 'revoked', revoked_at = now()
          where provider_config_id = $1 and status = 'active'
        `,
        [id],
      );
      const result = await db.query<ProviderConfigRow>(
        `
          update provider_configs
          set status = 'revoked', updated_at = now()
          where id = $1
          returning ${providerViewColumns}
        `,
        [id],
      );
      await audit({
        actor,
        action: "revoke_provider_key",
        targetId: id,
        target: existing.name,
        result: "success",
      });
      return result.rows[0] ? mapProviderRow(result.rows[0]) : null;
    },

    async getSecret(id: string) {
      const result = await db.query<SecretRow>(
        `
          select s.secret_ciphertext
          from provider_secrets s
          join provider_configs c on c.id = s.provider_config_id
          where s.provider_config_id = $1
            and s.status = 'active'
            and c.status = 'active'
            and c.breaker_state = 'closed'
          order by s.created_at desc
          limit 1
        `,
        [id],
      );
      return result.rows[0]
        ? decryptSecret(result.rows[0].secret_ciphertext, secretKey)
        : null;
    },

    async markUsed(id: string) {
      const result = await db.query<ProviderConfigRow>(
        `
          update provider_configs
          set last_used_at = now(), updated_at = now()
          where id = $1
          returning ${providerViewColumns}
        `,
        [id],
      );
      return result.rows[0] ? mapProviderRow(result.rows[0]) : null;
    },

    async recordFailure(id: string) {
      const result = await db.query<ProviderConfigRow>(
        `
          update provider_configs
          set
            breaker_failure_count = breaker_failure_count + 1,
            breaker_last_failure_at = now(),
            breaker_state = case
              when breaker_failure_count + 1 >= 3 then 'open'
              else breaker_state
            end,
            breaker_opened_at = case
              when breaker_failure_count + 1 >= 3 then coalesce(breaker_opened_at, now())
              else breaker_opened_at
            end,
            breaker_probe_started_at = null,
            updated_at = now()
          where id = $1
          returning ${providerViewColumns}
        `,
        [id],
      );
      return result.rows[0] ? mapProviderRow(result.rows[0]) : null;
    },

    async resetBreaker(id: string) {
      const result = await db.query<ProviderConfigRow>(
        `
          update provider_configs
          set
            breaker_state = 'closed',
            breaker_failure_count = 0,
            breaker_opened_at = null,
            breaker_last_failure_at = null,
            breaker_probe_started_at = null,
            updated_at = now()
          where id = $1
          returning ${providerViewColumns}
        `,
        [id],
      );
      return result.rows[0] ? mapProviderRow(result.rows[0]) : null;
    },

    async tryAcquireBreakerProbe({ id, now, cooldownMs, leaseMs }: {
      id: string;
      now: Date;
      cooldownMs: number;
      leaseMs: number;
    }) {
      const nowIso = now.toISOString();
      const acquired = await db.query<ProviderConfigRow>(
        `
          update provider_configs
          set breaker_probe_started_at = $2
          where id = $1
            and breaker_state = 'open'
            and coalesce(breaker_opened_at, breaker_last_failure_at, updated_at)
              <= $2::timestamptz - ($3 * interval '1 millisecond')
            and (
              breaker_probe_started_at is null
              or breaker_probe_started_at
                <= $2::timestamptz - ($4 * interval '1 millisecond')
            )
          returning ${providerViewColumns}
        `,
        [id, nowIso, cooldownMs, leaseMs],
      );
      if (acquired.rows[0]) {
        return {
          acquired: true as const,
          providerConfig: mapProviderRow(acquired.rows[0]),
          retryAfterSeconds: 0 as const,
          leaseStartedAt: new Date(
            acquired.rows[0].breaker_probe_started_at!,
          ).toISOString(),
        };
      }

      const current = await db.query<ProviderConfigRow>(
        `select ${providerViewColumns} from provider_configs where id = $1 limit 1`,
        [id],
      );
      const row = current.rows[0];
      if (!row || row.breaker_state !== "open") {
        return {
          acquired: false as const,
          providerConfig: row ? mapProviderRow(row) : null,
          retryAfterSeconds: 0,
          status: "cooldown" as const,
        };
      }
      const openedAt = row.breaker_opened_at ?? row.breaker_last_failure_at ?? row.updated_at;
      const cooldownRemainingMs = Math.max(
        0,
        new Date(openedAt).getTime() + cooldownMs - now.getTime(),
      );
      const probeStartedAt = row.breaker_probe_started_at;
      const leaseRemainingMs = probeStartedAt
        ? Math.max(0, new Date(probeStartedAt).getTime() + leaseMs - now.getTime())
        : 0;
      return {
        acquired: false as const,
        providerConfig: mapProviderRow(row),
        retryAfterSeconds: Math.max(
          1,
          Math.ceil(Math.max(cooldownRemainingMs, leaseRemainingMs) / 1_000),
        ),
        status: leaseRemainingMs > 0 ? "in_progress" as const : "cooldown" as const,
      };
    },

    async getSecretForBreakerProbe(id: string) {
      const result = await db.query<SecretRow>(
        `
          select s.secret_ciphertext
          from provider_secrets s
          join provider_configs c on c.id = s.provider_config_id
          where s.provider_config_id = $1
            and s.status = 'active'
            and c.status = 'active'
            and c.breaker_state = 'open'
            and c.breaker_probe_started_at is not null
          order by s.created_at desc
          limit 1
        `,
        [id],
      );
      return result.rows[0]
        ? decryptSecret(result.rows[0].secret_ciphertext, secretKey)
        : null;
    },

    async completeBreakerProbe(
      id: string,
      outcome: "success" | "failure",
      leaseStartedAt: string,
    ) {
      const result = await db.query<ProviderConfigRow>(
        outcome === "success"
          ? `
              update provider_configs
              set
                breaker_state = 'closed',
                breaker_failure_count = 0,
                breaker_opened_at = null,
                breaker_last_failure_at = null,
                breaker_probe_started_at = null,
                last_used_at = now(),
                updated_at = now()
              where id = $1 and breaker_probe_started_at = $2::timestamptz
              returning ${providerViewColumns}
            `
          : `
              update provider_configs
              set
                breaker_state = 'open',
                breaker_failure_count = breaker_failure_count + 1,
                breaker_opened_at = now(),
                breaker_last_failure_at = now(),
                breaker_probe_started_at = null,
                updated_at = now()
              where id = $1 and breaker_probe_started_at = $2::timestamptz
              returning ${providerViewColumns}
            `,
        [id, leaseStartedAt],
      );
      return result.rows[0] ? mapProviderRow(result.rows[0]) : null;
    },

    async recordAudit(input: {
      actor: string;
      action: string;
      target: string;
      result: ProviderAuditLog["result"];
    }) {
      await audit({
        actor: input.actor,
        action: input.action,
        targetId: null,
        target: input.target,
        result: input.result,
      });
    },

    async listAuditLogs() {
      const result = await db.query<AuditLogRow>(
        `
          select
            id,
            actor_user_id as actor,
            action,
            message as target,
            ip_address as ip,
            outcome as result,
            created_at
          from audit_logs
          where target_type = 'provider_config'
          order by created_at desc
        `,
      );
      return result.rows.map(mapAuditRow);
    },
  };
}
