// Defines user, session, auth, account profile, MFA, and security request schemas shared by API and clients.
import { z } from "zod";
import {
  adminCapabilitySchema,
  adminDataScopeSchema,
  adminPermissionSchema,
  adminRoleSchema,
} from "./admin-rbac.js";

const isoTimestampSchema = z.string().datetime({ offset: true });
const optionalNullableTimestampSchema = isoTimestampSchema.nullable();
const emailAddressSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());
const publicNameSchema = z.string().trim().min(1).max(120);
const passwordSchema = z.string().min(8).max(128);
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,32}$/u);

export const userStatusSchema = z.enum([
  "pending_email_verification",
  "active",
  "disabled",
  "locked",
]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userDtoSchema = z
  .object({
    id: z.string().min(1),
    email: emailAddressSchema,
    username: usernameSchema,
    displayName: publicNameSchema,
    avatarUrl: z.string().url().nullable(),
    status: userStatusSchema,
    emailVerified: z.boolean(),
    mfaEnabled: z.boolean().default(false),
    systemRoles: z.array(adminRoleSchema).default([]),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    lastLoginAt: optionalNullableTimestampSchema,
  })
  .strict();
export type UserDto = z.infer<typeof userDtoSchema>;

export const sessionDtoSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1),
    createdAt: isoTimestampSchema,
    expiresAt: isoTimestampSchema,
    lastSeenAt: isoTimestampSchema,
    ipAddress: z.string().min(1).nullable(),
    userAgent: z.string().min(1).nullable(),
    locationLabel: z.string().min(1).nullable().optional(),
    region: z.string().min(1).nullable().optional(),
  })
  .strict();
export type SessionDto = z.infer<typeof sessionDtoSchema>;

export const authRegisterRequestSchema = z.object({
  email: emailAddressSchema,
  username: usernameSchema,
  password: passwordSchema,
  displayName: publicNameSchema,
});
export type AuthRegisterRequest = z.infer<typeof authRegisterRequestSchema>;

const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .transform((value) => value.toLowerCase());
export const authLoginRequestSchema = z
  .object({
    identifier: loginIdentifierSchema.optional(),
    email: emailAddressSchema.optional(),
    password: z.string().min(1).max(128),
  })
  .refine((input) => Boolean(input.identifier ?? input.email), {
    message: "Login identifier is required",
    path: ["identifier"],
  })
  .transform((input) => ({
    identifier: input.identifier ?? input.email ?? "",
    password: input.password,
  }));
export type AuthLoginRequest = z.infer<typeof authLoginRequestSchema>;

export const authMfaChallengeResponseSchema = z
  .object({
    mfa: z.object({
      required: z.literal(true),
      challengeId: z.string().min(16).max(256),
      expiresAt: isoTimestampSchema,
      method: z.literal("totp"),
    }),
  })
  .strict();
export type AuthMfaChallengeResponse = z.infer<
  typeof authMfaChallengeResponseSchema
>;

export const authMfaVerifyRequestSchema = z
  .object({
    challengeId: z.string().trim().min(16).max(256),
    code: z.string().trim().regex(/^\d{6}$/u),
  })
  .strict();
export type AuthMfaVerifyRequest = z.infer<typeof authMfaVerifyRequestSchema>;

export const authVerifyEmailRequestSchema = z.object({
  token: z.string().trim().min(16).max(256),
});
export type AuthVerifyEmailRequest = z.infer<
  typeof authVerifyEmailRequestSchema
>;

export const authResendVerificationRequestSchema = z.object({
  email: emailAddressSchema,
});
export type AuthResendVerificationRequest = z.infer<
  typeof authResendVerificationRequestSchema
>;

export const authForgotPasswordRequestSchema = z.object({
  email: emailAddressSchema,
});
export type AuthForgotPasswordRequest = z.infer<
  typeof authForgotPasswordRequestSchema
>;

export const authResetPasswordRequestSchema = z.object({
  token: z.string().trim().min(16).max(256),
  newPassword: passwordSchema,
});
export type AuthResetPasswordRequest = z.infer<
  typeof authResetPasswordRequestSchema
>;

