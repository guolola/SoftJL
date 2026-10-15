// Registers current-user profile and security endpoints.
import type { FastifyInstance } from "fastify";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  accountLoginEventsResponseSchema,
  accountMfaConfirmRequestSchema,
  accountMfaResponseSchema,
  accountMfaSetupResponseSchema,
  accountMfaUpdateRequestSchema,
  accountProfileResponseSchema,
  accountProfileUpdateRequestSchema,
  onboardingStateResponseSchema,
  onboardingTourUpdateRequestSchema,
  accountRevokeSessionsResponseSchema,
  accountSecurityUpdateRequestSchema,
  accountSessionsResponseSchema,
  authSessionResponseSchema,
} from "@uml-platform/contracts";
import { toLoginEventDto, toSessionDto, toUserDto } from "../../auth/dto.js";
import type {
  AuthStore,
  SessionRecord,
  UserRecord,
} from "../../auth/in-memory-auth-store.js";
import { isAuthError, requireAuth } from "../../auth/guards.js";
import {
  createTotpSecret,
  createTotpUri,
  verifyTotpCode,
} from "../../auth/totp.js";
import { hashPassword, verifyPassword } from "../../security/password-hashing.js";
import {
  createGenerationUsageService,
  type GenerationUsageService,
} from "../../generation/generation-usage.js";

const MFA_SETUP_TTL_MS = 1000 * 60 * 10;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_MIME_TYPES = {
  "image/png": { extension: ".png", contentType: "image/png" },
  "image/jpeg": { extension: ".jpg", contentType: "image/jpeg" },
  "image/webp": { extension: ".webp", contentType: "image/webp" },
} as const;

async function accountProfileResponse({
  user,
  session,
  generationUsage,
  ipAddress,
}: {
  user: UserRecord;
  session: SessionRecord;
  generationUsage: GenerationUsageService;
  ipAddress: string | null;
}) {
  return accountProfileResponseSchema.parse({
    user: toUserDto(user),
    session: toSessionDto(session),
    mfa: {
      enabled: user.mfaEnabled,
      enforcement: "totp",
    },
    generationUsage: await generationUsage.getAccountGenerationUsage({
      userId: user.id,
      email: user.email,
      ipAddress,
    }),
  });
}

function ipAddressFromRequest(request: FastifyRequest) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.ip ?? null;
}

function safeAvatarPrefix(userId: string) {
  return userId.replace(/[^a-zA-Z0-9_-]/gu, "_");
}

function avatarMimeForFileName(fileName: string) {
  const match = fileName.match(/\.(png|jpg|jpeg|webp)$/iu);
  if (!match) return null;
  const extension = match[1]?.toLowerCase();
  if (extension === "png") return AVATAR_MIME_TYPES["image/png"];
  if (extension === "jpg" || extension === "jpeg") return AVATAR_MIME_TYPES["image/jpeg"];
  if (extension === "webp") return AVATAR_MIME_TYPES["image/webp"];
  return null;
}

function avatarUrlForRequest(request: FastifyRequest, fileName: string) {
  const configuredBaseUrl = process.env.PUBLIC_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return `${configuredBaseUrl.replace(/\/+$/u, "")}/api/account/avatars/${fileName}`;
  }
  const host = request.headers.host ?? "localhost";
  return `${request.protocol}://${host}/api/account/avatars/${fileName}`;
}

