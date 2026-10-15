// Verifies the PostgreSQL auth repository adapter contract before routes adopt it.
import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresAuthRepository } from "./postgres-auth-repository.js";
import type { Queryable } from "../db/transactions.js";

class CapturingClient implements Queryable {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  nextRows: unknown[] = [];
  private queuedRows: unknown[][] = [];

  queueRows(...rowsByCall: unknown[][]) {
    this.queuedRows.push(...rowsByCall);
  }

  async query(sql: string, params: readonly unknown[] = []) {
    this.calls.push({ sql, params });
    const rows = this.queuedRows.length ? this.queuedRows.shift() ?? [] : this.nextRows;
    return { rows, rowCount: rows.length };
  }
}

const userRow = {
  id: "user-1",
  email: "owner@example.com",
  username: "owner_user",
  display_name: "Owner User",
  avatar_url: null,
  status: "active",
  email_verified: true,
  mfa_enabled: false,
  system_roles: ["super-admin"],
  password_hash: "hash",
  created_at: "2026-05-22T00:00:00.000Z",
  updated_at: "2026-05-22T00:00:00.000Z",
  last_login_at: null,
};

const sessionRow = {
  id: "session-1",
  user_id: "user-1",
  created_at: "2026-05-22T00:00:00.000Z",
  expires_at: "2999-05-22T00:00:00.000Z",
  last_seen_at: "2026-05-22T00:01:00.000Z",
  ip_address: "127.0.0.1",
  user_agent: "agent",
  revoked_at: null,
};

const projectRow = {
  id: "project-1",
  name: "Project One",
  description: null,
  visibility: "private",
  status: "active",
  owner_user_id: "user-1",
  created_at: "2026-05-22T00:00:00.000Z",
  updated_at: "2026-05-22T00:00:00.000Z",
};

const memberRow = {
  id: "member-1",
  project_id: "project-1",
  user_id: "user-1",
  email: "owner@example.com",
  display_name: "Owner User",
  role: "owner",
  status: "active",
  invited_by_user_id: null,
  invited_at: null,
  joined_at: "2026-05-22T00:00:00.000Z",
  created_at: "2026-05-22T00:00:00.000Z",
  updated_at: "2026-05-22T00:00:00.000Z",
};

const auditLogRow = {
  id: "audit-1",
  actor_user_id: "user-1",
  action: "project.create",
  target_type: "project",
  target_id: "project-1",
  outcome: "success",
  message: null,
  created_at: "2026-05-22T00:00:00.000Z",
};

test("postgres auth repository creates users with normalized email and JSON system roles", async () => {
  const client = new CapturingClient();
  client.nextRows = [userRow];

  const repository = createPostgresAuthRepository(client);
  const user = await repository.createUser({
    email: " Owner@Example.COM ",
    displayName: "Owner User",
    passwordHash: "hash",
    systemRoles: ["super-admin"],
  });

  assert.equal(user.email, "owner@example.com");
  assert.equal(user.displayName, "Owner User");
  assert.deepEqual(user.systemRoles, ["super-admin"]);
  assert.match(client.calls[0]?.sql ?? "", /insert into users/i);
  assert.doesNotMatch(client.calls[0]?.sql ?? "", /gen_random_uuid/i);
  assert.match(String(client.calls[0]?.params[0] ?? ""), /^[0-9a-f-]{36}$/i);
  assert.deepEqual(client.calls[0]?.params.slice(1, 6), [
    "owner@example.com",
    "owner",
    "Owner User",
    "hash",
    ["super-admin"],
  ]);
  assert.deepEqual(client.calls[0]?.params.slice(6, 8), [
    "active",
    true,
  ]);
});

