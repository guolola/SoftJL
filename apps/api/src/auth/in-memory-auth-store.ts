// Provides first-phase in-memory identity, session, project, membership, and audit records.
import { createHash, randomUUID } from "node:crypto";
import {
  projectMemberRolePermissions,
  type AdminRole,
  type AuditLogDto,
  type LoginEventDto,
  type ProjectBackgroundKey,
  type ProjectMemberRole,
  type ProjectRetentionPolicy,
  type ProjectMemberStatus,
  type ProjectPermission,
  type ProjectStatus,
  type ProjectVisibility,
  type UserStatus,
  type OnboardingStateResponse,
  type OnboardingTour,
  type OnboardingTourOutcome,
} from "@uml-platform/contracts";

export type UserRecord = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: UserStatus;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  mfaPendingSecret: string | null;
  mfaPendingExpiresAt: string | null;
  systemRoles: AdminRole[];
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type SessionRecord = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  revokedAt: string | null;
};

export type ProjectRecord = {
  id: string;
  name: string;
  description: string | null;
  visibility: ProjectVisibility;
  status: ProjectStatus;
  ownerUserId: string;
  organizationId: string | null;
  courseId: string | null;
  classId: string | null;
  teamId: string | null;
  defaultProviderConfigId: string | null;
  retentionPolicy: ProjectRetentionPolicy;
  backgroundKey: ProjectBackgroundKey | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectWorkspaceRecord = {
  projectId: string;
  version: number;
  state: Record<string, unknown>;
  updatedByUserId: string | null;
  sourceRunId: string | null;
  updatedAt: string;
};

export type ProjectWorkspaceSaveResult =
  | { ok: true; workspace: ProjectWorkspaceRecord }
  | { ok: false; workspace: ProjectWorkspaceRecord };

export type ProjectMemberRecord = {
  id: string;
  projectId: string;
  userId: string | null;
  email: string;
  displayName: string | null;
  avatarUrl?: string | null;
  role: ProjectMemberRole;
  status: ProjectMemberStatus;
  invitedByUserId: string | null;
  invitedAt: string | null;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogInput = {
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  outcome: "success" | "failure";
  message?: string | null;
};

export type LoginEventInput = {
  userId: string | null;
  email: string | null;
  outcome: "success" | "failure";
  ipAddress: string | null;
  userAgent: string | null;
  message?: string | null;
};

type AuthTokenRecord = {
  id: string;
  type: "email_verification" | "password_reset" | "mfa_challenge";
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

type ProjectInvitationTokenRecord = {
  id: string;
  projectMemberId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  acceptedAt: string | null;
  createdByUserId: string;
  createdAt: string;
};

export type AdminInvitationRecord = {
  id: string;
  email: string;
  displayName: string | null;
  role: Exclude<AdminRole, "super_admin">;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedByUserId: string;
  acceptedByUserId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredAdminInvitationRecord = AdminInvitationRecord & { tokenHash: string };

export type AuthStore = ReturnType<typeof createInMemoryAuthStore>;

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_TOKEN_TTL_MS = 1000 * 60 * 60;
const MFA_CHALLENGE_TOKEN_TTL_MS = 1000 * 60 * 5;
const PROJECT_INVITATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const ADMIN_INVITATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 72;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createInMemoryAuthStore() {
  const users = new Map<string, UserRecord>();
  const usersByEmail = new Map<string, string>();
  const usersByUsername = new Map<string, string>();
  const sessions = new Map<string, SessionRecord>();
  const projects = new Map<string, ProjectRecord>();
  const onboardingStates = new Map<string, OnboardingStateResponse>();
  const projectWorkspaces = new Map<string, ProjectWorkspaceRecord>();
  const members = new Map<string, ProjectMemberRecord>();
  const auditLogs: AuditLogDto[] = [];
  const loginEvents: LoginEventDto[] = [];
  const authTokens = new Map<string, AuthTokenRecord>();
  const projectInvitationTokens = new Map<string, ProjectInvitationTokenRecord>();
  const adminInvitations = new Map<string, StoredAdminInvitationRecord>();

  function now() {
    return new Date().toISOString();
  }

  function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  function normalizeUsername(username: string) {
    return username.trim().toLowerCase();
  }

  function usernameFromEmail(email: string) {
    const base = normalizeEmail(email)
      .split("@")[0]
      ?.replace(/[^a-z0-9_]+/gu, "_")
      .replace(/^_+|_+$/gu, "")
      .slice(0, 32);
    const safeBase = base && base.length >= 3 ? base : "user";
    let candidate = safeBase;
    let suffix = 1;
    while (usersByUsername.has(candidate)) {
      const suffixText = String(suffix);
      candidate = `${safeBase.slice(0, 32 - suffixText.length)}${suffixText}`;
      suffix += 1;
    }
    return candidate;
  }

  function createUser(input: {
    email: string;
    username?: string;
    displayName: string;
    passwordHash: string;
    systemRoles?: AdminRole[];
    status?: UserStatus;
    emailVerified?: boolean;
  }) {
    const email = normalizeEmail(input.email);
    if (usersByEmail.has(email)) return null;
    const username = input.username
      ? normalizeUsername(input.username)
      : usernameFromEmail(email);
    if (usersByUsername.has(username)) return null;

    const createdAt = now();
    const emailVerified = input.emailVerified ?? true;
    const user: UserRecord = {
      id: randomUUID(),
      email,
      username,
      displayName: input.displayName,
      avatarUrl: null,
      status:
        input.status ??
        (emailVerified ? "active" : "pending_email_verification"),
      emailVerified,
      mfaEnabled: false,
      mfaSecret: null,
      mfaPendingSecret: null,
      mfaPendingExpiresAt: null,
      systemRoles: input.systemRoles ?? [],
      passwordHash: input.passwordHash,
      createdAt,
      updatedAt: createdAt,
      lastLoginAt: null,
    };
    users.set(user.id, user);
    usersByEmail.set(user.email, user.id);
    usersByUsername.set(user.username, user.id);
    return user;
  }

  function findUserByEmail(email: string) {
    const userId = usersByEmail.get(normalizeEmail(email));
    return userId ? users.get(userId) ?? null : null;
  }

  function findUserByUsername(username: string) {
    const userId = usersByUsername.get(normalizeUsername(username));
    return userId ? users.get(userId) ?? null : null;
  }

  function findUserByLoginIdentifier(identifier: string) {
    const value = identifier.trim();
    return value.includes("@") ? findUserByEmail(value) : findUserByUsername(value);
  }

  function listUsers() {
    return [...users.values()];
  }

  function getUser(userId: string) {
    return users.get(userId) ?? null;
  }

  function updateUser(
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
    const user = users.get(userId);
    if (!user) return null;
    Object.assign(user, patch, { updatedAt: now() });
    return user;
  }

  function createSession(input: {
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
  }) {
    const createdAt = now();
    const session: SessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      createdAt,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      lastSeenAt: createdAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      revokedAt: null,
    };
    sessions.set(session.id, session);

    const user = users.get(input.userId);
    if (user) {
      user.lastLoginAt = createdAt;
      user.updatedAt = createdAt;
    }

    return session;
  }

  function getActiveSession(sessionId: string) {
    const session = sessions.get(sessionId);
    if (!session || session.revokedAt) return null;
    if (Date.parse(session.expiresAt) <= Date.now()) return null;
    session.lastSeenAt = now();
    return session;
  }

  function revokeSession(sessionId: string) {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.revokedAt = now();
  }

  function listActiveSessionsForUser(userId: string) {
    return [...sessions.values()].filter(
      (session) =>
        session.userId === userId &&
        !session.revokedAt &&
        Date.parse(session.expiresAt) > Date.now(),
    );
  }

  function revokeOtherSessions(userId: string, currentSessionId: string) {
    const revokedAt = now();
    let revokedCount = 0;
    for (const session of sessions.values()) {
      if (
        session.userId === userId &&
        session.id !== currentSessionId &&
        !session.revokedAt &&
        Date.parse(session.expiresAt) > Date.now()
      ) {
        session.revokedAt = revokedAt;
        revokedCount += 1;
      }
    }
    return revokedCount;
  }

  function revokeSessionsForUser(userId: string) {
    const revokedAt = now();
    let revokedCount = 0;
    for (const session of sessions.values()) {
      if (
        session.userId === userId &&
        !session.revokedAt &&
        Date.parse(session.expiresAt) > Date.now()
      ) {
        session.revokedAt = revokedAt;
        revokedCount += 1;
      }
    }
    return revokedCount;
  }

  function createAuthToken(
    type: AuthTokenRecord["type"],
    userId: string,
    ttlMs: number,
  ) {
    const createdAt = now();
    const token = randomUUID();
    const record: AuthTokenRecord = {
      id: randomUUID(),
      type,
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      usedAt: null,
      createdAt,
    };
    authTokens.set(record.id, record);
    return { token, expiresAt: record.expiresAt };
  }

  function consumeAuthToken(type: AuthTokenRecord["type"], token: string) {
    const tokenHash = hashToken(token);
    const record = [...authTokens.values()].find(
      (candidate) =>
        candidate.type === type &&
        candidate.tokenHash === tokenHash &&
        !candidate.usedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (!record) return null;
    record.usedAt = now();
    return record;
  }

  function createEmailVerificationToken(userId: string) {
    return createAuthToken(
      "email_verification",
      userId,
      EMAIL_VERIFICATION_TOKEN_TTL_MS,
    );
  }

  function verifyEmailToken(token: string) {
    const record = consumeAuthToken("email_verification", token);
    if (!record) return null;
    const user = getUser(record.userId);
    if (!user) return null;
    return updateUser(record.userId, {
      // Verification is the state transition from pending signup to an active account.
      emailVerified: true,
      status: user.status === "pending_email_verification" ? "active" : user.status,
    });
  }

  function createPasswordResetToken(email: string) {
    const user = findUserByEmail(email);
    if (!user) return null;
    return {
      ...createAuthToken("password_reset", user.id, PASSWORD_RESET_TOKEN_TTL_MS),
      userId: user.id,
    };
  }

  function resetPasswordWithToken(token: string, passwordHash: string) {
    const record = consumeAuthToken("password_reset", token);
    if (!record) return null;
    const user = updateUser(record.userId, { passwordHash });
    if (!user) return null;
    return { user, revokedSessionCount: revokeSessionsForUser(user.id) };
  }

  function createMfaChallenge(userId: string) {
    return createAuthToken("mfa_challenge", userId, MFA_CHALLENGE_TOKEN_TTL_MS);
  }

  function consumeMfaChallenge(challengeId: string) {
    const record = consumeAuthToken("mfa_challenge", challengeId);
    return record ? getUser(record.userId) : null;
  }

  function publicAdminInvitation(record: StoredAdminInvitationRecord): AdminInvitationRecord {
    const { tokenHash: _tokenHash, ...invitation } = record;
    return { ...invitation };
  }

  function listAdminInvitations() {
    for (const invitation of adminInvitations.values()) {
      if (invitation.status === "pending" && Date.parse(invitation.expiresAt) <= Date.now()) {
        invitation.status = "expired";
        invitation.updatedAt = now();
      }
    }
    return [...adminInvitations.values()]
      .map(publicAdminInvitation)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  function createAdminInvitation(input: {
    email: string;
    displayName?: string | null;
    role: Exclude<AdminRole, "super_admin">;
    invitedByUserId: string;
  }) {
    const email = normalizeEmail(input.email);
    listAdminInvitations();
    const duplicate = [...adminInvitations.values()].find(
      (candidate) =>
        candidate.email === email &&
        candidate.role === input.role &&
        candidate.status === "pending" &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (duplicate) return null;
    const token = randomUUID();
    const createdAt = now();
    const record: StoredAdminInvitationRecord = {
      id: randomUUID(),
      email,
      displayName: input.displayName?.trim() || null,
      role: input.role,
      tokenHash: hashToken(token),
      status: "pending",
      invitedByUserId: input.invitedByUserId,
      acceptedByUserId: null,
      expiresAt: new Date(Date.now() + ADMIN_INVITATION_TOKEN_TTL_MS).toISOString(),
      acceptedAt: null,
      revokedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
    adminInvitations.set(record.id, record);
    return { invitation: publicAdminInvitation(record), token };
  }

  function findActiveAdminInvitationToken(token: string) {
    const tokenHash = hashToken(token);
    const record = [...adminInvitations.values()].find(
      (candidate) =>
        candidate.tokenHash === tokenHash &&
        candidate.status === "pending" &&
        !candidate.revokedAt &&
        !candidate.acceptedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    return record ? publicAdminInvitation(record) : null;
  }

  function resendAdminInvitation(id: string, invitedByUserId: string) {
    const record = adminInvitations.get(id);
    if (!record || record.status !== "pending" || record.revokedAt || record.acceptedAt) return null;
    const token = randomUUID();
    record.tokenHash = hashToken(token);
    record.invitedByUserId = invitedByUserId;
    record.expiresAt = new Date(Date.now() + ADMIN_INVITATION_TOKEN_TTL_MS).toISOString();
    record.updatedAt = now();
    return { invitation: publicAdminInvitation(record), token };
  }

  function revokeAdminInvitation(id: string) {
    const record = adminInvitations.get(id);
    if (!record || record.status !== "pending") return null;
    record.status = "revoked";
    record.revokedAt = now();
    record.updatedAt = record.revokedAt;
    return publicAdminInvitation(record);
  }

  function acceptAdminInvitation(token: string, userId: string) {
    const invitation = findActiveAdminInvitationToken(token);
    if (!invitation) return null;
    const record = adminInvitations.get(invitation.id);
    const user = users.get(userId);
    if (!record || !user) return null;
    if (normalizeEmail(user.email) !== record.email) {
      return { error: "email_mismatch" as const, invitation };
    }
    const acceptedAt = now();
    record.status = "accepted";
    record.acceptedAt = acceptedAt;
    record.acceptedByUserId = user.id;
    record.updatedAt = acceptedAt;
    updateUser(user.id, {
      emailVerified: true,
      status: user.status === "pending_email_verification" ? "active" : user.status,
      systemRoles: [...new Set([...user.systemRoles, record.role])],
    });
    return { invitation: publicAdminInvitation(record), user: getUser(user.id)! };
  }

  function revokeProjectInvitationTokens(projectMemberId: string) {
    const revokedAt = now();
    let revokedCount = 0;
    for (const record of projectInvitationTokens.values()) {
      if (
        record.projectMemberId === projectMemberId &&
        !record.revokedAt &&
        !record.acceptedAt
      ) {
        record.revokedAt = revokedAt;
        revokedCount += 1;
      }
    }
    return revokedCount;
  }

  function createProjectInvitationToken(input: {
    projectMemberId: string;
    createdByUserId: string;
  }) {
    revokeProjectInvitationTokens(input.projectMemberId);
    const createdAt = now();
    const token = randomUUID();
    const record: ProjectInvitationTokenRecord = {
      id: randomUUID(),
      projectMemberId: input.projectMemberId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + PROJECT_INVITATION_TOKEN_TTL_MS).toISOString(),
      revokedAt: null,
      acceptedAt: null,
      createdByUserId: input.createdByUserId,
      createdAt,
    };
    projectInvitationTokens.set(record.id, record);
    return { token, expiresAt: record.expiresAt };
  }

  function findActiveProjectInvitationToken(token: string) {
    const tokenHash = hashToken(token);
    const record = [...projectInvitationTokens.values()].find(
      (candidate) =>
        candidate.tokenHash === tokenHash &&
        !candidate.revokedAt &&
        !candidate.acceptedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (!record) return null;

    const member = members.get(record.projectMemberId);
    if (!member || member.status !== "invited") return null;
    const project = projects.get(member.projectId);
    if (!project || project.status === "deleted") return null;

    return { token: record, member, project };
  }

  function acceptProjectInvitationToken(
    token: string,
    user: Pick<UserRecord, "id" | "email" | "displayName">,
  ) {
    const invitation = findActiveProjectInvitationToken(token);
    if (!invitation) return null;
    if (invitation.member.email !== normalizeEmail(user.email)) {
      return { error: "email_mismatch" as const, invitation };
    }

    invitation.token.acceptedAt = now();
    // Accepting an invitation is the membership lifecycle boundary from invited to active.
    const member = updateMember(invitation.member.id, {
      userId: user.id,
      displayName: user.displayName,
      status: "active",
      joinedAt: invitation.token.acceptedAt,
    });
    if (!member) return null;

    return { member, project: invitation.project };
  }

  function createProject(input: {
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
    const createdAt = now();
    const project: ProjectRecord = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      status: "active",
      ownerUserId: input.ownerUserId,
      organizationId: input.organizationId ?? null,
      courseId: input.courseId ?? null,
      classId: input.classId ?? null,
      teamId: input.teamId ?? null,
      defaultProviderConfigId: input.defaultProviderConfigId ?? null,
      retentionPolicy: input.retentionPolicy ?? "manual",
      backgroundKey: input.backgroundKey ?? null,
      createdAt,
      updatedAt: createdAt,
    };
    projects.set(project.id, project);

    // The first project identity stays fixed even if later projects are created.
    const onboarding = onboardingStates.get(input.ownerUserId) ?? {
      emptyWorkspace: null,
      firstProject: null,
      firstProjectId: null,
    };
    if (!onboarding.firstProjectId) {
      onboardingStates.set(input.ownerUserId, { ...onboarding, firstProjectId: project.id });
    }

    const owner = users.get(input.ownerUserId);
    const member = createMember({
      projectId: project.id,
      userId: owner?.id ?? null,
      email: owner?.email ?? "",
      displayName: owner?.displayName ?? null,
      role: "owner",
      status: "active",
      invitedByUserId: null,
      invitedAt: null,
      joinedAt: createdAt,
    });

    return { project, ownerMember: member };
  }

  function getProject(projectId: string) {
    return projects.get(projectId) ?? null;
  }

  function createDefaultProjectWorkspace(projectId: string): ProjectWorkspaceRecord {
    return {
      projectId,
      version: 0,
      state: {},
      updatedByUserId: null,
      sourceRunId: null,
      updatedAt: projects.get(projectId)?.createdAt ?? now(),
    };
  }

  function getProjectWorkspace(projectId: string) {
    return projectWorkspaces.get(projectId) ?? createDefaultProjectWorkspace(projectId);
  }

  function saveProjectWorkspace(input: {
    projectId: string;
    baseVersion: number;
    state: Record<string, unknown>;
    updatedByUserId: string;
    sourceRunId?: string | null;
  }): ProjectWorkspaceSaveResult {
    const current = getProjectWorkspace(input.projectId);
    if (current.version !== input.baseVersion) {
      return { ok: false, workspace: current };
    }
    const updatedAt = now();
    const next: ProjectWorkspaceRecord = {
      projectId: input.projectId,
      version: current.version + 1,
      state: structuredClone(input.state),
      updatedByUserId: input.updatedByUserId,
      sourceRunId: input.sourceRunId ?? null,
      updatedAt,
    };
    projectWorkspaces.set(input.projectId, next);
    const project = projects.get(input.projectId);
    if (project) project.updatedAt = updatedAt;
    return { ok: true, workspace: next };
  }

  function updateProject(
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
    const project = projects.get(projectId);
    if (!project) return null;
    Object.assign(project, patch, { updatedAt: now() });
    return project;
  }

  function listProjectsForUser(userId: string) {
    const projectIds = new Set(
      [...members.values()]
        .filter((member) => member.userId === userId && member.status === "active")
        .map((member) => member.projectId),
    );
    return [...projects.values()].filter(
      (project) => projectIds.has(project.id) && project.status !== "deleted",
    );
  }

  function getOnboardingState(userId: string): OnboardingStateResponse {
    return onboardingStates.get(userId) ?? {
      emptyWorkspace: null,
      firstProject: null,
      firstProjectId: null,
    };
  }

  function setOnboardingOutcome(
    userId: string,
    tour: OnboardingTour,
    outcome: OnboardingTourOutcome,
  ): OnboardingStateResponse {
    const current = getOnboardingState(userId);
    const next = tour === "empty-workspace"
      ? { ...current, emptyWorkspace: outcome }
      : { ...current, firstProject: outcome };
    onboardingStates.set(userId, next);
    return next;
  }

  function listProjects() {
    return [...projects.values()].filter((project) => project.status !== "deleted");
  }

  function createMember(input: Omit<ProjectMemberRecord, "id" | "createdAt" | "updatedAt">) {
    const createdAt = now();
    const member: ProjectMemberRecord = {
      id: randomUUID(),
      ...input,
      createdAt,
      updatedAt: createdAt,
    };
    members.set(member.id, member);
    return withMemberUserProfile(member);
  }

  function withMemberUserProfile(member: ProjectMemberRecord): ProjectMemberRecord {
    const user = member.userId ? users.get(member.userId) : null;
    return {
      ...member,
      displayName: user?.displayName ?? member.displayName,
      avatarUrl: user?.avatarUrl ?? (member.userId ? null : member.avatarUrl ?? null),
    };
  }

  function findProjectMember(projectId: string, userId: string) {
    const member =
      [...members.values()].find(
        (item) =>
          item.projectId === projectId &&
          item.userId === userId &&
          item.status === "active",
      ) ?? null;
    return member ? withMemberUserProfile(member) : null;
  }

  function findProjectMemberByEmail(projectId: string, email: string) {
    const normalized = normalizeEmail(email);
    const member =
      [...members.values()].find(
        (member) => member.projectId === projectId && member.email === normalized,
      ) ?? null;
    return member ? withMemberUserProfile(member) : null;
  }

  function getMember(memberId: string) {
    const member = members.get(memberId) ?? null;
    return member ? withMemberUserProfile(member) : null;
  }

  function listProjectMembers(projectId: string) {
    return [...members.values()]
      .filter((member) => member.projectId === projectId)
      .map(withMemberUserProfile);
  }

  function updateMember(
    memberId: string,
    patch: Partial<Pick<ProjectMemberRecord, "role" | "status" | "userId" | "displayName" | "joinedAt">>,
  ) {
    const member = members.get(memberId);
    if (!member) return null;
    Object.assign(member, patch, { updatedAt: now() });
    return withMemberUserProfile(member);
  }

  function deleteMember(memberId: string) {
    return members.delete(memberId);
  }

  function countOwners(projectId: string) {
    return listProjectMembers(projectId).filter(
      (member) => member.role === "owner" && member.status === "active",
    ).length;
  }

  function recordAuditLog(input: AuditLogInput) {
    const entry: AuditLogDto = {
      id: randomUUID(),
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      outcome: input.outcome,
      message: input.message ?? null,
      createdAt: now(),
    };
    auditLogs.push(entry);
    return entry;
  }

  function recordLoginEvent(input: LoginEventInput) {
    const entry: LoginEventDto = {
      id: randomUUID(),
      userId: input.userId,
      email: input.email ? normalizeEmail(input.email) : null,
      outcome: input.outcome,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      message: input.message ?? null,
      createdAt: now(),
    };
    loginEvents.push(entry);
    return entry;
  }

  function listLoginEventsForUser(userId: string) {
    return loginEvents
      .filter((event) => event.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  function listLatestSuccessfulLoginEvents(userIds: string[]) {
    const wanted = new Set(userIds);
    const latest = new Map<string, LoginEventDto>();
    for (const event of loginEvents
      .filter((candidate) => candidate.userId && wanted.has(candidate.userId) && candidate.outcome === "success")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
      if (event.userId && !latest.has(event.userId)) latest.set(event.userId, event);
    }
    return [...latest.values()];
  }

  function listAuditLogs() {
    return [...auditLogs];
  }

  function userHasSystemRole(userId: string, roles: AdminRole[]) {
    const user = users.get(userId);
    return Boolean(user && user.systemRoles.some((role) => roles.includes(role)));
  }

  return {
    createUser,
    findUserByEmail,
    findUserByUsername,
    findUserByLoginIdentifier,
    listUsers,
    getUser,
    updateUser,
    createSession,
    getActiveSession,
    revokeSession,
    listActiveSessionsForUser,
    revokeOtherSessions,
    revokeSessionsForUser,
    createEmailVerificationToken,
    verifyEmailToken,
    createPasswordResetToken,
    resetPasswordWithToken,
    createMfaChallenge,
    consumeMfaChallenge,
    listAdminInvitations,
    createAdminInvitation,
    findActiveAdminInvitationToken,
    resendAdminInvitation,
    revokeAdminInvitation,
    acceptAdminInvitation,
    createProjectInvitationToken,
    findActiveProjectInvitationToken,
    revokeProjectInvitationTokens,
    acceptProjectInvitationToken,
    createProject,
    getProject,
    getProjectWorkspace,
    saveProjectWorkspace,
    updateProject,
    listProjectsForUser,
    getOnboardingState,
    setOnboardingOutcome,
    listProjects,
    createMember,
    findProjectMember,
    findProjectMemberByEmail,
    getMember,
    listProjectMembers,
    updateMember,
    deleteMember,
    countOwners,
    recordAuditLog,
    listAuditLogs,
    recordLoginEvent,
    listLoginEventsForUser,
    listLatestSuccessfulLoginEvents,
    userHasSystemRole,
    auditLogs,
  };
}

export function hasProjectPermission(
  role: ProjectMemberRole,
  permission: ProjectPermission,
) {
  const permissions: readonly ProjectPermission[] = projectMemberRolePermissions[role];
  return permissions.includes(permission);
}