export const authSessionResponseSchema = z.object({
  user: userDtoSchema,
  session: sessionDtoSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const accountProfileResponseSchema = authSessionResponseSchema.extend({
  mfa: z.object({
    enabled: z.boolean(),
    enforcement: z.literal("totp"),
  }),
  generationUsage: z.object({
    usedToday: z.number().int().min(0),
    limit: z.number().int().min(1).nullable(),
    remaining: z.number().int().min(0).nullable(),
    windowSeconds: z.number().int().min(1),
    limited: z.boolean(),
    scope: z.enum(["user", "visitor"]),
  }),
});
export type AccountProfileResponse = z.infer<
  typeof accountProfileResponseSchema
>;

export const onboardingTourSchema = z.enum(["empty-workspace", "first-project"]);
export const onboardingTourOutcomeSchema = z.enum(["skipped", "completed"]);
export const onboardingStateResponseSchema = z.object({
  emptyWorkspace: z.enum(["skipped", "completed"]).nullable(),
  firstProject: z.enum(["skipped", "completed", "ineligible"]).nullable(),
  firstProjectId: z.string().min(1).nullable(),
});
export const onboardingTourUpdateRequestSchema = z.object({
  tour: onboardingTourSchema,
  outcome: onboardingTourOutcomeSchema,
});
export type OnboardingStateResponse = z.infer<typeof onboardingStateResponseSchema>;
export type OnboardingTour = z.infer<typeof onboardingTourSchema>;
export type OnboardingTourOutcome = z.infer<typeof onboardingTourOutcomeSchema>;

export const adminSessionResponseSchema = z
  .object({
    user: userDtoSchema,
    roles: z.array(adminRoleSchema),
    permissions: z.array(adminPermissionSchema),
    dataScopes: z.array(adminDataScopeSchema),
    mfaRequired: z.boolean(),
    capabilities: z.array(adminCapabilitySchema),
  })
  .strict();
export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>;

export const accountSessionsResponseSchema = z.object({
  sessions: z.array(sessionDtoSchema),
});
export type AccountSessionsResponse = z.infer<
  typeof accountSessionsResponseSchema
>;

export const accountRevokeSessionsResponseSchema = z.object({
  revokedCount: z.number().int().nonnegative(),
});
export type AccountRevokeSessionsResponse = z.infer<
  typeof accountRevokeSessionsResponseSchema
>;

export const loginEventDtoSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1).nullable(),
    email: emailAddressSchema.nullable(),
    outcome: z.enum(["success", "failure"]),
    ipAddress: z.string().min(1).nullable(),
    userAgent: z.string().min(1).nullable(),
    locationLabel: z.string().min(1).nullable().optional(),
    region: z.string().min(1).nullable().optional(),
    message: z.string().min(1).nullable(),
    createdAt: isoTimestampSchema,
  })
  .strict();
export type LoginEventDto = z.infer<typeof loginEventDtoSchema>;

export const accountLoginEventsResponseSchema = z.object({
  events: z.array(loginEventDtoSchema),
});
export type AccountLoginEventsResponse = z.infer<
  typeof accountLoginEventsResponseSchema
>;

export const accountMfaUpdateRequestSchema = z.object({
  enabled: z.boolean(),
  code: z.string().trim().regex(/^\d{6}$/u).optional(),
});
export type AccountMfaUpdateRequest = z.infer<
  typeof accountMfaUpdateRequestSchema
>;

export const accountMfaResponseSchema = z.object({
  mfa: z.object({
    enabled: z.boolean(),
    enforcement: z.literal("totp"),
  }),
});
export type AccountMfaResponse = z.infer<typeof accountMfaResponseSchema>;

export const accountMfaSetupResponseSchema = z
  .object({
    secret: z.string().min(16).max(128),
    otpauthUri: z.string().min(1),
    expiresAt: isoTimestampSchema,
  })
  .strict();
export type AccountMfaSetupResponse = z.infer<
  typeof accountMfaSetupResponseSchema
>;

export const accountMfaConfirmRequestSchema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/u),
  })
  .strict();
export type AccountMfaConfirmRequest = z.infer<
  typeof accountMfaConfirmRequestSchema
>;

export const accountProfileUpdateRequestSchema = z.object({
  displayName: publicNameSchema.optional(),
  avatarUrl: z
    .string()
    .trim()
    .url()
    .refine((value) => new URL(value).protocol === "https:", {
      message: "Avatar URL must use HTTPS",
    })
    .nullable()
    .optional(),
});
export type AccountProfileUpdateRequest = z.infer<
  typeof accountProfileUpdateRequestSchema
>;

export const accountSecurityUpdateRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "New password must differ from current password",
    path: ["newPassword"],
  });
export type AccountSecurityUpdateRequest = z.infer<
  typeof accountSecurityUpdateRequestSchema
>;
