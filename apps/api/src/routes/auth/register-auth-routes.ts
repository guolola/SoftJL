// Registers account authentication endpoints and delegates state to the auth store.
import type { FastifyInstance } from "fastify";
import {
  authLoginRequestSchema,
  authMfaChallengeResponseSchema,
  authMfaVerifyRequestSchema,
  authRegisterRequestSchema,
  authSessionResponseSchema,
} from "@uml-platform/contracts";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { toSessionDto, toUserDto } from "../../auth/dto.js";
import { isAuthError, requireAuth } from "../../auth/guards.js";
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from "../../auth/session-cookie.js";
import { verifyTotpCode } from "../../auth/totp.js";
import { hashPassword, verifyPassword } from "../../security/password-hashing.js";

function authError(
  code: string,
  category: "authentication" | "authorization" | "conflict" | "validation" = "authentication",
) {
  return { error: { code, category, retryable: false } };
}

export function registerAuthRoutes({
  app,
  authStore,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
}) {
  app.post("/api/auth/register", async (request, reply) => {
    const input = authRegisterRequestSchema.parse(request.body);
    const user = await authStore.createUser({
      username: input.username,
      displayName: input.displayName,
      passwordHash: hashPassword(input.password),
      status: "active",
    });
    if (!user) {
      reply.code(409);
      return authError("AUTH_ACCOUNT_EXISTS", "conflict");
    }

    const session = await authStore.createSession({
      userId: user.id,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    });
    setSessionCookie(reply, session.id);
    await authStore.recordLoginEvent({
      userId: user.id,
      username: user.username,
      outcome: "success",
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
      message: "Registered and started first session",
    });
    await authStore.recordAuditLog({
      actorUserId: user.id,
      action: "auth.register",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
    });

    reply.code(201);
    return {
      ...authSessionResponseSchema.parse({
        user: toUserDto(user),
        session: toSessionDto(session),
      }),
    };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const input = authLoginRequestSchema.parse(request.body);
    const user = await authStore.findUserByUsername(input.identifier);
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      reply.code(401);
      await authStore.recordLoginEvent({
        userId: user?.id ?? null,
        username: user?.username ?? input.identifier,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "Invalid username or password",
      });
      return authError("AUTH_INVALID_CREDENTIALS");
    }
    if (user.status !== "active") {
      reply.code(403);
      await authStore.recordLoginEvent({
        userId: user.id,
        username: user.username,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "User is not active",
      });
      return authError("AUTH_ACCOUNT_INACTIVE", "authorization");
    }

    if (user.mfaEnabled) {
      const challenge = await authStore.createMfaChallenge(user.id);
      await authStore.recordLoginEvent({
        userId: user.id,
        username: user.username,
        outcome: "success",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "MFA challenge issued",
      });
      reply.code(202);
      return authMfaChallengeResponseSchema.parse({
        mfa: {
          required: true,
          challengeId: challenge.token,
          expiresAt: challenge.expiresAt,
          method: "totp",
        },
      });
    }

    const session = await authStore.createSession({
      userId: user.id,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    });
    setSessionCookie(reply, session.id);
    await authStore.recordLoginEvent({
      userId: user.id,
      username: user.username,
      outcome: "success",
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    });
    await authStore.recordAuditLog({
      actorUserId: user.id,
      action: "auth.login",
      targetType: "session",
      targetId: session.id,
      outcome: "success",
    });

    return authSessionResponseSchema.parse({
      user: toUserDto(user),
      session: toSessionDto(session),
    });
  });

  app.post("/api/auth/mfa/verify", async (request, reply) => {
    const input = authMfaVerifyRequestSchema.parse(request.body);
    const user = await authStore.consumeMfaChallenge(input.challengeId);
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      reply.code(401);
      return authError("AUTH_MFA_CHALLENGE_INVALID");
    }
    if (!verifyTotpCode({ secret: user.mfaSecret, code: input.code })) {
      reply.code(401);
      await authStore.recordLoginEvent({
        userId: user.id,
        username: user.username,
        outcome: "failure",
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        message: "MFA code did not match",
      });
      return authError("AUTH_MFA_CODE_INVALID");
    }

    const session = await authStore.createSession({
      userId: user.id,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    });
    setSessionCookie(reply, session.id);
    await authStore.recordLoginEvent({
      userId: user.id,
      username: user.username,
      outcome: "success",
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
      message: "MFA challenge completed",
    });
    await authStore.recordAuditLog({
      actorUserId: user.id,
      action: "auth.mfa.verify",
      targetType: "session",
      targetId: session.id,
      outcome: "success",
    });

    return authSessionResponseSchema.parse({
      user: toUserDto(user),
      session: toSessionDto(session),
    });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sessionId = readSessionCookie(request);
    if (sessionId) {
      await authStore.revokeSession(sessionId);
    }
    clearSessionCookie(reply);
    reply.code(204);
    return null;
  });

  app.get("/api/auth/me", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    return authSessionResponseSchema.parse({
      user: toUserDto(auth.user),
      session: toSessionDto(auth.session),
    });
  });
}
