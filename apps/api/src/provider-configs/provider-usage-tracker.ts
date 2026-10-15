// Records provider usage dimensions and exposes a minimal limit check for future quota policies.
import { randomUUID } from "node:crypto";
import type { Queryable } from "../db/transactions.js";

export type ProviderTaskType =
  | "requirements_to_uml"
  | "design_modeling"
  | "code_generation"
  | "document_generation"
  | "provider_test"
  | (string & {});

export interface ProviderUsageInput {
  userId: string | null;
  projectId: string | null;
  organizationId?: string | null;
  ipAddress?: string | null;
  providerConfigId: string;
  provider?: string | null;
  model?: string | null;
  courseId?: string | null;
  classId?: string | null;
  taskType: ProviderTaskType;
  units?: number;
  outcome?: "success" | "failed" | "blocked";
  tokenUsage?: ProviderTokenUsage | null;
}

export interface ProviderLimitCheckInput {
  userId: string | null;
  projectId: string | null;
  organizationId?: string | null;
  ipAddress?: string | null;
  providerConfigId: string;
  taskType: ProviderTaskType;
  limit: number;
  windowSeconds: number;
}

export interface ProviderLimitDecision {
  allowed: boolean;
  usedUnits: number;
  remainingUnits: number;
  limit: number;
  windowSeconds: number;
}

export interface ProviderRateLimitPolicy {
  limit: number;
  windowSeconds: number;
  source: "default" | "env" | "stored";
  id?: string;
}

export type ProviderRateLimitPolicyScopeType =
  | "global"
  | "user"
  | "project"
  | "organization"
  | "ip"
  | "provider";