test("postgres auth repository creates unverified users in pending email verification status", async () => {
  const client = new CapturingClient();
  client.nextRows = [{ ...userRow, status: "pending_email_verification", email_verified: false }];

  const repository = createPostgresAuthRepository(client);
  const user = await repository.createUser({
    email: "verify@example.com",
    displayName: "Verify User",
    passwordHash: "hash",
    emailVerified: false,
  });

  assert.equal(user?.status, "pending_email_verification");
  assert.equal(user?.emailVerified, false);
  assert.deepEqual(client.calls[0]?.params.slice(6, 8), [
    "pending_email_verification",
    false,
  ]);
});

test("postgres auth repository creates users with explicit username", async () => {
  const client = new CapturingClient();
  client.nextRows = [{ ...userRow, username: "owner_user" }];

  const repository = createPostgresAuthRepository(client);
  const user = await repository.createUser({
    email: " Owner@Example.COM ",
    username: "Owner_User",
    displayName: "Owner User",
    passwordHash: "hash",
    systemRoles: ["super-admin"],
  });

  assert.equal(user?.username, "owner_user");
  assert.equal(client.calls[0]?.params[2], "owner_user");
});

test("postgres auth repository returns null when unique user creation conflicts", async () => {
  const client = new CapturingClient();
  const repository = createPostgresAuthRepository(client);

  const user = await repository.createUser({
    email: "taken@example.com",
    displayName: "Taken User",
    passwordHash: "hash",
  });

  assert.equal(user, null);
});

test("postgres auth repository maps snake_case rows when finding users by email", async () => {
  const client = new CapturingClient();
  client.nextRows = [
    {
      id: "user-2",
      email: "viewer@example.com",
      username: "viewer_user",
      display_name: "Viewer",
      avatar_url: "https://example.com/avatar.png",
      status: "active",
      email_verified: false,
      mfa_enabled: false,
      system_roles: [],
      password_hash: "hash",
      created_at: "2026-05-22T00:00:00.000Z",
      updated_at: "2026-05-22T00:00:00.000Z",
      last_login_at: "2026-05-22T00:01:00.000Z",
    },
  ];

  const repository = createPostgresAuthRepository(client);
  const user = await repository.findUserByEmail(" Viewer@Example.COM ");

  assert.equal(user?.id, "user-2");
  assert.equal(user?.emailVerified, false);
  assert.equal(user?.lastLoginAt, "2026-05-22T00:01:00.000Z");
  assert.match(client.calls[0]?.sql ?? "", /where email = \$1/i);
  assert.equal(client.calls[0]?.params[0], "viewer@example.com");
});

test("postgres auth repository updates and lists users using auth store record shape", async () => {
  const client = new CapturingClient();
  client.queueRows(
    [{ ...userRow, display_name: "Updated Owner", avatar_url: "https://example.com/a.png" }],
    [userRow],
    [userRow],
  );

  const repository = createPostgresAuthRepository(client);
  const updated = await repository.updateUser("user-1", {
    displayName: "Updated Owner",
    avatarUrl: "https://example.com/a.png",
  });
  const byId = await repository.getUser("user-1");
  const users = await repository.listUsers();

  assert.equal(updated?.displayName, "Updated Owner");
  assert.equal(byId?.id, "user-1");
  assert.equal(users[0]?.email, "owner@example.com");
  assert.match(client.calls[0]?.sql ?? "", /update users/i);
  assert.match(client.calls[2]?.sql ?? "", /from users/i);
});

test("postgres auth repository creates sessions and revokes other active sessions", async () => {
  const client = new CapturingClient();
  client.queueRows([sessionRow], [], [sessionRow], [{ revoked_count: 2 }]);

  const repository = createPostgresAuthRepository(client);
  const session = await repository.createSession({
    userId: "user-1",
    ipAddress: "127.0.0.1",
    userAgent: "agent",
  });
  await repository.revokeSession("session-1");
  const active = await repository.getActiveSession("session-1");
  const revokedCount = await repository.revokeOtherSessions("user-1", "session-1");

  assert.equal(session.userId, "user-1");
  assert.equal(active?.id, "session-1");
  assert.equal(revokedCount, 2);
  assert.match(client.calls[0]?.sql ?? "", /insert into sessions/i);
  assert.match(client.calls[1]?.sql ?? "", /update sessions/i);
  assert.match(client.calls[2]?.sql ?? "", /revoked_at is null/i);
  assert.match(client.calls[3]?.sql ?? "", /id <> \$2/i);
});

