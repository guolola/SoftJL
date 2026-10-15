// Registers account authentication endpoints and delegates state to the auth store.
import type { FastifyInstance } from "fastify";
import { authForgotPasswordRequestSchema, authLoginRequestSchema, authMfaChallengeResponseSchema, authMfaVerifyRequestSchema, authRegisterRequestSchema, authResendVerificationRequestSchema, authResetPasswordRequestSchema, authSessionResponseSchema, authVerifyEmailRequestSchema, } from "@uml-platform/contracts";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { toSessionDto, toUserDto } from "../../auth/dto.js";
import { isAuthError, requireAuth } from "../../auth/guards.js";
import { clearSessionCookie, readSessionCookie, setSessionCookie, } from "../../auth/session-cookie.js";
import { verifyTotpCode } from "../../auth/totp.js";
import { buildTokenMail, createMailAdapterFromEnv, type MailAdapter, } from "../../mail/mail-adapter.js";
import { hashPassword, verifyPassword } from "../../security/password-hashing.js";
function devTokenPayload(token: string, expiresAt: string) {
    return process.env.NODE_ENV === "production" ? { expiresAt } : { devToken: token, expiresAt };
}
function authError(code: string, category: "authentication" | "authorization" | "conflict" | "validation" = "authentication") {
    return { error: { code, category, retryable: false } };
}
export function registerAuthRoutes({ app, authStore, mailAdapter = createMailAdapterFromEnv(), }: {
    app: FastifyInstance;
    authStore: AuthStore;
    mailAdapter?: MailAdapter;
}) {
    app.post("/api/auth/register", async (request, reply) => {
        const input = authRegisterRequestSchema.parse(request.body);
        const user = await authStore.createUser({
            email: input.email,
            username: input.username,
            displayName: input.displayName,
            passwordHash: hashPassword(input.password),
            status: "pending_email_verification",
            emailVerified: false,
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
        const verification = await authStore.createEmailVerificationToken(user.id);
        await mailAdapter.send(buildTokenMail({
            email: user.email,
            purpose: "verify_email",
            token: verification.token,
            expiresAt: verification.expiresAt,
        }));
        await authStore.recordLoginEvent({
            userId: user.id,
            email: user.email,
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
            verification: {
                ...devTokenPayload(verification.token, verification.expiresAt),
            },
        };
    });
    app.post("/api/auth/login", async (request, reply) => {
        const input = authLoginRequestSchema.parse(request.body);
        const user = await authStore.findUserByLoginIdentifier(input.identifier);
        const eventEmail = input.identifier.includes("@") ? input.identifier : null;
        if (!user || !verifyPassword(input.password, user.passwordHash)) {
            reply.code(401);
            await authStore.recordLoginEvent({
                userId: user?.id ?? null,
                email: user?.email ?? eventEmail,
                outcome: "failure",
                ipAddress: request.ip ?? null,
                userAgent: request.headers["user-agent"] ?? null,
                message: "Invalid email or password",
            });
            return authError("AUTH_INVALID_CREDENTIALS");
        }
        if (!user.emailVerified) {
            reply.code(403);
            await authStore.recordLoginEvent({
                userId: user.id,
                email: user.email,
                outcome: "failure",
                ipAddress: request.ip ?? null,
                userAgent: request.headers["user-agent"] ?? null,
                message: "Email is not verified",
            });
            return authError("AUTH_EMAIL_VERIFICATION_REQUIRED", "authorization");
        }
        if (user.status !== "active") {
            reply.code(403);
            await authStore.recordLoginEvent({
                userId: user.id,
                email: user.email,
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
                email: user.email,
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
            email: user.email,
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
                email: user.email,
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
            email: user.email,
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
    app.post("/api/auth/verify-email", async (request, reply) => {
        const input = authVerifyEmailRequestSchema.parse(request.body);
        const user = await authStore.verifyEmailToken(input.token);
        if (!user) {
            reply.code(400);
            return authError("AUTH_EMAIL_TOKEN_INVALID", "validation");
        }
        await authStore.recordAuditLog({
            actorUserId: user.id,
            action: "auth.email.verify",
            targetType: "user",
            targetId: user.id,
            outcome: "success",
        });
        return { user: toUserDto(user) };
    });
    app.post("/api/auth/resend-verification", async (request) => {
        const input = authResendVerificationRequestSchema.parse(request.body);
        const user = await authStore.findUserByEmail(input.email);
        if (!user || user.emailVerified) {
            return { message: "If verification is needed, a new email will be sent" };
        }
        const verification = await authStore.createEmailVerificationToken(user.id);
        await mailAdapter.send(buildTokenMail({
            email: user.email,
            purpose: "verify_email",
            token: verification.token,
            expiresAt: verification.expiresAt,
        }));
        return {
            message: "If verification is needed, a new email will be sent",
            verification: {
                ...devTokenPayload(verification.token, verification.expiresAt),
            },
        };
    });
    app.post("/api/auth/forgot-password", async (request) => {
        const input = authForgotPasswordRequestSchema.parse(request.body);
        const reset = await authStore.createPasswordResetToken(input.email);
        if (reset) {
            await mailAdapter.send(buildTokenMail({
                email: input.email,
                purpose: "reset_password",
                token: reset.token,
                expiresAt: reset.expiresAt,
            }));
        }
        return {
            message: "If the email exists, a reset link will be sent",
            reset: reset
                ? devTokenPayload(reset.token, reset.expiresAt)
                : null,
        };
    });
    app.post("/api/auth/reset-password", async (request, reply) => {
        const input = authResetPasswordRequestSchema.parse(request.body);
        const result = await authStore.resetPasswordWithToken(input.token, hashPassword(input.newPassword));
        if (!result) {
            reply.code(400);
            return authError("AUTH_PASSWORD_RESET_TOKEN_INVALID", "validation");
        }
        clearSessionCookie(reply);
        await authStore.recordAuditLog({
            actorUserId: result.user.id,
            action: "auth.password.reset",
            targetType: "user",
            targetId: result.user.id,
            outcome: "success",
            message: `Revoked ${result.revokedSessionCount} sessions`,
        });
        return {
            user: toUserDto(result.user),
            revokedSessionCount: result.revokedSessionCount,
        };
    });
    app.get("/api/auth/me", async (request, reply) => {
        const auth = await requireAuth(request, reply, authStore);
        if (isAuthError(auth))
            return auth;
        return authSessionResponseSchema.parse({
            user: toUserDto(auth.user),
            session: toSessionDto(auth.session),
        });
    });
}
