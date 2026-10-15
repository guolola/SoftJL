// Admin platform DTO schemas for users, quotas, organizations, memberships, usage, and audit logs.
import { z } from "zod";
import { userDtoSchema } from "./auth-account.js";

const isoTimestampSchema = z.string().datetime({ offset: true });
const optionalNullableTimestampSchema = isoTimestampSchema.nullable();

const emailAddressSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());
const publicNameSchema = z.string().trim().min(1).max(120);

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
  "organization",
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
    courseId: z.string().min(1).nullable(),
    classId: z.string().min(1).nullable(),
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

const adminNullableCodeSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().min(1).max(64).nullable(),
);

const adminEntityStatusSchema = z.enum(["active", "archived"]);
export type AdminEntityStatus = z.infer<typeof adminEntityStatusSchema>;

export const adminOrganizationTypeSchema = z.enum([
  "school",
  "department",
  "other",
]);
export type AdminOrganizationType = z.infer<typeof adminOrganizationTypeSchema>;

export const adminOrganizationDtoSchema = z
  .object({
    id: z.string().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema,
    type: adminOrganizationTypeSchema,
    status: adminEntityStatusSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminOrganizationDto = z.infer<typeof adminOrganizationDtoSchema>;

export const adminOrganizationCreateRequestSchema = z
  .object({
    name: publicNameSchema,
    code: adminNullableCodeSchema.default(null),
    type: adminOrganizationTypeSchema.default("school"),
    status: adminEntityStatusSchema.default("active"),
  })
  .strict();
export type AdminOrganizationCreateRequest = z.infer<
  typeof adminOrganizationCreateRequestSchema
>;

export const adminOrganizationListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    organizations: z.array(adminOrganizationDtoSchema),
  })
  .strict();
export type AdminOrganizationListResponse = z.infer<
  typeof adminOrganizationListResponseSchema
>;

export const adminCourseDtoSchema = z
  .object({
    id: z.string().min(1),
    organizationId: z.string().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema,
    term: adminNullableCodeSchema,
    status: adminEntityStatusSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminCourseDto = z.infer<typeof adminCourseDtoSchema>;

export const adminCourseCreateRequestSchema = z
  .object({
    organizationId: z.string().trim().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema.default(null),
    term: adminNullableCodeSchema.default(null),
    status: adminEntityStatusSchema.default("active"),
  })
  .strict();
export type AdminCourseCreateRequest = z.infer<
  typeof adminCourseCreateRequestSchema
>;

export const adminCourseListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    courses: z.array(adminCourseDtoSchema),
  })
  .strict();
export type AdminCourseListResponse = z.infer<
  typeof adminCourseListResponseSchema
>;

export const adminClassDtoSchema = z
  .object({
    id: z.string().min(1),
    courseId: z.string().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema,
    status: adminEntityStatusSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminClassDto = z.infer<typeof adminClassDtoSchema>;

export const adminClassCreateRequestSchema = z
  .object({
    courseId: z.string().trim().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema.default(null),
    status: adminEntityStatusSchema.default("active"),
  })
  .strict();
export type AdminClassCreateRequest = z.infer<
  typeof adminClassCreateRequestSchema
>;

export const adminClassListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    classes: z.array(adminClassDtoSchema),
  })
  .strict();
export type AdminClassListResponse = z.infer<
  typeof adminClassListResponseSchema
>;

export const adminTeamDtoSchema = z
  .object({
    id: z.string().min(1),
    classId: z.string().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema,
    status: adminEntityStatusSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminTeamDto = z.infer<typeof adminTeamDtoSchema>;

export const adminTeamCreateRequestSchema = z
  .object({
    classId: z.string().trim().min(1),
    name: publicNameSchema,
    code: adminNullableCodeSchema.default(null),
    status: adminEntityStatusSchema.default("active"),
  })
  .strict();
export type AdminTeamCreateRequest = z.infer<
  typeof adminTeamCreateRequestSchema
>;

export const adminTeamListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    teams: z.array(adminTeamDtoSchema),
  })
  .strict();
export type AdminTeamListResponse = z.infer<typeof adminTeamListResponseSchema>;