test("postgres auth repository lists only active non-expired sessions for a user", async () => {
  const client = new CapturingClient();
  client.nextRows = [sessionRow];

  const repository = createPostgresAuthRepository(client);
  const sessions = await repository.listActiveSessionsForUser("user-1");

  assert.equal(sessions[0]?.id, "session-1");
  assert.match(client.calls[0]?.sql ?? "", /where user_id = \$1/i);
  assert.match(client.calls[0]?.sql ?? "", /expires_at > now\(\)/i);
});

test("postgres auth repository creates a project and owner membership together", async () => {
  const client = new CapturingClient();
  client.queueRows([projectRow], [userRow], [memberRow]);

  const repository = createPostgresAuthRepository(client);
  const result = await repository.createProject({
    ownerUserId: "user-1",
    name: "Project One",
    description: null,
    visibility: "private",
  });

  assert.equal(result.project.id, "project-1");
  assert.equal(result.ownerMember.role, "owner");
  assert.match(client.calls[0]?.sql ?? "", /insert into projects/i);
  assert.match(client.calls[1]?.sql ?? "", /from users/i);
  assert.match(client.calls[2]?.sql ?? "", /insert into project_members/i);
  assert.match(client.calls[3]?.sql ?? "", /insert into user_onboarding_state/i);
  assert.match(client.calls[3]?.sql ?? "", /where user_onboarding_state.first_project_id is null/i);
});

test("postgres onboarding writes only the selected tour outcome", async () => {
  const client = new CapturingClient();
  client.queueRows(
    [{ empty_workspace_status: null, first_project_status: null, first_project_id: "project-1" }],
    [{ empty_workspace_status: "skipped", first_project_status: null, first_project_id: "project-1" }],
  );
  const repository = createPostgresAuthRepository(client);
  assert.equal((await repository.getOnboardingState("user-1")).firstProjectId, "project-1");
  assert.equal((await repository.setOnboardingOutcome("user-1", "empty-workspace", "skipped")).emptyWorkspace, "skipped");
  assert.match(client.calls[1]?.sql ?? "", /set empty_workspace_status = excluded.empty_workspace_status/i);
  assert.doesNotMatch(client.calls[1]?.sql ?? "", /set first_project_status/i);
});

test("postgres auth repository reads, updates, and lists projects by membership", async () => {
  const client = new CapturingClient();
  client.queueRows([projectRow], [{ ...projectRow, status: "archived" }], [projectRow], [projectRow]);

  const repository = createPostgresAuthRepository(client);
  const project = await repository.getProject("project-1");
  const updated = await repository.updateProject("project-1", { status: "archived" });
  const userProjects = await repository.listProjectsForUser("user-1");
  const allProjects = await repository.listProjects();

  assert.equal(project?.ownerUserId, "user-1");
  assert.equal(updated?.status, "archived");
  assert.equal(userProjects[0]?.id, "project-1");
  assert.equal(allProjects[0]?.id, "project-1");
  assert.match(client.calls[2]?.sql ?? "", /join project_members/i);
  assert.match(client.calls[3]?.sql ?? "", /status <> 'deleted'/i);
});

