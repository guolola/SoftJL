// Admin platform DTO schemas for users, usage, and audit logs.
import { z } from "zod";
import { userDtoSchema } from "./auth-account.js";

const isoTimestampSchema = z.string().datetime({ offset: true });
const optionalNullableTimestampSchema = isoTimestampSchema.nullable();

export const adminUserDtoSchema = z
  .object({
    user: userDtoSchema,
    projectCount: z.number().int().min(0),
    activeSessionCount: z.number().int().min(0),
    lastAuditEventAt: optionalNullableTimestampSchema,
  })
  .strict();
export type AdminUserDto = z.infer<typeof adminUserDtoSchema>;

export const adminRateLimitPolicyScopeTypeSchema = z.enum([
  "global",
  "user",
  "project",
  "provider",
  "ip",
]);
export type AdminRateLimitPolicyScopeType = z.infer<
  typeof adminRateLimitPolicyScopeTypeSchema
>;

const adminRateLimitTaskTypeSchema = z.string().trim().min(1).max(96);
const adminRateLimitCountSchema = z.number().int().min(1);
const adminRateLimitWindowSecondsSchema = z.number().int().min(1);

export const adminRateLimitPolicyCreateRequestSchema = z
  .object({
    scopeType: adminRateLimitPolicyScopeTypeSchema,
    scopeId: z.string().trim().min(1).nullable().optional(),
    providerConfigId: z.string().trim().min(1).nullable().optional(),
    taskType: adminRateLimitTaskTypeSchema.optional(),
    limit: adminRateLimitCountSchema,
    windowSeconds: adminRateLimitWindowSecondsSchema,
    enabled: z.boolean().default(true),
  })
  .strict();
export type AdminRateLimitPolicyCreateRequest = z.infer<
  typeof adminRateLimitPolicyCreateRequestSchema
>;

export const adminRateLimitPolicyUpdateRequestSchema = z
  .object({
    scopeId: z.string().trim().min(1).nullable().optional(),
    providerConfigId: z.string().trim().min(1).nullable().optional(),
    taskType: adminRateLimitTaskTypeSchema.nullable().optional(),
    limit: adminRateLimitCountSchema.optional(),
    windowSeconds: adminRateLimitWindowSecondsSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
export type AdminRateLimitPolicyUpdateRequest = z.infer<
  typeof adminRateLimitPolicyUpdateRequestSchema
>;

export const adminRateLimitPolicyDtoSchema = z
  .object({
    id: z.string().min(1),
    scopeType: adminRateLimitPolicyScopeTypeSchema,
    scopeId: z.string().min(1).nullable(),
    providerConfigId: z.string().min(1).nullable(),
    taskType: adminRateLimitTaskTypeSchema.nullable(),
    limit: adminRateLimitCountSchema,
    windowSeconds: adminRateLimitWindowSecondsSchema,
    enabled: z.boolean(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminRateLimitPolicyDto = z.infer<typeof adminRateLimitPolicyDtoSchema>;

export const adminRateLimitFallbackPolicySchema = z
  .object({
    limit: adminRateLimitCountSchema,
    windowSeconds: adminRateLimitWindowSecondsSchema,
    source: z.enum(["default", "environment", "admin_policy"]),
  })
  .strict();
export type AdminRateLimitFallbackPolicy = z.infer<
  typeof adminRateLimitFallbackPolicySchema
>;

export const adminRateLimitPolicyListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    rateLimits: z.array(adminRateLimitPolicyDtoSchema),
    fallbackPolicy: adminRateLimitFallbackPolicySchema,
  })
  .strict();
export type AdminRateLimitPolicyListResponse = z.infer<
  typeof adminRateLimitPolicyListResponseSchema
>;

export const adminProviderCostEstimateSchema = z
  .object({
    enabled: z.literal(false),
    amount: z.null(),
    currency: z.null(),
    externalBillingSource: z.literal("external_provider"),
    note: z.string().trim().min(1),
  })
  .strict();
export type AdminProviderCostEstimate = z.infer<
  typeof adminProviderCostEstimateSchema
>;

export const adminProviderTokenUsageSchema = z
  .object({
    inputTokens: z.number().int().min(0).nullable(),
    outputTokens: z.number().int().min(0).nullable(),
    totalTokens: z.number().int().min(0).nullable(),
  })
  .strict();
export type AdminProviderTokenUsage = z.infer<
  typeof adminProviderTokenUsageSchema
>;

export const adminProviderUsageDtoSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1).nullable(),
    projectId: z.string().min(1).nullable(),
    providerConfigId: z.string().min(1),
    provider: z.string().trim().min(1),
    model: z.string().trim().min(1).nullable(),
    taskType: adminRateLimitTaskTypeSchema,
    outcome: z.enum(["success", "failed", "blocked"]),
    units: z.number().int().min(1),
    tokenUsage: adminProviderTokenUsageSchema.nullable(),
    createdAt: isoTimestampSchema,
    costEstimate: adminProviderCostEstimateSchema,
  })
  .strict();
export type AdminProviderUsageDto = z.infer<
  typeof adminProviderUsageDtoSchema
>;

export const adminProviderUsageListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    usage: z.array(adminProviderUsageDtoSchema),
  })
  .strict();
export type AdminProviderUsageListResponse = z.infer<
  typeof adminProviderUsageListResponseSchema
>;

export const adminProviderQuotaDtoSchema = z
  .object({
    providerConfigId: z.string().min(1),
    provider: z.string().trim().min(1),
    model: z.string().trim().min(1).nullable(),
    taskType: adminRateLimitTaskTypeSchema.nullable(),
    scopeType: adminRateLimitPolicyScopeTypeSchema,
    scopeId: z.string().min(1).nullable(),
    limit: adminRateLimitCountSchema,
    windowSeconds: adminRateLimitWindowSecondsSchema,
    usedUnits: z.number().int().min(0),
    remainingUnits: z.number().int().min(0),
    resetAt: optionalNullableTimestampSchema,
    costEstimate: adminProviderCostEstimateSchema,
  })
  .strict();
export type AdminProviderQuotaDto = z.infer<
  typeof adminProviderQuotaDtoSchema
>;

export const adminProviderQuotaListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    quotas: z.array(adminProviderQuotaDtoSchema),
  })
  .strict();
export type AdminProviderQuotaListResponse = z.infer<
  typeof adminProviderQuotaListResponseSchema
>;

export const auditLogDtoSchema = z
  .object({
    id: z.string().min(1),
    actorUserId: z.string().min(1).nullable(),
    action: z.string().min(1),
    targetType: z.string().min(1),
    targetId: z.string().min(1).nullable(),
    outcome: z.enum(["success", "failure"]),
    message: z.string().min(1).nullable(),
    createdAt: isoTimestampSchema,
  })
  .strict();
export type AuditLogDto = z.infer<typeof auditLogDtoSchema>;