export const adminOrganizationMembershipTargetTypeSchema = z.enum([
  "organization",
  "course",
  "class",
  "team",
]);
export type AdminOrganizationMembershipTargetType = z.infer<
  typeof adminOrganizationMembershipTargetTypeSchema
>;

export const adminOrganizationMembershipRoleSchema = z.enum([
  "owner",
  "course_admin",
  "teacher",
  "assistant",
  "student",
  "member",
]);
export type AdminOrganizationMembershipRole = z.infer<
  typeof adminOrganizationMembershipRoleSchema
>;

export const adminOrganizationMembershipStatusSchema = z.enum([
  "active",
  "invited",
]);
export type AdminOrganizationMembershipStatus = z.infer<
  typeof adminOrganizationMembershipStatusSchema
>;

export const adminOrganizationMembershipDtoSchema = z
  .object({
    id: z.string().min(1),
    targetType: adminOrganizationMembershipTargetTypeSchema,
    targetId: z.string().min(1),
    userId: z.string().min(1).nullable(),
    email: emailAddressSchema.nullable(),
    displayName: publicNameSchema.nullable(),
    role: adminOrganizationMembershipRoleSchema,
    status: adminOrganizationMembershipStatusSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminOrganizationMembershipDto = z.infer<
  typeof adminOrganizationMembershipDtoSchema
>;

export const adminOrganizationMembershipCreateRequestSchema = z
  .object({
    targetType: adminOrganizationMembershipTargetTypeSchema,
    targetId: z.string().trim().min(1),
    userId: z.string().trim().min(1).nullable().optional(),
    email: emailAddressSchema.nullable().optional(),
    displayName: publicNameSchema.nullable().optional(),
    role: adminOrganizationMembershipRoleSchema,
    status: adminOrganizationMembershipStatusSchema.default("active"),
  })
  .refine((input) => input.userId || input.email, {
    message: "Either userId or email is required",
    path: ["userId"],
  });
export type AdminOrganizationMembershipCreateRequest = z.infer<
  typeof adminOrganizationMembershipCreateRequestSchema
>;

export const adminOrganizationMembershipListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    memberships: z.array(adminOrganizationMembershipDtoSchema),
  })
  .strict();
export type AdminOrganizationMembershipListResponse = z.infer<
  typeof adminOrganizationMembershipListResponseSchema
>;

export const adminQuotaScopeTypeSchema = z.enum([
  "organization",
  "course",
  "class",
  "team",
]);
export type AdminQuotaScopeType = z.infer<typeof adminQuotaScopeTypeSchema>;

export const adminQuotaResourceSchema = z.enum([
  "runs",
  "documents",
  "storage_bytes",
  "provider_tokens",
]);
export type AdminQuotaResource = z.infer<typeof adminQuotaResourceSchema>;

export const adminQuotaResetPeriodSchema = z.enum(["none", "daily", "monthly"]);
export type AdminQuotaResetPeriod = z.infer<typeof adminQuotaResetPeriodSchema>;

export const adminQuotaDtoSchema = z
  .object({
    id: z.string().min(1),
    scopeType: adminQuotaScopeTypeSchema,
    scopeId: z.string().min(1),
    resource: adminQuotaResourceSchema,
    limit: z.number().int().min(0),
    used: z.number().int().min(0),
    resetPeriod: adminQuotaResetPeriodSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type AdminQuotaDto = z.infer<typeof adminQuotaDtoSchema>;

export const adminQuotaCreateRequestSchema = z
  .object({
    scopeType: adminQuotaScopeTypeSchema,
    scopeId: z.string().trim().min(1),
    resource: adminQuotaResourceSchema,
    limit: z.number().int().min(0),
    used: z.number().int().min(0).default(0),
    resetPeriod: adminQuotaResetPeriodSchema.default("none"),
  })
  .strict();
export type AdminQuotaCreateRequest = z.infer<
  typeof adminQuotaCreateRequestSchema
>;

export const adminQuotaListResponseSchema = z
  .object({
    generatedAt: isoTimestampSchema,
    quotas: z.array(adminQuotaDtoSchema),
  })
  .strict();
export type AdminQuotaListResponse = z.infer<typeof adminQuotaListResponseSchema>;

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