test("postgres auth repository saves project workspace without issuing an empty project patch", async () => {
  const client = new CapturingClient();
  client.queueRows([
    {
      project_id: "project-1",
      version: 1,
      state: { requirementText: "Saved" },
      updated_by_user_id: "user-1",
      source_run_id: "run-1",
      updated_at: "2026-05-22T00:01:00.000Z",
    },
  ], []);

  const repository = createPostgresAuthRepository(client);
  const saved = await repository.saveProjectWorkspace({
    projectId: "project-1",
    baseVersion: 0,
    state: { requirementText: "Saved" },
    updatedByUserId: "user-1",
    sourceRunId: "run-1",
  });

  assert.equal(saved.ok, true);
  assert.match(client.calls[0]?.sql ?? "", /insert into project_workspace_states/i);
  assert.match(client.calls[1]?.sql ?? "", /update projects\s+set updated_at = now\(\)\s+where id = \$1/i);
  assert.deepEqual(client.calls[1]?.params, ["project-1"]);
});

test("postgres auth repository manages project members with normalized invite email", async () => {
  const client = new CapturingClient();
  client.queueRows(
    [{ ...memberRow, email: "invitee@example.com", role: "viewer", status: "invited" }],
    [memberRow],
    [memberRow],
    [memberRow],
    [memberRow],
    [memberRow],
    [{ owner_count: "1" }],
    [{ id: "member-1" }],
  );

  const repository = createPostgresAuthRepository(client);
  const created = await repository.createMember({
    projectId: "project-1",
    userId: null,
    email: " Invitee@Example.COM ",
    displayName: null,
    role: "viewer",
    status: "invited",
    invitedByUserId: "user-1",
    invitedAt: "2026-05-22T00:00:00.000Z",
    joinedAt: null,
  });
  const active = await repository.findProjectMember("project-1", "user-1");
  const byEmail = await repository.findProjectMemberByEmail("project-1", " Owner@Example.COM ");
  const byId = await repository.getMember("member-1");
  const listed = await repository.listProjectMembers("project-1");
  const updated = await repository.updateMember("member-1", { role: "editor" });
  const ownerCount = await repository.countOwners("project-1");
  const deleted = await repository.deleteMember("member-1");

  assert.equal(created.email, "invitee@example.com");
  assert.equal(active?.id, "member-1");
  assert.equal(byEmail?.id, "member-1");
  assert.equal(byId?.id, "member-1");
  assert.equal(listed[0]?.projectId, "project-1");
  assert.equal(updated?.role, "owner");
  assert.equal(ownerCount, 1);
  assert.equal(deleted, true);
  assert.match(client.calls[0]?.sql ?? "", /insert into project_members/i);
  assert.equal(client.calls[0]?.params[3], "invitee@example.com");
  assert.match(client.calls[7]?.sql ?? "", /delete from project_members/i);
});

test("postgres auth repository selects current user profile for bound project members", async () => {
  const client = new CapturingClient();
  client.nextRows = [
    {
      ...memberRow,
      display_name: "Renamed Profile",
      avatar_url: "https://example.com/current-avatar.png",
    },
  ];

  const repository = createPostgresAuthRepository(client);
  const member = await repository.findProjectMember("project-1", "user-1");

  assert.equal(member?.displayName, "Renamed Profile");
  assert.equal(member?.avatarUrl, "https://example.com/current-avatar.png");
  assert.match(client.calls[0]?.sql ?? "", /users\.display_name/i);
  assert.match(client.calls[0]?.sql ?? "", /coalesce/i);
});

test("postgres auth repository records audit logs and checks system roles", async () => {
  const client = new CapturingClient();
  client.queueRows([auditLogRow], [{ has_role: true }]);

  const repository = createPostgresAuthRepository(client);
  const auditLog = await repository.recordAuditLog({
    actorUserId: "user-1",
    action: "project.create",
    targetType: "project",
    targetId: "project-1",
    outcome: "success",
  });
  const hasRole = await repository.userHasSystemRole("user-1", ["super-admin"]);

  assert.equal(auditLog.id, "audit-1");
  assert.equal(repository.auditLogs[0]?.action, "project.create");
  assert.equal(hasRole, true);
  assert.match(client.calls[0]?.sql ?? "", /insert into audit_logs/i);
  assert.match(client.calls[1]?.sql ?? "", /system_roles && \$2/i);
});
