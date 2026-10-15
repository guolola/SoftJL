// Adapts PostgreSQL auth/project rows to the existing auth store record shape.
import { createHash, randomUUID } from "node:crypto";
import type {
  AdminRole,
  AuditLogDto,
  LoginEventDto,
  OnboardingStateResponse,
  OnboardingTour,
  OnboardingTourOutcome,
  ProjectBackgroundKey,
  ProjectMemberRole,
  ProjectMemberStatus,
  ProjectRetentionPolicy,
  ProjectStatus,
  ProjectVisibility,
  UserStatus,
} from "@uml-platform/contracts";
import type { Queryable } from "../db/transactions.js";
import type {
  AdminInvitationRecord,
  AuditLogInput,
  ProjectMemberRecord,
  ProjectRecord,
  ProjectWorkspaceRecord,
  ProjectWorkspaceSaveResult,
  SessionRecord,
  UserRecord,
} from "./in-memory-auth-store.js";

type UserRow = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: UserStatus;
  email_verified: boolean;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  mfa_pending_secret: string | null;
  mfa_pending_expires_at: string | Date | null;
  system_roles: AdminRole[];
  password_hash: string;
  created_at: string | Date;
  updated_at: string | Date;
  last_login_at: string | Date | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  created_at: string | Date;
  expires_at: string | Date;
  last_seen_at: string | Date;
  ip_address: string | null;
  user_agent: string | null;
  revoked_at: string | Date | null;
};

type OnboardingRow = {
  empty_workspace_status: OnboardingStateResponse["emptyWorkspace"];
  first_project_status: OnboardingStateResponse["firstProject"];
  first_project_id: string | null;
};

function mapOnboardingRow(row?: OnboardingRow): OnboardingStateResponse {
  return {
    emptyWorkspace: row?.empty_workspace_status ?? null,
    firstProject: row?.first_project_status ?? null,
    firstProjectId: row?.first_project_id ?? null,
  };
}

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  visibility: ProjectVisibility;
  status: ProjectStatus;
  owner_user_id: string;
  organization_id: string | null;
  course_id: string | null;
  class_id: string | null;
  team_id: string | null;
  default_provider_config_id: string | null;
  retention_policy: ProjectRetentionPolicy;
  background_key: ProjectBackgroundKey | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type ProjectMemberRow = {
  id: string;
  project_id: string;
  user_id: string | null;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: ProjectMemberRole;
  status: ProjectMemberStatus;
  invited_by_user_id: string | null;
  invited_at: string | Date | null;
  joined_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type AuditLogRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  outcome: "success" | "failure";
  message: string | null;
  created_at: string | Date;
};

type LoginEventRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  outcome: "success" | "failure";
  ip_address: string | null;
  user_agent: string | null;
  message: string | null;
  created_at: string | Date;
};

type AuthTokenRow = {
  id: string;
  type: "email_verification" | "password_reset" | "mfa_challenge";
  user_id: string;
  expires_at: string | Date;
};

type ProjectInvitationTokenRow = {
  id: string;
  project_member_id: string;
  expires_at: string | Date;
  revoked_at: string | Date | null;
  accepted_at: string | Date | null;
  created_by_user_id: string;
  created_at: string | Date;
};

type AdminInvitationRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: Exclude<AdminRole, "super_admin">;
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by_user_id: string;
  accepted_by_user_id: string | null;
  expires_at: string | Date;
  accepted_at: string | Date | null;
  revoked_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type ProjectWorkspaceRow = {
  project_id: string;
  version: number;
  state: Record<string, unknown>;
  updated_by_user_id: string | null;
  source_run_id: string | null;
  updated_at: string | Date;
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_TOKEN_TTL_MS = 1000 * 60 * 60;
const MFA_CHALLENGE_TOKEN_TTL_MS = 1000 * 60 * 5;
const PROJECT_INVITATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const ADMIN_INVITATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 72;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function usernameFromEmail(email: string) {
  const normalized = normalizeEmail(email)
    .split("@")[0]
    ?.replace(/[^a-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 32);
  return normalized && normalized.length >= 3 ? normalized : "user";
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapUserRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    status: row.status,
    emailVerified: row.email_verified,
    mfaEnabled: row.mfa_enabled,
    mfaSecret: row.mfa_secret,
    mfaPendingSecret: row.mfa_pending_secret,
    mfaPendingExpiresAt: row.mfa_pending_expires_at
      ? toIsoString(row.mfa_pending_expires_at)
      : null,
    systemRoles: row.system_roles,
    passwordHash: row.password_hash,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    lastLoginAt: row.last_login_at ? toIsoString(row.last_login_at) : null,
  };
}

function mapLoginEventRow(row: LoginEventRow): LoginEventDto {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    outcome: row.outcome,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    message: row.message,
    createdAt: toIsoString(row.created_at),
  };
}

function mapSessionRow(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: toIsoString(row.created_at),
    expiresAt: toIsoString(row.expires_at),
    lastSeenAt: toIsoString(row.last_seen_at),
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    revokedAt: row.revoked_at ? toIsoString(row.revoked_at) : null,
  };
}

function mapProjectRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    status: row.status,
    ownerUserId: row.owner_user_id,
    organizationId: row.organization_id ?? null,
    courseId: row.course_id ?? null,
    classId: row.class_id ?? null,
    teamId: row.team_id ?? null,
    defaultProviderConfigId: row.default_provider_config_id ?? null,
    retentionPolicy: row.retention_policy ?? "manual",
    backgroundKey: row.background_key ?? null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapProjectMemberRow(row: ProjectMemberRow): ProjectMemberRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    invitedAt: row.invited_at ? toIsoString(row.invited_at) : null,
    joinedAt: row.joined_at ? toIsoString(row.joined_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapProjectInvitationTokenRow(row: ProjectInvitationTokenRow) {
  return {
    id: row.id,
    projectMemberId: row.project_member_id,
    expiresAt: toIsoString(row.expires_at),
    revokedAt: row.revoked_at ? toIsoString(row.revoked_at) : null,
    acceptedAt: row.accepted_at ? toIsoString(row.accepted_at) : null,
    createdByUserId: row.created_by_user_id,
    createdAt: toIsoString(row.created_at),
  };
}

function mapAdminInvitationRow(row: AdminInvitationRow): AdminInvitationRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    acceptedByUserId: row.accepted_by_user_id,
    expiresAt: toIsoString(row.expires_at),
    acceptedAt: row.accepted_at ? toIsoString(row.accepted_at) : null,
    revokedAt: row.revoked_at ? toIsoString(row.revoked_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapProjectWorkspaceRow(row: ProjectWorkspaceRow): ProjectWorkspaceRecord {
  return {
    projectId: row.project_id,
    version: Number(row.version),
    state: row.state ?? {},
    updatedByUserId: row.updated_by_user_id,
    sourceRunId: row.source_run_id,
    updatedAt: toIsoString(row.updated_at),
  };
}

function defaultProjectWorkspace(project: ProjectRecord | null, projectId: string): ProjectWorkspaceRecord {
  return {
    projectId,
    version: 0,
    state: {},
    updatedByUserId: null,
    sourceRunId: null,
    updatedAt: project?.createdAt ?? new Date().toISOString(),
  };
}

function mapAuditLogRow(row: AuditLogRow): AuditLogDto {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    outcome: row.outcome,
    message: row.message,
    createdAt: toIsoString(row.created_at),
  };
}

const userColumns = `
  id,
  email,
  username,
  display_name,
  avatar_url,
  status,
  email_verified,
  mfa_enabled,
  mfa_secret,
  mfa_pending_secret,
  mfa_pending_expires_at,
  system_roles,
  password_hash,
  created_at,
  updated_at,
  last_login_at
`;

const sessionColumns = `
  id,
  user_id,
  created_at,
  expires_at,
  last_seen_at,
  ip_address,
  user_agent,
  revoked_at
`;

const projectColumns = `
  id,
  name,
  description,
  visibility,
  status,
  owner_user_id,
  organization_id,
  course_id,
  class_id,
  team_id,
  default_provider_config_id,
  retention_policy,
  background_key,
  created_at,
  updated_at
`;

const projectMemberColumns = `
  id,
  project_id,
  user_id,
  email,
  coalesce(
    (select users.display_name from users where users.id = project_members.user_id),
    project_members.display_name
  ) as display_name,
  (select users.avatar_url from users where users.id = project_members.user_id) as avatar_url,
  role,
  status,
  invited_by_user_id,
  invited_at,
  joined_at,
  created_at,
  updated_at
`;

const auditLogColumns = `
  id,
  actor_user_id,
  action,
  target_type,
  target_id,
  outcome,
  message,
  created_at
`;

const loginEventColumns = `
  id,
  user_id,
  email,
  outcome,
  ip_address,
  user_agent,
  message,
  created_at
`;

const projectInvitationTokenColumns = `
  id,
  project_member_id,
  expires_at,
  revoked_at,
  accepted_at,
  created_by_user_id,
  created_at
`;

const adminInvitationColumns = `
  id,
  email,
  display_name,
  role,
  status,
  invited_by_user_id,
  accepted_by_user_id,
  expires_at,
  accepted_at,
  revoked_at,
  created_at,
  updated_at
`;

const projectWorkspaceColumns = `
  project_id,
  version,
  state,
  updated_by_user_id,
  source_run_id,
  updated_at
`;

export function createPostgresAuthRepository(db: Queryable) {
  const auditLogs: AuditLogDto[] = [];

  async function touchProjectUpdatedAt(projectId: string) {
    await db.query(
      `
        update projects
        set updated_at = now()
        where id = $1
      `,
      [projectId],
    );
  }

  async function createMember(
    input: Omit<ProjectMemberRecord, "id" | "createdAt" | "updatedAt">,
  ) {
    const result = await db.query<ProjectMemberRow>(
      `
        insert into project_members (
          id,
          project_id,
          user_id,
          email,
          display_name,
          role,
          status,
          invited_by_user_id,
          invited_at,
          joined_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        returning ${projectMemberColumns}
      `,
      [
        randomUUID(),
        input.projectId,
        input.userId,
        normalizeEmail(input.email),
        input.displayName,
        input.role,
        input.status,
        input.invitedByUserId,
        input.invitedAt,
        input.joinedAt,
      ],
    );

    return mapProjectMemberRow(result.rows[0]);
  }

  return {
    auditLogs,

    async createUser(input: {
      email: string;
      username?: string;
      displayName: string;
      passwordHash: string;
      systemRoles?: AdminRole[];
      status?: UserStatus;
      emailVerified?: boolean;
    }) {
      const email = normalizeEmail(input.email);
      const username = input.username
        ? normalizeUsername(input.username)
        : usernameFromEmail(email);
      const emailVerified = input.emailVerified ?? true;
      const status =
        input.status ??
        (emailVerified ? "active" : "pending_email_verification");
      const result = await db.query<UserRow>(
        `
          insert into users (
            id,
            email,
            username,
            display_name,
            password_hash,
            system_roles,
            status,
            email_verified
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          on conflict do nothing
          returning ${userColumns}
        `,
        [
          randomUUID(),
          email,
          username,
          input.displayName,
          input.passwordHash,
          input.systemRoles ?? [],
          status,
          emailVerified,
        ],
      );

      return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    },

    async findUserByEmail(email: string) {
      const result = await db.query<UserRow>(
        `
          select ${userColumns}
          from users
          where email = $1
          limit 1
        `,
        [normalizeEmail(email)],
      );

      return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    },

    async findUserByUsername(username: string) {
      const result = await db.query<UserRow>(
        `
          select ${userColumns}
          from users
          where username = $1
          limit 1
        `,
        [normalizeUsername(username)],
      );

      return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    },

    async findUserByLoginIdentifier(identifier: string) {
      const value = identifier.trim();
      return value.includes("@")
        ? this.findUserByEmail(value)
        : this.findUserByUsername(value);
    },

    async listUsers() {
      const result = await db.query<UserRow>(
        `
          select ${userColumns}
          from users
          order by created_at desc
        `,
      );

      return result.rows.map(mapUserRow);
    },

    async getUser(userId: string) {
      const result = await db.query<UserRow>(
        `
          select ${userColumns}
          from users
          where id = $1
          limit 1
        `,
        [userId],
      );

      return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    },

    async updateUser(
      userId: string,
      patch: Partial<
        Pick<
          UserRecord,
          | "displayName"
          | "avatarUrl"
          | "passwordHash"
          | "status"
          | "emailVerified"
          | "systemRoles"
          | "mfaEnabled"
          | "mfaSecret"
          | "mfaPendingSecret"
          | "mfaPendingExpiresAt"
        >
      >,
    ) {
      const result = await db.query<UserRow>(
        `
          update users
          set
            display_name = case when $2 then $3 else display_name end,
            avatar_url = case when $4 then $5 else avatar_url end,
            password_hash = case when $6 then $7 else password_hash end,
            status = case when $8 then $9 else status end,
            email_verified = case when $10 then $11 else email_verified end,
            system_roles = case when $12 then $13 else system_roles end,
            mfa_enabled = case when $14 then $15 else mfa_enabled end,
            mfa_secret = case when $16 then $17 else mfa_secret end,
            mfa_pending_secret = case when $18 then $19 else mfa_pending_secret end,
            mfa_pending_expires_at = case when $20 then $21 else mfa_pending_expires_at end,
            updated_at = now()
          where id = $1
          returning ${userColumns}
        `,
        [
          userId,
          Object.hasOwn(patch, "displayName"),
          patch.displayName ?? null,
          Object.hasOwn(patch, "avatarUrl"),
          patch.avatarUrl ?? null,
          Object.hasOwn(patch, "passwordHash"),
          patch.passwordHash ?? null,
          Object.hasOwn(patch, "status"),
          patch.status ?? null,
          Object.hasOwn(patch, "emailVerified"),
          patch.emailVerified ?? null,
          Object.hasOwn(patch, "systemRoles"),
          patch.systemRoles ?? null,
          Object.hasOwn(patch, "mfaEnabled"),
          patch.mfaEnabled ?? null,
          Object.hasOwn(patch, "mfaSecret"),
          patch.mfaSecret ?? null,
          Object.hasOwn(patch, "mfaPendingSecret"),
          patch.mfaPendingSecret ?? null,
          Object.hasOwn(patch, "mfaPendingExpiresAt"),
          patch.mfaPendingExpiresAt ?? null,
        ],
      );

      return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    },

    async createSession(input: {
      userId: string;
      ipAddress: string | null;
      userAgent: string | null;
    }) {
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
      const result = await db.query<SessionRow>(
        `
          with created_session as (
            insert into sessions (
              id,
              user_id,
              created_at,
              expires_at,
              last_seen_at,
              ip_address,
              user_agent
            )
            values ($1, $2, $3, $4, $3, $5, $6)
            returning ${sessionColumns}
          ),
          updated_user as (
            update users
            set last_login_at = $3, updated_at = $3
            where id = $2
          )
          select ${sessionColumns}
          from created_session
        `,
        [
          randomUUID(),
          input.userId,
          createdAt.toISOString(),
          expiresAt.toISOString(),
          input.ipAddress,
          input.userAgent,
        ],
      );

      return mapSessionRow(result.rows[0]);
    },

    async getActiveSession(sessionId: string) {
      const result = await db.query<SessionRow>(
        `
          update sessions
          set last_seen_at = now()
          where id = $1
            and revoked_at is null
            and expires_at > now()
          returning ${sessionColumns}
        `,
        [sessionId],
      );

      return result.rows[0] ? mapSessionRow(result.rows[0]) : null;
    },

    async revokeSession(sessionId: string) {
      await db.query(
        `
          update sessions
          set revoked_at = now()
          where id = $1 and revoked_at is null
        `,
        [sessionId],
      );
    },

    async listActiveSessionsForUser(userId: string) {
      const result = await db.query<SessionRow>(
        `
          select ${sessionColumns}
          from sessions
          where user_id = $1
            and revoked_at is null
            and expires_at > now()
          order by last_seen_at desc
        `,
        [userId],
      );

      return result.rows.map(mapSessionRow);
    },

    async revokeOtherSessions(userId: string, currentSessionId: string) {
      const result = await db.query<{ revoked_count: number | string }>(
        `
          with revoked as (
            update sessions
            set revoked_at = now()
            where user_id = $1
              and id <> $2
              and revoked_at is null
              and expires_at > now()
            returning 1
          )
          select count(*)::int as revoked_count from revoked
        `,
        [userId, currentSessionId],
      );

      return Number(result.rows[0]?.revoked_count ?? 0);
    },

    async revokeSessionsForUser(userId: string) {
      const result = await db.query<{ revoked_count: number | string }>(
        `
          with revoked as (
            update sessions
            set revoked_at = now()
            where user_id = $1
              and revoked_at is null
              and expires_at > now()
            returning 1
          )
          select count(*)::int as revoked_count from revoked
        `,
        [userId],
      );

      return Number(result.rows[0]?.revoked_count ?? 0);
    },

    async createEmailVerificationToken(userId: string) {
      const token = randomUUID();
      const expiresAt = new Date(
        Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS,
      ).toISOString();
      await db.query(
        `
          insert into auth_tokens (
            id,
            type,
            user_id,
            token_hash,
            expires_at
          )
          values ($1, 'email_verification', $2, $3, $4)
        `,
        [randomUUID(), userId, hashToken(token), expiresAt],
      );
      return { token, expiresAt };
    },

    async verifyEmailToken(token: string) {
      const result = await db.query<AuthTokenRow>(
        `
          update auth_tokens
          set used_at = now()
          where id = (
            select id
            from auth_tokens
            where type = 'email_verification'
              and token_hash = $1
              and used_at is null
              and expires_at > now()
            limit 1
          )
          returning id, type, user_id, expires_at
        `,
        [hashToken(token)],
      );
      const tokenRow = result.rows[0];
      if (!tokenRow) return null;
      const user = await this.getUser(tokenRow.user_id);
      if (!user) return null;
      return this.updateUser(tokenRow.user_id, {
        // Verification is the state transition from pending signup to an active account.
        emailVerified: true,
        status: user.status === "pending_email_verification" ? "active" : user.status,
      });
    },

    async createPasswordResetToken(email: string) {
      const user = await this.findUserByEmail(email);
      if (!user) return null;
      const token = randomUUID();
      const expiresAt = new Date(
        Date.now() + PASSWORD_RESET_TOKEN_TTL_MS,
      ).toISOString();
      await db.query(
        `
          insert into auth_tokens (
            id,
            type,
            user_id,
            token_hash,
            expires_at
          )
          values ($1, 'password_reset', $2, $3, $4)
        `,
        [randomUUID(), user.id, hashToken(token), expiresAt],
      );
      return { token, expiresAt, userId: user.id };
    },

    async resetPasswordWithToken(token: string, passwordHash: string) {
      const result = await db.query<AuthTokenRow>(
        `
          update auth_tokens
          set used_at = now()
          where id = (
            select id
            from auth_tokens
            where type = 'password_reset'
              and token_hash = $1
              and used_at is null
              and expires_at > now()
            limit 1
          )
          returning id, type, user_id, expires_at
        `,
        [hashToken(token)],
      );
      const tokenRow = result.rows[0];
      if (!tokenRow) return null;
      const user = await this.updateUser(tokenRow.user_id, { passwordHash });
      if (!user) return null;
      const revokedSessionCount = await this.revokeSessionsForUser(user.id);
      return { user, revokedSessionCount };
    },

    async createMfaChallenge(userId: string) {
      const token = randomUUID();
      const expiresAt = new Date(
        Date.now() + MFA_CHALLENGE_TOKEN_TTL_MS,
      ).toISOString();
      await db.query(
        `
          insert into auth_tokens (
            id,
            type,
            user_id,
            token_hash,
            expires_at
          )
          values ($1, 'mfa_challenge', $2, $3, $4)
        `,
        [randomUUID(), userId, hashToken(token), expiresAt],
      );
      return { token, expiresAt };
    },

    async consumeMfaChallenge(challengeId: string) {
      const result = await db.query<AuthTokenRow>(
        `
          update auth_tokens
          set used_at = now()
          where id = (
            select id
            from auth_tokens
            where type = 'mfa_challenge'
              and token_hash = $1
              and used_at is null
              and expires_at > now()
            limit 1
          )
          returning id, type, user_id, expires_at
        `,
        [hashToken(challengeId)],
      );
      const tokenRow = result.rows[0];
      return tokenRow ? this.getUser(tokenRow.user_id) : null;
    },

    async listAdminInvitations() {
      await db.query(
        `update admin_invitations set status = 'expired', updated_at = now()
         where status = 'pending' and expires_at <= now()`,
      );
      const result = await db.query<AdminInvitationRow>(
        `select ${adminInvitationColumns} from admin_invitations order by created_at desc`,
      );
      return result.rows.map(mapAdminInvitationRow);
    },

    async createAdminInvitation(input: {
      email: string;
      displayName?: string | null;
      role: Exclude<AdminRole, "super_admin">;
      invitedByUserId: string;
    }) {
      const email = normalizeEmail(input.email);
      await db.query(
        `update admin_invitations set status = 'expired', updated_at = now()
         where status = 'pending' and expires_at <= now()`,
      );
      const duplicate = await db.query<{ id: string }>(
        `select id from admin_invitations
         where lower(email) = $1 and role = $2 and status = 'pending'
           and revoked_at is null and accepted_at is null and expires_at > now()
         limit 1`,
        [email, input.role],
      );
      if (duplicate.rows[0]) return null;
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + ADMIN_INVITATION_TOKEN_TTL_MS).toISOString();
      const result = await db.query<AdminInvitationRow>(
        `insert into admin_invitations (
           id, email, display_name, role, token_hash, status,
           invited_by_user_id, expires_at
         ) values ($1, $2, $3, $4, $5, 'pending', $6, $7)
         returning ${adminInvitationColumns}`,
        [
          randomUUID(),
          email,
          input.displayName?.trim() || null,
          input.role,
          hashToken(token),
          input.invitedByUserId,
          expiresAt,
        ],
      );
      return { invitation: mapAdminInvitationRow(result.rows[0]), token };
    },

    async findActiveAdminInvitationToken(token: string) {
      const result = await db.query<AdminInvitationRow>(
        `select ${adminInvitationColumns}
         from admin_invitations
         where token_hash = $1 and status = 'pending'
           and revoked_at is null and accepted_at is null and expires_at > now()
         limit 1`,
        [hashToken(token)],
      );
      return result.rows[0] ? mapAdminInvitationRow(result.rows[0]) : null;
    },

    async resendAdminInvitation(id: string, invitedByUserId: string) {
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + ADMIN_INVITATION_TOKEN_TTL_MS).toISOString();
      const result = await db.query<AdminInvitationRow>(
        `update admin_invitations
         set token_hash = $2, invited_by_user_id = $3, expires_at = $4, updated_at = now()
         where id = $1 and status = 'pending' and revoked_at is null and accepted_at is null
         returning ${adminInvitationColumns}`,
        [id, hashToken(token), invitedByUserId, expiresAt],
      );
      return result.rows[0]
        ? { invitation: mapAdminInvitationRow(result.rows[0]), token }
        : null;
    },

    async revokeAdminInvitation(id: string) {
      const result = await db.query<AdminInvitationRow>(
        `update admin_invitations
         set status = 'revoked', revoked_at = now(), updated_at = now()
         where id = $1 and status = 'pending'
         returning ${adminInvitationColumns}`,
        [id],
      );
      return result.rows[0] ? mapAdminInvitationRow(result.rows[0]) : null;
    },

    async acceptAdminInvitation(token: string, userId: string) {
      const invitation = await this.findActiveAdminInvitationToken(token);
      const user = await this.getUser(userId);
      if (!invitation || !user) return null;
      if (normalizeEmail(user.email) !== invitation.email) {
        return { error: "email_mismatch" as const, invitation };
      }
      const accepted = await db.query<AdminInvitationRow>(
        `update admin_invitations
         set status = 'accepted', accepted_by_user_id = $2,
           accepted_at = now(), updated_at = now()
         where id = $1 and status = 'pending' and revoked_at is null
           and accepted_at is null and expires_at > now()
         returning ${adminInvitationColumns}`,
        [invitation.id, user.id],
      );
      if (!accepted.rows[0]) return null;
      const nextUser = await this.updateUser(user.id, {
        emailVerified: true,
        status: user.status === "pending_email_verification" ? "active" : user.status,
        systemRoles: [...new Set([...user.systemRoles, invitation.role])],
      });
      return nextUser
        ? { invitation: mapAdminInvitationRow(accepted.rows[0]), user: nextUser }
        : null;
    },

    async revokeProjectInvitationTokens(projectMemberId: string) {
      const result = await db.query<{ revoked_count: number | string }>(
        `
          with revoked as (
            update project_invitation_tokens
            set revoked_at = now()
            where project_member_id = $1
              and revoked_at is null
              and accepted_at is null
            returning 1
          )
          select count(*)::int as revoked_count from revoked
        `,
        [projectMemberId],
      );

      return Number(result.rows[0]?.revoked_count ?? 0);
    },

    async createProjectInvitationToken(input: {
      projectMemberId: string;
      createdByUserId: string;
    }) {
      await this.revokeProjectInvitationTokens(input.projectMemberId);
      const token = randomUUID();
      const expiresAt = new Date(
        Date.now() + PROJECT_INVITATION_TOKEN_TTL_MS,
      ).toISOString();
      await db.query(
        `
          insert into project_invitation_tokens (
            id,
            project_member_id,
            token_hash,
            expires_at,
            created_by_user_id
          )
          values ($1, $2, $3, $4, $5)
        `,
        [
          randomUUID(),
          input.projectMemberId,
          hashToken(token),
          expiresAt,
          input.createdByUserId,
        ],
      );

      return { token, expiresAt };
    },

    async findActiveProjectInvitationToken(token: string) {
      const result = await db.query<ProjectInvitationTokenRow>(
        `
          select ${projectInvitationTokenColumns}
          from project_invitation_tokens
          where token_hash = $1
            and revoked_at is null
            and accepted_at is null
            and expires_at > now()
          limit 1
        `,
        [hashToken(token)],
      );
      const tokenRow = result.rows[0];
      if (!tokenRow) return null;

      const member = await this.getMember(tokenRow.project_member_id);
      if (!member || member.status !== "invited") return null;
      const project = await this.getProject(member.projectId);
      if (!project || project.status === "deleted") return null;

      return {
        token: mapProjectInvitationTokenRow(tokenRow),
        member,
        project,
      };
    },

    async acceptProjectInvitationToken(
      token: string,
      user: Pick<UserRecord, "id" | "email" | "displayName">,
    ) {
      const invitation = await this.findActiveProjectInvitationToken(token);
      if (!invitation) return null;
      if (invitation.member.email !== normalizeEmail(user.email)) {
        return { error: "email_mismatch" as const, invitation };
      }

      const accepted = await db.query<ProjectInvitationTokenRow>(
        `
          update project_invitation_tokens
          set accepted_at = now()
          where id = $1
            and revoked_at is null
            and accepted_at is null
            and expires_at > now()
          returning ${projectInvitationTokenColumns}
        `,
        [invitation.token.id],
      );
      const acceptedToken = accepted.rows[0];
      if (!acceptedToken) return null;

      // Accepting an invitation is the membership lifecycle boundary from invited to active.
      const member = await this.updateMember(invitation.member.id, {
        userId: user.id,
        displayName: user.displayName,
        status: "active",
        joinedAt: toIsoString(acceptedToken.accepted_at ?? new Date()),
      });
      if (!member) return null;

      return { member, project: invitation.project };
    },

    async createProject(input: {
      ownerUserId: string;
      name: string;
      description: string | null;
      visibility: ProjectVisibility;
      organizationId?: string | null;
      courseId?: string | null;
      classId?: string | null;
      teamId?: string | null;
      defaultProviderConfigId?: string | null;
      retentionPolicy?: ProjectRetentionPolicy;
      backgroundKey?: ProjectBackgroundKey | null;
    }) {
      const projectResult = await db.query<ProjectRow>(
        `
          insert into projects (
            id,
            owner_user_id,
            name,
            description,
            visibility,
            organization_id,
            course_id,
            class_id,
            team_id,
            default_provider_config_id,
            retention_policy,
            background_key
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          returning ${projectColumns}
        `,
        [
          randomUUID(),
          input.ownerUserId,
          input.name,
          input.description,
          input.visibility,
          input.organizationId ?? null,
          input.courseId ?? null,
          input.classId ?? null,
          input.teamId ?? null,
          input.defaultProviderConfigId ?? null,
          input.retentionPolicy ?? "manual",
          input.backgroundKey ?? null,
        ],
      );
      const project = mapProjectRow(projectResult.rows[0]);

      const ownerResult = await db.query<UserRow>(
        `
          select ${userColumns}
          from users
          where id = $1
          limit 1
        `,
        [input.ownerUserId],
      );
      const owner = ownerResult.rows[0] ? mapUserRow(ownerResult.rows[0]) : null;
      const joinedAt = project.createdAt;
      const ownerMember = await createMember({
        projectId: project.id,
        userId: owner?.id ?? null,
        email: owner?.email ?? "",
        displayName: owner?.displayName ?? null,
        role: "owner",
        status: "active",
        invitedByUserId: null,
        invitedAt: null,
        joinedAt,
      });

      // Keep the first self-created project stable across later project creation.
      await db.query(
        `insert into user_onboarding_state (user_id, first_project_id)
         values ($1, $2)
         on conflict (user_id) do update
         set first_project_id = coalesce(user_onboarding_state.first_project_id, excluded.first_project_id),
             updated_at = now()
         where user_onboarding_state.first_project_id is null`,
        [input.ownerUserId, project.id],
      );

      return { project, ownerMember };
    },

    async getProject(projectId: string) {
      const result = await db.query<ProjectRow>(
        `
          select ${projectColumns}
          from projects
          where id = $1
          limit 1
        `,
        [projectId],
      );

      return result.rows[0] ? mapProjectRow(result.rows[0]) : null;
    },

    async getProjectWorkspace(projectId: string) {
      const result = await db.query<ProjectWorkspaceRow>(
        `
          select ${projectWorkspaceColumns}
          from project_workspace_states
          where project_id = $1
          limit 1
        `,
        [projectId],
      );
      if (result.rows[0]) return mapProjectWorkspaceRow(result.rows[0]);
      return defaultProjectWorkspace(await this.getProject(projectId), projectId);
    },

    async saveProjectWorkspace(input: {
      projectId: string;
      baseVersion: number;
      state: Record<string, unknown>;
      updatedByUserId: string;
      sourceRunId?: string | null;
    }): Promise<ProjectWorkspaceSaveResult> {
      if (input.baseVersion === 0) {
        const inserted = await db.query<ProjectWorkspaceRow>(
          `
            insert into project_workspace_states (
              project_id,
              version,
              state,
              updated_by_user_id,
              source_run_id,
              updated_at
            )
            values ($1, 1, $2::jsonb, $3, $4, now())
            on conflict (project_id) do nothing
            returning ${projectWorkspaceColumns}
          `,
          [
            input.projectId,
            JSON.stringify(input.state),
            input.updatedByUserId,
            input.sourceRunId ?? null,
          ],
        );
        if (inserted.rows[0]) {
          await touchProjectUpdatedAt(input.projectId);
          return { ok: true, workspace: mapProjectWorkspaceRow(inserted.rows[0]) };
        }
      }

      const updated = await db.query<ProjectWorkspaceRow>(
        `
          update project_workspace_states
          set
            version = version + 1,
            state = $3::jsonb,
            updated_by_user_id = $4,
            source_run_id = $5,
            updated_at = now()
          where project_id = $1
            and version = $2
          returning ${projectWorkspaceColumns}
        `,
        [
          input.projectId,
          input.baseVersion,
          JSON.stringify(input.state),
          input.updatedByUserId,
          input.sourceRunId ?? null,
        ],
      );
      if (updated.rows[0]) {
        await touchProjectUpdatedAt(input.projectId);
        return { ok: true, workspace: mapProjectWorkspaceRow(updated.rows[0]) };
      }

      return {
        ok: false,
        workspace: await this.getProjectWorkspace(input.projectId),
      };
    },

    async updateProject(
      projectId: string,
      patch: Partial<
        Pick<
          ProjectRecord,
          | "name"
          | "description"
          | "visibility"
          | "status"
          | "ownerUserId"
          | "organizationId"
          | "courseId"
          | "classId"
          | "teamId"
          | "defaultProviderConfigId"
          | "retentionPolicy"
          | "backgroundKey"
        >
      >,
    ) {
      const result = await db.query<ProjectRow>(
        `
          update projects
          set
            name = case when $2 then $3 else name end,
            description = case when $4 then $5 else description end,
            visibility = case when $6 then $7 else visibility end,
            status = case when $8 then $9 else status end,
            owner_user_id = case when $10 then $11 else owner_user_id end,
            organization_id = case when $12 then $13 else organization_id end,
            course_id = case when $14 then $15 else course_id end,
            class_id = case when $16 then $17 else class_id end,
            team_id = case when $18 then $19 else team_id end,
            default_provider_config_id = case when $20 then $21 else default_provider_config_id end,
            retention_policy = case when $22 then $23 else retention_policy end,
            background_key = case when $24 then $25 else background_key end,
            updated_at = now()
          where id = $1
          returning ${projectColumns}
        `,
        [
          projectId,
          Object.hasOwn(patch, "name"),
          patch.name ?? null,
          Object.hasOwn(patch, "description"),
          patch.description ?? null,
          Object.hasOwn(patch, "visibility"),
          patch.visibility ?? null,
          Object.hasOwn(patch, "status"),
          patch.status ?? null,
          Object.hasOwn(patch, "ownerUserId"),
          patch.ownerUserId ?? null,
          Object.hasOwn(patch, "organizationId"),
          patch.organizationId ?? null,
          Object.hasOwn(patch, "courseId"),
          patch.courseId ?? null,
          Object.hasOwn(patch, "classId"),
          patch.classId ?? null,
          Object.hasOwn(patch, "teamId"),
          patch.teamId ?? null,
          Object.hasOwn(patch, "defaultProviderConfigId"),
          patch.defaultProviderConfigId ?? null,
          Object.hasOwn(patch, "retentionPolicy"),
          patch.retentionPolicy ?? null,
          Object.hasOwn(patch, "backgroundKey"),
          patch.backgroundKey ?? null,
        ],
      );

      return result.rows[0] ? mapProjectRow(result.rows[0]) : null;
    },

    async listProjectsForUser(userId: string) {
      const result = await db.query<ProjectRow>(
        `
          select p.${projectColumns
            .split(",")
            .map((column) => column.trim())
            .filter(Boolean)
            .join(", p.")}
          from projects p
          join project_members m on m.project_id = p.id
          where m.user_id = $1
            and m.status = 'active'
            and p.status <> 'deleted'
          order by p.updated_at desc
        `,
        [userId],
      );

      return result.rows.map(mapProjectRow);
    },

    async getOnboardingState(userId: string): Promise<OnboardingStateResponse> {
      const result = await db.query<OnboardingRow>(
        `select empty_workspace_status, first_project_status, first_project_id
         from user_onboarding_state where user_id = $1`,
        [userId],
      );
      return mapOnboardingRow(result.rows[0]);
    },

    async setOnboardingOutcome(
      userId: string,
      tour: OnboardingTour,
      outcome: OnboardingTourOutcome,
    ): Promise<OnboardingStateResponse> {
      const column = tour === "empty-workspace"
        ? "empty_workspace_status"
        : "first_project_status";
      const result = await db.query<OnboardingRow>(
        `insert into user_onboarding_state (user_id, ${column})
         values ($1, $2)
         on conflict (user_id) do update
         set ${column} = excluded.${column}, updated_at = now()
         returning empty_workspace_status, first_project_status, first_project_id`,
        [userId, outcome],
      );
      return mapOnboardingRow(result.rows[0]);
    },

    async listProjects() {
      const result = await db.query<ProjectRow>(
        `
          select ${projectColumns}
          from projects
          where status <> 'deleted'
          order by updated_at desc
        `,
      );

      return result.rows.map(mapProjectRow);
    },

    createMember,

    async findProjectMember(projectId: string, userId: string) {
      const result = await db.query<ProjectMemberRow>(
        `
          select ${projectMemberColumns}
          from project_members
          where project_id = $1
            and user_id = $2
            and status = 'active'
          limit 1
        `,
        [projectId, userId],
      );

      return result.rows[0] ? mapProjectMemberRow(result.rows[0]) : null;
    },

    async findProjectMemberByEmail(projectId: string, email: string) {
      const result = await db.query<ProjectMemberRow>(
        `
          select ${projectMemberColumns}
          from project_members
          where project_id = $1
            and email = $2
          limit 1
        `,
        [projectId, normalizeEmail(email)],
      );

      return result.rows[0] ? mapProjectMemberRow(result.rows[0]) : null;
    },

    async getMember(memberId: string) {
      const result = await db.query<ProjectMemberRow>(
        `
          select ${projectMemberColumns}
          from project_members
          where id = $1
          limit 1
        `,
        [memberId],
      );

      return result.rows[0] ? mapProjectMemberRow(result.rows[0]) : null;
    },

    async listProjectMembers(projectId: string) {
      const result = await db.query<ProjectMemberRow>(
        `
          select ${projectMemberColumns}
          from project_members
          where project_id = $1
          order by created_at asc
        `,
        [projectId],
      );

      return result.rows.map(mapProjectMemberRow);
    },

    async updateMember(
      memberId: string,
      patch: Partial<Pick<ProjectMemberRecord, "role" | "status" | "userId" | "displayName" | "joinedAt">>,
    ) {
      const result = await db.query<ProjectMemberRow>(
        `
          update project_members
          set
            role = case when $2 then $3 else role end,
            status = case when $4 then $5 else status end,
            user_id = case when $6 then $7 else user_id end,
            display_name = case when $8 then $9 else display_name end,
            joined_at = case when $10 then $11 else joined_at end,
            updated_at = now()
          where id = $1
          returning ${projectMemberColumns}
        `,
        [
          memberId,
          Object.hasOwn(patch, "role"),
          patch.role ?? null,
          Object.hasOwn(patch, "status"),
          patch.status ?? null,
          Object.hasOwn(patch, "userId"),
          patch.userId ?? null,
          Object.hasOwn(patch, "displayName"),
          patch.displayName ?? null,
          Object.hasOwn(patch, "joinedAt"),
          patch.joinedAt ?? null,
        ],
      );

      return result.rows[0] ? mapProjectMemberRow(result.rows[0]) : null;
    },

    async deleteMember(memberId: string) {
      const result = await db.query<{ id: string }>(
        `
          delete from project_members
          where id = $1
          returning id
        `,
        [memberId],
      );

      return result.rows.length > 0;
    },

    async countOwners(projectId: string) {
      const result = await db.query<{ owner_count: number | string }>(
        `
          select count(*)::int as owner_count
          from project_members
          where project_id = $1
            and role = 'owner'
            and status = 'active'
        `,
        [projectId],
      );

      return Number(result.rows[0]?.owner_count ?? 0);
    },

    async recordAuditLog(input: AuditLogInput) {
      const result = await db.query<AuditLogRow>(
        `
          insert into audit_logs (
            id,
            actor_user_id,
            action,
            target_type,
            target_id,
            outcome,
            message
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          returning ${auditLogColumns}
        `,
        [
          randomUUID(),
          input.actorUserId,
          input.action,
          input.targetType,
          input.targetId,
          input.outcome,
          input.message ?? null,
        ],
      );
      const entry = mapAuditLogRow(result.rows[0]);
      auditLogs.push(entry);
      return entry;
    },

    async listAuditLogs() {
      const result = await db.query<AuditLogRow>(
        `
          select ${auditLogColumns}
          from audit_logs
          order by created_at desc
        `,
      );
      return result.rows.map(mapAuditLogRow);
    },

    async recordLoginEvent(input: {
      userId: string | null;
      email: string | null;
      outcome: "success" | "failure";
      ipAddress: string | null;
      userAgent: string | null;
      message?: string | null;
    }) {
      const result = await db.query<LoginEventRow>(
        `
          insert into login_events (
            id,
            user_id,
            email,
            outcome,
            ip_address,
            user_agent,
            message
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          returning ${loginEventColumns}
        `,
        [
          randomUUID(),
          input.userId,
          input.email ? normalizeEmail(input.email) : null,
          input.outcome,
          input.ipAddress,
          input.userAgent,
          input.message ?? null,
        ],
      );
      return mapLoginEventRow(result.rows[0]);
    },

    async listLoginEventsForUser(userId: string) {
      const result = await db.query<LoginEventRow>(
        `
          select ${loginEventColumns}
          from login_events
          where user_id = $1
          order by created_at desc
        `,
        [userId],
      );
      return result.rows.map(mapLoginEventRow);
    },

    async listLatestSuccessfulLoginEvents(userIds: string[]) {
      if (userIds.length === 0) return [];
      const result = await db.query<LoginEventRow>(
        `select distinct on (user_id) ${loginEventColumns}
         from login_events
         where user_id = any($1::text[]) and outcome = 'success'
         order by user_id, created_at desc`,
        [userIds],
      );
      return result.rows.map(mapLoginEventRow);
    },

    async userHasSystemRole(userId: string, roles: AdminRole[]) {
      const result = await db.query<{ has_role: boolean }>(
        `
          select exists (
            select 1
            from users
            where id = $1
              and system_roles && $2
          ) as has_role
        `,
        [userId, roles],
      );

      return Boolean(result.rows[0]?.has_role);
    },
  };
}

export type PostgresAuthRepository = ReturnType<typeof createPostgresAuthRepository>;