export interface ProviderRateLimitPolicyRecord {
  id: string;
  scopeType: ProviderRateLimitPolicyScopeType;
  scopeId: string | null;
  providerConfigId: string | null;
  taskType: string | null;
  limit: number;
  windowSeconds: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderTokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface ProviderUsageEventRecord {
  id: string;
  userId: string | null;
  projectId: string | null;
  courseId: string | null;
  classId: string | null;
  providerConfigId: string;
  provider: string;
  model: string | null;
  ipAddress: string | null;
  taskType: ProviderTaskType;
  outcome: "success" | "failed" | "blocked";
  units: number;
  tokenUsage: ProviderTokenUsage | null;
  createdAt: string;
}

export interface ProviderUsageCountInput {
  userId: string;
  taskTypes: readonly ProviderTaskType[];
  createdAfter: string;
  ipAddress?: string | null;
}

export interface ProviderUsageUnitSumInput {
  taskTypes: readonly ProviderTaskType[];
  createdAfter: string;
  createdBefore: string;
}

export interface ProviderUsageUnitSum {
  taskType: ProviderTaskType;
  units: number;
}

export interface ProviderQuotaSnapshot {
  providerConfigId: string;
  provider: string;
  model: string | null;
  taskType: string | null;
  scopeType: ProviderRateLimitPolicyScopeType;
  scopeId: string | null;
  limit: number;
  windowSeconds: number;
  usedUnits: number;
  remainingUnits: number;
  resetAt: string | null;
}

export interface ProviderUsageTracker {
  recordUsage(input: ProviderUsageInput): Promise<void>;
  checkLimit(input: ProviderLimitCheckInput): Promise<ProviderLimitDecision>;
  countUsageEvents?(input: ProviderUsageCountInput): Promise<number>;
  sumUsageUnits?(input: ProviderUsageUnitSumInput): Promise<ProviderUsageUnitSum[]>;
  listUsageEvents?(): Promise<ProviderUsageEventRecord[]>;
  listQuotaSnapshots?(): Promise<ProviderQuotaSnapshot[]>;
  listRateLimitPolicies?(): Promise<ProviderRateLimitPolicyRecord[]>;
  createRateLimitPolicy?(
    input: Omit<ProviderRateLimitPolicyRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<ProviderRateLimitPolicyRecord>;
  updateRateLimitPolicy?(
    id: string,
    input: Partial<Omit<ProviderRateLimitPolicyRecord, "id" | "createdAt" | "updatedAt">>,
  ): Promise<ProviderRateLimitPolicyRecord | null>;
}

export const DEFAULT_PROVIDER_HOURLY_LIMIT = 60;
export const DEFAULT_PROVIDER_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

export function resolveProviderRateLimitPolicy(
  env: { UML_PROVIDER_HOURLY_LIMIT?: string } = {
    UML_PROVIDER_HOURLY_LIMIT: process.env.UML_PROVIDER_HOURLY_LIMIT,
  },
): ProviderRateLimitPolicy {
  const configuredLimit = Number(env.UML_PROVIDER_HOURLY_LIMIT);
  if (Number.isInteger(configuredLimit) && configuredLimit > 0) {
    return {
      limit: configuredLimit,
      windowSeconds: DEFAULT_PROVIDER_RATE_LIMIT_WINDOW_SECONDS,
      source: "env",
    };
  }

  return {
    limit: DEFAULT_PROVIDER_HOURLY_LIMIT,
    windowSeconds: DEFAULT_PROVIDER_RATE_LIMIT_WINDOW_SECONDS,
    source: "default",
  };
}

function policyScopeMatches(
  input: Pick<
    ProviderLimitCheckInput,
    "userId" | "projectId" | "providerConfigId" | "taskType"
    | "organizationId" | "ipAddress"
  >,
  policy: ProviderRateLimitPolicyRecord,
) {
  if (!policy.enabled) return false;
  if (policy.providerConfigId && policy.providerConfigId !== input.providerConfigId) {
    return false;
  }
  if (policy.taskType && policy.taskType !== input.taskType) return false;

  if (policy.scopeType === "global") return true;
  if (policy.scopeType === "provider") {
    return !policy.scopeId || policy.scopeId === input.providerConfigId;
  }
  if (policy.scopeType === "project") return policy.scopeId === input.projectId;
  if (policy.scopeType === "user") return policy.scopeId === input.userId;
  if (policy.scopeType === "organization") {
    return policy.scopeId === input.organizationId;
  }
  if (policy.scopeType === "ip") return policy.scopeId === input.ipAddress;
  return false;
}

function policySpecificity(policy: ProviderRateLimitPolicyRecord) {
  const scopeScore = {
    global: 1,
    organization: 2,
    ip: 2,
    provider: 2,
    project: 3,
    user: 3,
  } satisfies Record<ProviderRateLimitPolicyScopeType, number>;
  return (
    scopeScore[policy.scopeType] +
    (policy.providerConfigId ? 2 : 0) +
    (policy.taskType ? 1 : 0) +
    (policy.scopeId ? 1 : 0)
  );
}

export function selectProviderRateLimitPolicy(
  input: Pick<
    ProviderLimitCheckInput,
    "userId" | "projectId" | "providerConfigId" | "taskType"
    | "organizationId" | "ipAddress"
  >,
  policies: readonly ProviderRateLimitPolicyRecord[],
  fallback: ProviderRateLimitPolicy,
): ProviderRateLimitPolicy {
  const matched = policies
    .filter((policy) => policyScopeMatches(input, policy))
    .sort((left, right) => {
      const scoreDelta = policySpecificity(right) - policySpecificity(left);
      if (scoreDelta !== 0) return scoreDelta;
      return right.updatedAt.localeCompare(left.updatedAt);
    })[0];

  return matched
    ? {
        id: matched.id,
        limit: matched.limit,
        windowSeconds: matched.windowSeconds,
        source: "stored",
      }
    : fallback;
}

function usageScopeClause(policy: ProviderRateLimitPolicyRecord | null) {
  if (!policy) {
    return `
            and ($1::text is null or user_id = $1)
            and ($2::text is null or project_id = $2)
    `;
  }
  if (policy.scopeType === "global") return "";
  if (policy.scopeType === "provider") return "";
  if (policy.scopeType === "user") return "and user_id = $1";
  if (policy.scopeType === "project") return "and project_id = $2";
  if (policy.scopeType === "organization") return "and organization_id = $7";
  if (policy.scopeType === "ip") return "and ip_address = $6";
  return "";
}

function limitCheckParams(
  input: ProviderLimitCheckInput,
  selectedPolicy: ProviderRateLimitPolicy,
  selectedPolicyRecord: ProviderRateLimitPolicyRecord | null,
) {
  const params: unknown[] = [
    input.userId,
    input.projectId,
    input.providerConfigId,
    input.taskType,
    selectedPolicy.windowSeconds,
  ];

  // pg rejects extra bind values, so include optional scope dimensions only when
  // the selected stored policy's SQL clause actually references those placeholders.
  if (selectedPolicyRecord?.scopeType === "ip") {
    params.push(input.ipAddress ?? null);
  } else if (selectedPolicyRecord?.scopeType === "organization") {
    params.push(input.ipAddress ?? null, input.organizationId ?? null);
  }

  return params;
}

function toIsoTimestamp(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function readMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function readTokenUsage(value: unknown): ProviderTokenUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const inputTokens =
    typeof record.inputTokens === "number" && Number.isFinite(record.inputTokens)
      ? Math.max(Math.trunc(record.inputTokens), 0)
      : null;
  const outputTokens =
    typeof record.outputTokens === "number" && Number.isFinite(record.outputTokens)
      ? Math.max(Math.trunc(record.outputTokens), 0)
      : null;
  const totalTokens =
    typeof record.totalTokens === "number" && Number.isFinite(record.totalTokens)
      ? Math.max(Math.trunc(record.totalTokens), 0)
      : null;
  return { inputTokens, outputTokens, totalTokens };
}

function buildUsageMetadata(input: ProviderUsageInput) {
  return {
    provider: input.provider ?? null,
    model: input.model ?? null,
    courseId: input.courseId ?? null,
    classId: input.classId ?? null,
    tokenUsage: input.tokenUsage ?? null,
  };
}

export function createProviderUsageTracker(db: Queryable): ProviderUsageTracker {
  async function listRateLimitPolicies() {
    const result = await db.query<{
      id: string;
      scope_type: ProviderRateLimitPolicyScopeType;
      scope_id: string | null;
      provider_config_id: string | null;
      task_type: string | null;
      limit_count: string | number;
      window_seconds: string | number;
      enabled: boolean;
      created_at: string | Date;
      updated_at: string | Date;
    }>(
      `
        select
          id,
          scope_type,
          scope_id,
          provider_config_id,
          task_type,
          limit_count,
          window_seconds,
          enabled,
          created_at,
          updated_at
        from rate_limit_policies
        order by updated_at desc
      `,
    );
    return result.rows.map((row) => ({
      id: row.id,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      providerConfigId: row.provider_config_id,
      taskType: row.task_type,
      limit: Number(row.limit_count),
      windowSeconds: Number(row.window_seconds),
      enabled: row.enabled,
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updatedAt:
        row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    }));
  }

  return {
    async recordUsage(input: ProviderUsageInput) {
      const units = input.units ?? 1;
      await db.query(
        `
          insert into provider_usage_events (
            id,
            user_id,
            project_id,
            provider_config_id,
            task_type,
            ip_address,
            organization_id,
            units,
            outcome,
            metadata
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          randomUUID(),
          input.userId,
          input.projectId,
          input.providerConfigId,
          input.taskType,
          input.ipAddress ?? null,
          input.organizationId ?? null,
          units,
          input.outcome ?? "success",
          buildUsageMetadata(input),
        ],
      );
    },

    async checkLimit(input: ProviderLimitCheckInput): Promise<ProviderLimitDecision> {
      const policies = await listRateLimitPolicies();
      const selectedPolicy = selectProviderRateLimitPolicy(
        input,
        policies,
        {
          limit: input.limit,
          windowSeconds: input.windowSeconds,
          source: "default",
        },
      );
      const selectedPolicyRecord =
        selectedPolicy.source === "stored"
          ? policies.find((policy) => policy.id === selectedPolicy.id) ?? null
          : null;
      const result = await db.query<{ used_units: string | number | null }>(
        `
          select coalesce(sum(units), 0) as used_units
          from provider_usage_events
          where true
            ${usageScopeClause(selectedPolicyRecord)}
            and provider_config_id = $3
            and task_type = $4
            and created_at >= now() - ($5::int * interval '1 second')
        `,
        limitCheckParams(input, selectedPolicy, selectedPolicyRecord),
      );
      const usedUnits = Number(result.rows[0]?.used_units ?? 0);
      const remainingUnits = Math.max(selectedPolicy.limit - usedUnits, 0);

      return {
        allowed: usedUnits < selectedPolicy.limit,
        usedUnits,
        remainingUnits,
        limit: selectedPolicy.limit,
        windowSeconds: selectedPolicy.windowSeconds,
      };
    },

    async countUsageEvents(input: ProviderUsageCountInput) {
      const result = await db.query<{ used_units: string | number | null }>(
        `
          select coalesce(sum(units), 0) as used_units
          from provider_usage_events
          where user_id = $1
            and task_type = any($2::text[])
            and created_at >= $3::timestamptz
            and ($4::text is null or ip_address = $4)
        `,
        [
          input.userId,
          input.taskTypes,
          input.createdAfter,
          input.ipAddress ?? null,
        ],
      );
      return Number(result.rows[0]?.used_units ?? 0);
    },

    async sumUsageUnits(input: ProviderUsageUnitSumInput) {
      if (input.taskTypes.length === 0) return [];
      const result = await db.query<{
        task_type: ProviderTaskType;
        used_units: string | number | null;
      }>(
        `
          select task_type, coalesce(sum(units), 0) as used_units
          from provider_usage_events
          where task_type = any($1::text[])
            and created_at >= $2::timestamptz
            and created_at < $3::timestamptz
          group by task_type
        `,
        [input.taskTypes, input.createdAfter, input.createdBefore],
      );
      return result.rows.map((row) => ({
        taskType: row.task_type,
        units: Number(row.used_units ?? 0),
      }));
    },

    async listUsageEvents() {
      const result = await db.query<{
        id: string;
        user_id: string | null;
        project_id: string | null;
        provider_config_id: string;
        ip_address: string | null;
        provider: string;
        default_model: string | null;
        task_type: ProviderTaskType;
        units: string | number;
        outcome: "success" | "failed" | "blocked";
        metadata: unknown;
        created_at: string | Date;
      }>(
        `
          select
            usage.id,
            usage.user_id,
            usage.project_id,
            usage.provider_config_id,
            usage.ip_address,
            config.provider,
            config.default_model,
            usage.task_type,
            usage.units,
            usage.outcome,
            usage.metadata,
            usage.created_at
          from provider_usage_events usage
          join provider_configs config on config.id = usage.provider_config_id
          order by usage.created_at desc
          limit 500
        `,
      );

      return result.rows.map((row) => {
        const metadata = readMetadata(row.metadata);
        return {
          id: row.id,
          userId: row.user_id,
          projectId: row.project_id,
          courseId: readNullableString(metadata.courseId),
          classId: readNullableString(metadata.classId),
          providerConfigId: row.provider_config_id,
          provider: readNullableString(metadata.provider) ?? row.provider,
          model: readNullableString(metadata.model) ?? row.default_model,
          ipAddress: row.ip_address ?? null,
          taskType: row.task_type,
          outcome: row.outcome,
          units: Number(row.units),
          tokenUsage: readTokenUsage(metadata.tokenUsage),
          createdAt: toIsoTimestamp(row.created_at),
        };
      });
    },

    async listQuotaSnapshots() {
      const result = await db.query<{
        provider_config_id: string;
        provider: string;
        default_model: string | null;
        task_type: string | null;
        scope_type: ProviderRateLimitPolicyScopeType;
        scope_id: string | null;
        limit_count: string | number;
        window_seconds: string | number;
        used_units: string | number | null;
      }>(
        `
          select
            policy.provider_config_id,
            config.provider,
            config.default_model,
            policy.task_type,
            policy.scope_type,
            policy.scope_id,
            policy.limit_count,
            policy.window_seconds,
            coalesce((
              select sum(usage.units)
              from provider_usage_events usage
              where usage.provider_config_id = policy.provider_config_id
                and (policy.task_type is null or usage.task_type = policy.task_type)
                and usage.created_at >= now() - (policy.window_seconds::int * interval '1 second')
                and (
                  policy.scope_type in ('global', 'provider')
                  or (policy.scope_type = 'user' and usage.user_id = policy.scope_id)
                  or (policy.scope_type = 'project' and usage.project_id = policy.scope_id)
                  or (policy.scope_type = 'organization' and usage.organization_id = policy.scope_id)
                  or (policy.scope_type = 'ip' and usage.ip_address = policy.scope_id)
                )
            ), 0) as used_units
          from rate_limit_policies policy
          join provider_configs config on config.id = policy.provider_config_id
          where policy.enabled = true
            and policy.provider_config_id is not null
          order by policy.updated_at desc
        `,
      );

      return result.rows.map((row) => {
        const limit = Number(row.limit_count);
        const usedUnits = Number(row.used_units ?? 0);
        return {
          providerConfigId: row.provider_config_id,
          provider: row.provider,
          model: row.default_model,
          taskType: row.task_type,
          scopeType: row.scope_type,
          scopeId: row.scope_id,
          limit,
          windowSeconds: Number(row.window_seconds),
          usedUnits,
          remainingUnits: Math.max(limit - usedUnits, 0),
          resetAt: null,
        };
      });
    },

    listRateLimitPolicies,

    async createRateLimitPolicy(input) {
      const result = await db.query<{
        id: string;
        scope_type: ProviderRateLimitPolicyScopeType;
        scope_id: string | null;
        provider_config_id: string | null;
        task_type: string | null;
        limit_count: string | number;
        window_seconds: string | number;
        enabled: boolean;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        `
          insert into rate_limit_policies (
            id,
            scope_type,
            scope_id,
            provider_config_id,
            task_type,
            limit_count,
            window_seconds,
            enabled
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning
            id,
            scope_type,
            scope_id,
            provider_config_id,
            task_type,
            limit_count,
            window_seconds,
            enabled,
            created_at,
            updated_at
        `,
        [
          randomUUID(),
          input.scopeType,
          input.scopeId,
          input.providerConfigId,
          input.taskType,
          input.limit,
          input.windowSeconds,
          input.enabled,
        ],
      );
      return (await listRateLimitPolicies()).find(
        (policy) => policy.id === result.rows[0]?.id,
      )!;
    },

    async updateRateLimitPolicy(id, input) {
      const existing = (await listRateLimitPolicies()).find((policy) => policy.id === id);
      if (!existing) return null;
      const next = { ...existing, ...input };
      await db.query(
        `
          update rate_limit_policies
          set
            scope_id = $2,
            provider_config_id = $3,
            task_type = $4,
            limit_count = $5,
            window_seconds = $6,
            enabled = $7,
            updated_at = now()
          where id = $1
        `,
        [
          id,
          next.scopeId,
          next.providerConfigId,
          next.taskType,
          next.limit,
          next.windowSeconds,
          next.enabled,
        ],
      );
      return (await listRateLimitPolicies()).find((policy) => policy.id === id) ?? null;
    },
  };
}
