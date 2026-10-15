// Project, membership, and invitation contract schemas shared by API and web clients.
import { z } from "zod";

const isoTimestampSchema = z.string().datetime({ offset: true });
const optionalNullableTimestampSchema = isoTimestampSchema.nullable();

const emailAddressSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());
const publicNameSchema = z.string().trim().min(1).max(120);
const optionalDescriptionSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().min(1).max(2000).nullable(),
);

export const projectVisibilitySchema = z.enum(["private", "team", "public"]);
export type ProjectVisibility = z.infer<typeof projectVisibilitySchema>;

export const projectStatusSchema = z.enum(["active", "archived", "deleted"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectRetentionPolicySchema = z.enum([
  "manual",
  "semester_180_days",
  "one_year_365_days",
]);
export type ProjectRetentionPolicy = z.infer<typeof projectRetentionPolicySchema>;

export const projectBackgroundKeySchema = z.enum([
  "erp",
  "crm",
  "oa",
  "hrm",
  "finance",
  "procurement",
  "sales",
  "inventory",
  "wms",
  "mes",
  "scm",
  "bi",
  "project_management",
  "cms",
  "plm",
  "eam",
  "itsm",
  "ticket",
  "contract",
  "legal",
  "risk_control",
  "security",
  "permission",
  "approval",
  "reports",
  "orders",
  "after_sales",
  "knowledge_base",
  "equipment",
  "iot",
  "mrp",
  "qms",
  "lims",
  "his",
  "lms",
  "energy",
  "marketing_automation",
  "ecommerce",
  "call_center",
  "tms",
  "fleet",
  "dms",
  "archive",
  "collaboration_portal",
  "low_code",
  "devops",
  "apm",
  "data_governance",
  "mdm",
  "rpa",
  "emr",
  "campus",
  "hotel_pms",
  "property_management",
  "parking",
  "retail_pos",
  "booking",
  "asset_tracking",
  "training",
  "quality_traceability",
]);
export type ProjectBackgroundKey = z.infer<typeof projectBackgroundKeySchema>;

export const projectMemberRoleSchema = z.enum(["owner", "editor", "viewer"]);
export type ProjectMemberRole = z.infer<typeof projectMemberRoleSchema>;

export const projectMemberStatusSchema = z.enum(["invited", "active"]);
export type ProjectMemberStatus = z.infer<typeof projectMemberStatusSchema>;

const nullableProjectBindingIdSchema = z.string().trim().min(1).nullable();
const optionalProjectBindingIdSchema = z
  .preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    nullableProjectBindingIdSchema,
  )
  .optional();
const optionalProjectBackgroundKeySchema = z
  .preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    projectBackgroundKeySchema.nullable(),
  )
  .optional();