function bufferMatchesAvatarMime(buffer: Buffer, mimeType: keyof typeof AVATAR_MIME_TYPES) {
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

export function registerAccountRoutes({
  app,
  authStore,
  avatarStorageDir,
  generationUsage = createGenerationUsageService(),
}: {
  app: FastifyInstance;
  authStore: AuthStore;
  avatarStorageDir: string;
  generationUsage?: GenerationUsageService;
}) {
  app.get("/api/account/profile", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    return accountProfileResponse({
      user: auth.user,
      session: auth.session,
      generationUsage,
      ipAddress: ipAddressFromRequest(request),
    });
  });

  app.get("/api/account/onboarding", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    return onboardingStateResponseSchema.parse(
      await authStore.getOnboardingState(auth.user.id),
    );
  });

  app.put("/api/account/onboarding", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const parsed = onboardingTourUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { message: "Invalid onboarding tour update" };
    }
    return onboardingStateResponseSchema.parse(
      await authStore.setOnboardingOutcome(auth.user.id, parsed.data.tour, parsed.data.outcome),
    );
  });

  app.patch("/api/account/profile", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const input = accountProfileUpdateRequestSchema.parse(request.body);
    const user = await authStore.updateUser(auth.user.id, input);
    if (!user) {
      reply.code(404);
      return { message: "User not found" };
    }

    await authStore.recordAuditLog({
      actorUserId: user.id,
      action: "account.profile.update",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
    });

    return accountProfileResponse({
      user,
      session: auth.session,
      generationUsage,
      ipAddress: ipAddressFromRequest(request),
    });
  });

  app.post("/api/account/avatar", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const file = await request.file({
      limits: {
        fileSize: MAX_AVATAR_BYTES,
      },
    });
    if (!file) {
      reply.code(400);
      return { message: "Avatar file is required" };
    }

    const mime = AVATAR_MIME_TYPES[file.mimetype as keyof typeof AVATAR_MIME_TYPES];
    if (!mime) {
      await file.toBuffer().catch(() => Buffer.alloc(0));
      reply.code(400);
      return { message: "Avatar must be a PNG, JPG, or WebP image" };
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      reply.code(400);
      return { message: "Avatar must be 2MB or smaller" };
    }
    if (buffer.byteLength > MAX_AVATAR_BYTES) {
      reply.code(400);
      return { message: "Avatar must be 2MB or smaller" };
    }
    if (!bufferMatchesAvatarMime(buffer, file.mimetype as keyof typeof AVATAR_MIME_TYPES)) {
      reply.code(400);
      return { message: "Avatar file content does not match its image type" };
    }

    await mkdir(avatarStorageDir, { recursive: true });
    const fileName = `${safeAvatarPrefix(auth.user.id)}-${randomUUID()}${mime.extension}`;
    await writeFile(join(avatarStorageDir, fileName), buffer);
    const user = await authStore.updateUser(auth.user.id, {
      avatarUrl: avatarUrlForRequest(request, fileName),
    });
    if (!user) {
      reply.code(404);
      return { message: "User not found" };
    }

    await authStore.recordAuditLog({
      actorUserId: user.id,
      action: "account.avatar.upload",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
    });

    return accountProfileResponse({
      user,
      session: auth.session,
      generationUsage,
      ipAddress: ipAddressFromRequest(request),
    });
  });

  app.get<{ Params: { fileName: string } }>(
    "/api/account/avatars/:fileName",
    async (request, reply) => {
      const { fileName } = request.params;
      if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/u.test(fileName)) {
        reply.code(404);
        return { message: "Avatar not found" };
      }

      const mime = avatarMimeForFileName(fileName);
      if (!mime) {
        reply.code(404);
        return { message: "Avatar not found" };
      }

      const filePath = join(avatarStorageDir, fileName);
      try {
        const avatarFile = await stat(filePath);
        if (!avatarFile.isFile()) {
          reply.code(404);
          return { message: "Avatar not found" };
        }
      } catch {
        reply.code(404);
        return { message: "Avatar not found" };
      }
      return reply.type(mime.contentType).send(createReadStream(filePath));
    },
  );

  app.patch("/api/account/security", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const input = accountSecurityUpdateRequestSchema.parse(request.body);
    if (!verifyPassword(input.currentPassword, auth.user.passwordHash)) {
      reply.code(400);
      await authStore.recordAuditLog({
        actorUserId: auth.user.id,
        action: "account.security.password_change",
        targetType: "user",
        targetId: auth.user.id,
        outcome: "failure",
        message: "Current password did not match",
      });
      return { message: "Current password is incorrect" };
    }

    const user = await authStore.updateUser(auth.user.id, {
      passwordHash: hashPassword(input.newPassword),
    });
    if (!user) {
      reply.code(404);
      return { message: "User not found" };
    }
    const revokedCount = await authStore.revokeOtherSessions(
      auth.user.id,
      auth.session.id,
    );

    await authStore.recordAuditLog({
      actorUserId: user.id,
      action: "account.security.password_change",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
      message: `Revoked ${revokedCount} other sessions`,
    });

    return authSessionResponseSchema.parse({
      user: toUserDto(user),
      session: toSessionDto(auth.session),
    });
  });

  app.get("/api/account/sessions", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    return accountSessionsResponseSchema.parse({
      sessions: (await authStore.listActiveSessionsForUser(auth.user.id)).map(
        toSessionDto,
      ),
    });
  });

  app.get("/api/account/login-events", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    return accountLoginEventsResponseSchema.parse({
      events: (await authStore.listLoginEventsForUser(auth.user.id)).map(
        toLoginEventDto,
      ),
    });
  });

  app.post("/api/account/mfa/setup", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const secret = createTotpSecret();
    const expiresAt = new Date(Date.now() + MFA_SETUP_TTL_MS).toISOString();
    const user = await authStore.updateUser(auth.user.id, {
      mfaPendingSecret: secret,
      mfaPendingExpiresAt: expiresAt,
    });
    if (!user) {
      reply.code(404);
      return { message: "User not found" };
    }
    await authStore.recordAuditLog({
      actorUserId: auth.user.id,
      action: "account.mfa.setup",
      targetType: "user",
      targetId: auth.user.id,
      outcome: "success",
      message: "TOTP setup secret issued",
    });

    return accountMfaSetupResponseSchema.parse({
      secret,
      otpauthUri: createTotpUri({
        issuer: "UML Experimental Platform",
        accountName: auth.user.email,
        secret,
      }),
      expiresAt,
    });
  });

  app.post("/api/account/mfa/confirm", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const input = accountMfaConfirmRequestSchema.parse(request.body);
    if (
      !auth.user.mfaPendingSecret ||
      !auth.user.mfaPendingExpiresAt ||
      Date.parse(auth.user.mfaPendingExpiresAt) <= Date.now() ||
      !verifyTotpCode({ secret: auth.user.mfaPendingSecret, code: input.code })
    ) {
      reply.code(400);
      await authStore.recordAuditLog({
        actorUserId: auth.user.id,
        action: "account.mfa.confirm",
        targetType: "user",
        targetId: auth.user.id,
        outcome: "failure",
        message: "TOTP code did not match",
      });
      return { message: "MFA setup code is invalid" };
    }

    const user = await authStore.updateUser(auth.user.id, {
      mfaEnabled: true,
      mfaSecret: auth.user.mfaPendingSecret,
      mfaPendingSecret: null,
      mfaPendingExpiresAt: null,
    });
    if (!user) {
      reply.code(404);
      return { message: "User not found" };
    }
    await authStore.recordAuditLog({
      actorUserId: auth.user.id,
      action: "account.mfa.enable",
      targetType: "user",
      targetId: auth.user.id,
      outcome: "success",
      message: "TOTP MFA enabled",
    });

    return accountMfaResponseSchema.parse({
      mfa: {
        enabled: user.mfaEnabled,
        enforcement: "totp",
      },
    });
  });

  app.patch("/api/account/mfa", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const input = accountMfaUpdateRequestSchema.parse(request.body);
    if (input.enabled) {
      reply.code(400);
      return { message: "Use /api/account/mfa/setup and /confirm to enable TOTP MFA" };
    }
    if (
      auth.user.mfaEnabled &&
      auth.user.mfaSecret &&
      !verifyTotpCode({ secret: auth.user.mfaSecret, code: input.code ?? "" })
    ) {
      reply.code(400);
      await authStore.recordAuditLog({
        actorUserId: auth.user.id,
        action: "account.mfa.disable",
        targetType: "user",
        targetId: auth.user.id,
        outcome: "failure",
        message: "TOTP code did not match",
      });
      return { message: "MFA disable code is invalid" };
    }
    const user = await authStore.updateUser(auth.user.id, {
      mfaEnabled: false,
      mfaSecret: null,
      mfaPendingSecret: null,
      mfaPendingExpiresAt: null,
    });
    if (!user) {
      reply.code(404);
      return { message: "User not found" };
    }
    await authStore.recordAuditLog({
      actorUserId: auth.user.id,
      action: "account.mfa.disable",
      targetType: "user",
      targetId: auth.user.id,
      outcome: "success",
      message: "TOTP MFA disabled",
    });

    return accountMfaResponseSchema.parse({
      mfa: {
        enabled: user.mfaEnabled,
        enforcement: "totp",
      },
    });
  });

  app.post("/api/account/sessions/revoke-others", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const revokedCount = await authStore.revokeOtherSessions(
      auth.user.id,
      auth.session.id,
    );
    await authStore.recordAuditLog({
      actorUserId: auth.user.id,
      action: "account.sessions.revoke_others",
      targetType: "session",
      targetId: auth.session.id,
      outcome: "success",
      message: `Revoked ${revokedCount} other sessions`,
    });

    return accountRevokeSessionsResponseSchema.parse({ revokedCount });
  });
}