export const projectDtoSchema = z
  .object({
    id: z.string().min(1),
    name: publicNameSchema,
    description: optionalDescriptionSchema,
    visibility: projectVisibilitySchema,
    status: projectStatusSchema,
    ownerUserId: z.string().min(1),
    ownerDisplayName: publicNameSchema.nullable().optional(),
    ownerAvatarUrl: z.string().url().nullable().optional(),
    memberCount: z.number().int().min(0).optional(),
    memberPreviews: z
      .array(
        z
          .object({
            id: z.string().min(1),
            userId: z.string().min(1).nullable(),
            displayName: publicNameSchema.nullable(),
            avatarUrl: z.string().url().nullable().optional(),
            role: projectMemberRoleSchema,
            status: projectMemberStatusSchema,
          })
          .strict(),
      )
      .optional(),
    organizationId: nullableProjectBindingIdSchema.default(null),
    courseId: nullableProjectBindingIdSchema.default(null),
    classId: nullableProjectBindingIdSchema.default(null),
    teamId: nullableProjectBindingIdSchema.default(null),
    defaultProviderConfigId: nullableProjectBindingIdSchema.default(null),
    retentionPolicy: projectRetentionPolicySchema.default("manual"),
    backgroundKey: projectBackgroundKeySchema.nullable().default(null),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type ProjectDto = z.infer<typeof projectDtoSchema>;

export const projectCreateRequestSchema = z.object({
  name: publicNameSchema,
  description: optionalDescriptionSchema.default(null),
  visibility: projectVisibilitySchema.default("private"),
  organizationId: optionalProjectBindingIdSchema,
  courseId: optionalProjectBindingIdSchema,
  classId: optionalProjectBindingIdSchema,
  teamId: optionalProjectBindingIdSchema,
  defaultProviderConfigId: optionalProjectBindingIdSchema,
  retentionPolicy: projectRetentionPolicySchema.default("manual").optional(),
  backgroundKey: optionalProjectBackgroundKeySchema,
});
export type ProjectCreateRequest = z.infer<typeof projectCreateRequestSchema>;

export const projectUpdateRequestSchema = z
  .object({
    name: publicNameSchema.optional(),
    description: optionalDescriptionSchema.optional(),
    visibility: projectVisibilitySchema.optional(),
    status: z.enum(["active", "archived"]).optional(),
    organizationId: optionalProjectBindingIdSchema,
    courseId: optionalProjectBindingIdSchema,
    classId: optionalProjectBindingIdSchema,
    teamId: optionalProjectBindingIdSchema,
    defaultProviderConfigId: optionalProjectBindingIdSchema,
    retentionPolicy: projectRetentionPolicySchema.optional(),
    backgroundKey: optionalProjectBackgroundKeySchema,
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one project field must be provided",
  });
export type ProjectUpdateRequest = z.infer<typeof projectUpdateRequestSchema>;

export const projectTransferOwnerRequestSchema = z
  .object({
    newOwnerUserId: z.string().trim().min(1),
  })
  .strict();
export type ProjectTransferOwnerRequest = z.infer<
  typeof projectTransferOwnerRequestSchema
>;

export const projectRetentionPolicyUpdateRequestSchema = z
  .object({
    retentionPolicy: projectRetentionPolicySchema,
  })
  .strict();
export type ProjectRetentionPolicyUpdateRequest = z.infer<
  typeof projectRetentionPolicyUpdateRequestSchema
>;

export const projectPermissionSchema = z.enum([
  "view_project",
  "update_project",
  "delete_project",
  "manage_members",
  "invite_members",
  "remove_members",
  "view_runs",
  "start_runs",
  "view_documents",
  "manage_documents",
  "manage_project_settings",
]);
export type ProjectPermission = z.infer<typeof projectPermissionSchema>;

export const projectMemberRolePermissions = {
  owner: projectPermissionSchema.options,
  editor: [
    "view_project",
    "update_project",
    "view_runs",
    "start_runs",
    "view_documents",
    "manage_documents",
  ],
  viewer: ["view_project", "view_runs", "view_documents"],
} as const satisfies Record<ProjectMemberRole, readonly ProjectPermission[]>;

export const projectMemberDtoSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    userId: z.string().min(1).nullable(),
    email: emailAddressSchema,
    displayName: publicNameSchema.nullable(),
    avatarUrl: z.string().url().nullable().optional(),
    role: projectMemberRoleSchema,
    status: projectMemberStatusSchema,
    invitedByUserId: z.string().min(1).nullable(),
    invitedAt: optionalNullableTimestampSchema,
    joinedAt: optionalNullableTimestampSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();
export type ProjectMemberDto = z.infer<typeof projectMemberDtoSchema>;

export const projectMemberInviteRequestSchema = z
  .object({
    email: emailAddressSchema,
    role: z.enum(["editor", "viewer"]).default("viewer"),
  })
  .strict();
export type ProjectMemberInviteRequest = z.infer<
  typeof projectMemberInviteRequestSchema
>;

export const projectMemberUpdateRequestSchema = z
  .object({
    role: projectMemberRoleSchema,
  })
  .strict();
export type ProjectMemberUpdateRequest = z.infer<
  typeof projectMemberUpdateRequestSchema
>;

export const projectListResponseSchema = z.object({
  projects: z.array(projectDtoSchema),
});
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

export const generationExecutionModeSchema = z.enum(["offline-demo", "provider"]);
export type GenerationExecutionMode = z.infer<typeof generationExecutionModeSchema>;

export const projectResponseSchema = z.object({
  project: projectDtoSchema,
  generationExecutionMode: generationExecutionModeSchema.default("provider"),
  membership: projectMemberDtoSchema.optional(),
  currentUserRole: projectMemberRoleSchema.optional(),
  capabilities: z.array(projectPermissionSchema).optional(),
});
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const projectMembersResponseSchema = z.object({
  members: z.array(projectMemberDtoSchema),
});
export type ProjectMembersResponse = z.infer<typeof projectMembersResponseSchema>;

export const projectMemberResponseSchema = z.object({
  member: projectMemberDtoSchema,
});
export type ProjectMemberResponse = z.infer<typeof projectMemberResponseSchema>;

export const projectInvitationCreateRequestSchema = z
  .object({
    email: emailAddressSchema,
    role: z.enum(["editor", "viewer"]).default("viewer"),
  })
  .strict();
export type ProjectInvitationCreateRequest = z.infer<
  typeof projectInvitationCreateRequestSchema
>;

export const projectInvitationDtoSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    email: emailAddressSchema,
    role: projectMemberRoleSchema,
    status: projectMemberStatusSchema,
    invitedByUserId: z.string().min(1).nullable(),
    invitedAt: optionalNullableTimestampSchema,
    expiresAt: isoTimestampSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    project: projectDtoSchema.optional(),
  })
  .strict();
export type ProjectInvitationDto = z.infer<typeof projectInvitationDtoSchema>;

export const projectInvitationResponseSchema = z
  .object({
    invitation: projectInvitationDtoSchema,
    expiresAt: isoTimestampSchema,
    devToken: z.string().min(1).optional(),
  })
  .strict();
export type ProjectInvitationResponse = z.infer<
  typeof projectInvitationResponseSchema
>;

export const projectInvitationAcceptResponseSchema = z.object({
  member: projectMemberDtoSchema,
});
export type ProjectInvitationAcceptResponse = z.infer<
  typeof projectInvitationAcceptResponseSchema
>;
