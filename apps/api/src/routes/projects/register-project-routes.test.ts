// Verifies project invitation tokens from issue to acceptance without touching auth routes.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  createInMemoryAuthStore,
  type AuthStore,
} from "../../auth/in-memory-auth-store.js";
import { registerProjectRoutes } from "./register-project-routes.js";
import {
  createRunRecordStore,
  type RunRecordStore,
} from "../../runs/records/run-record-store.js";

async function createTestApp() {
  const app = Fastify();
  const authStore = createInMemoryAuthStore();
  registerProjectRoutes({
    app,
    authStore,
  });
  return { app, authStore };
}


async function registerUser(input: {
  authStore: AuthStore;
  username: string;
  displayName: string;
}) {
  const user = await input.authStore.createUser({
    username: input.username,
    displayName: input.displayName,
    passwordHash: "test-password-hash",
  });
  assert.ok(user);
  const session = await input.authStore.createSession({
    userId: user.id,
    ipAddress: "127.0.0.1",
    userAgent: "node:test",
  });

  return {
    user,
    cookie: `uml_session=${encodeURIComponent(session.id)}`,
  };
}

async function createProject(input: {
  app: Awaited<ReturnType<typeof createTestApp>>["app"];
  cookie: string;
  name?: string;
  payload?: Record<string, unknown>;
}) {
  const response = await input.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie: input.cookie },
    payload: {
      name: input.name ?? "Invitation Project",

      ...input.payload,
    },
  });

  assert.equal(response.statusCode, 201);
  return response.json().project as { id: string; name: string };
}

test("invitee search returns public registered identities and enforces invitation access", async (t) => {
  const { app, authStore } = await createTestApp();
  t.after(() => app.close());
  const owner = await registerUser({ authStore, username: "search_owner", displayName: "Search Owner" });
  const alice = await registerUser({ authStore, username: "alice", displayName: "Search Alice" });
  const existing = await registerUser({ authStore, username: "existing", displayName: "Search Existing" });
  const viewer = await registerUser({ authStore, username: "viewer", displayName: "Viewer" });
  const outsider = await registerUser({ authStore, username: "outsider", displayName: "Outsider" });
  await authStore.createUser({ username: "disabled", displayName: "Search Disabled", passwordHash: "secret", status: "disabled" });
  const project = await createProject({ app, cookie: owner.cookie });
  for (const [user, role, status] of [[existing.user, "editor", "invited"], [viewer.user, "viewer", "active"]] as const) {
    await authStore.createMember({ projectId: project.id, userId: user.id, username: user.username, displayName: user.displayName, role, status, invitedByUserId: owner.user.id, invitedAt: null, joinedAt: null });
  }
  const search = (query: string, cookie = owner.cookie) => app.inject({ method: "GET", url: `/api/projects/${project.id}/invitees?query=${encodeURIComponent(query)}`, headers: { cookie } });
  const response = await search(" SEARCH ");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().users, [{ id: alice.user.id, username: "alice", displayName: "Search Alice", avatarUrl: alice.user.avatarUrl }]);
  assert.deepEqual((await search("ALIC")).json().users, response.json().users);
  assert.deepEqual((await search(" ")).json().users, []);
  assert.equal((await search("a".repeat(65))).statusCode, 400);
  assert.equal((await search("search", viewer.cookie)).statusCode, 403);
  assert.equal((await search("search", outsider.cookie)).statusCode, 403);
  assert.equal((await search("search", "")).statusCode, 401);
  // The autocomplete must stay bounded even when a broad query matches many users.
  for (let index = 0; index < 22; index++) {
    await authStore.createUser({ username: `candidate_${index}`, displayName: "Candidate", passwordHash: "secret" });
  }
  assert.equal((await search("candidate")).json().users.length, 20);
});

test("project execution mode is read-only and reflects server demo configuration", async (t) => {
  for (const key of ["UML_DEMO_OFFLINE_PROJECT_IDS", "UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS"]) {
    const previous = process.env[key];
    delete process.env[key];
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const { app, authStore } = await createTestApp();
  t.after(() => app.close());
  const { cookie } = await registerUser({ authStore, username: "mode", displayName: "Mode" });
  const forged = await app.inject({ method: "POST", url: "/api/projects", headers: { cookie }, payload: { name: "Library Demo", generationExecutionMode: "offline-demo" } });
  assert.equal(forged.statusCode, 400);
  const project = await createProject({ app, cookie, name: "Library Demo" });
  const read = () => app.inject({ method: "GET", url: `/api/projects/${project.id}`, headers: { cookie } });
  assert.equal((await read()).json().generationExecutionMode, "provider");
  process.env.UML_DEMO_OFFLINE_PROJECT_IDS = project.id;
  assert.equal((await read()).json().generationExecutionMode, "offline-demo");
  delete process.env.UML_DEMO_OFFLINE_PROJECT_IDS;
  process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS = "Library Demo";
  assert.equal((await read()).json().generationExecutionMode, "offline-demo");
  const updated = await app.inject({ method: "PATCH", url: `/api/projects/${project.id}`, headers: { cookie }, payload: { name: "Real Project", generationExecutionMode: "offline-demo" } });
  assert.equal(updated.statusCode, 400);
  await app.inject({ method: "PATCH", url: `/api/projects/${project.id}`, headers: { cookie }, payload: { name: "Real Project" } });
  assert.equal((await read()).json().generationExecutionMode, "provider");
});

test("retired history restore endpoint returns 404 without changing workspace", async () => {
  const { app, authStore } = await createTestApp();
  const owner = await registerUser({ authStore, username: "history_owner", displayName: "History Owner" });
  const project = await createProject({ app, cookie: owner.cookie, name: "History Project" });
  const before = await authStore.getProjectWorkspace(project.id);
  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${project.id}/runs/old-run/restore-workspace`,
    headers: { cookie: owner.cookie },
    payload: { mode: "restore" },
  });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(await authStore.getProjectWorkspace(project.id), before);
  await app.close();
});

test("workspace reads reject obsolete persisted artifacts without rewriting storage", async (t) => {
  const { app, authStore } = await createTestApp();
  t.after(() => app.close());
  const owner = await registerUser({ authStore, username: "invalid_workspace", displayName: "Owner" });
  const project = await createProject({ app, cookie: owner.cookie });
  const state = { rules: [], models: { usecase: { diagramKind: "usecase", title: "obsolete" } } };
  await authStore.saveProjectWorkspace({ projectId: project.id, baseVersion: 0, state, updatedByUserId: owner.user.id });
  const before = structuredClone(await authStore.getProjectWorkspace(project.id));
  const response = await app.inject({ method: "GET", url: `/api/projects/${project.id}/workspace`, headers: { cookie: owner.cookie } });
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "RESOURCE_CONFLICT");
  assert.deepEqual(await authStore.getProjectWorkspace(project.id), before);
});

test("workspace writes reject obsolete non-model payloads even when rules are omitted", async (t) => {
  const { app, authStore } = await createTestApp();
  t.after(() => app.close());
  const owner = await registerUser({ authStore, username: "invalid_facts", displayName: "Owner" });
  const project = await createProject({ app, cookie: owner.cookie });
  for (const state of [{ requirementBaseline: { requirements: [] } }, { feasibilityImplementationPlan: { architecture: {} } }]) {
    const response = await app.inject({ method: "PUT", url: `/api/projects/${project.id}/workspace`, headers: { cookie: owner.cookie }, payload: { baseVersion: 0, state } });
    assert.equal(response.statusCode, 400);
    assert.equal((await authStore.getProjectWorkspace(project.id)).version, 0);
  }
});

test("project governance actions archive restore retention and transfer ownership with audit", async () => {
  const { app, authStore } = await createTestApp();
  const owner = await registerUser({
    authStore,
    username: "governance_owner",
    displayName: "Governance Owner",
  });
  const nextOwner = await registerUser({
    authStore,
    username: "governance_next",
    displayName: "Governance Next",
  });
  const project = await createProject({ app, cookie: owner.cookie, name: "Governance Project" });

  const member = await app.inject({
    method: "POST",
    url: `/api/projects/${project.id}/members`,
    headers: { cookie: owner.cookie },
    payload: { username: nextOwner.user.username, role: "editor" },
  });
  assert.equal(member.statusCode, 201);

  const archived = await app.inject({
    method: "POST",
    url: `/api/projects/${project.id}/archive`,
    headers: { cookie: owner.cookie },
  });
  assert.equal(archived.statusCode, 200);
  assert.equal(archived.json().project.status, "archived");
  assert.equal(archived.json().message, "Project archived");

  const restored = await app.inject({
    method: "POST",
    url: `/api/projects/${project.id}/restore`,
    headers: { cookie: owner.cookie },
  });
  assert.equal(restored.statusCode, 200);
  assert.equal(restored.json().project.status, "active");

  const retention = await app.inject({
    method: "PATCH",
    url: `/api/projects/${project.id}/retention-policy`,
    headers: { cookie: owner.cookie },
    payload: { retentionPolicy: "semester_180_days" },
  });
  assert.equal(retention.statusCode, 200);
  assert.equal(retention.json().project.retentionPolicy, "semester_180_days");

  const transferred = await app.inject({
    method: "POST",
    url: `/api/projects/${project.id}/transfer-owner`,
    headers: { cookie: owner.cookie },
    payload: { newOwnerUserId: nextOwner.user.id },
  });
  assert.equal(transferred.statusCode, 200);
  assert.equal(transferred.json().project.ownerUserId, nextOwner.user.id);
  assert.equal(transferred.json().message, "Project owner transferred");

  const logs = await authStore.listAuditLogs();
  assert.deepEqual(
    logs
      .map((entry) => entry.action)
      .filter((action) => action.startsWith("project."))
      .slice(-4),
    [
      "project.archive",
      "project.restore",
      "project.retention_policy.update",
      "project.transfer_owner",
    ],
  );

  await app.close();
});

test("project workspace persists shared state with optimistic version conflicts", async () => {
  const { app, authStore } = await createTestApp();
  const owner = await registerUser({
    authStore,
    username: "workspace_owner",
    displayName: "Workspace Owner",
  });
  const viewer = await registerUser({
    authStore,
    username: "workspace_viewer",
    displayName: "Workspace Viewer",
  });
  const project = await createProject({ app, cookie: owner.cookie, name: "Workspace Project" });
  authStore.createMember({
    projectId: project.id,
    userId: viewer.user.id,
    username: viewer.user.username,
    displayName: viewer.user.displayName,
    role: "viewer",
    status: "active",
    invitedByUserId: owner.user.id,
    invitedAt: new Date().toISOString(),
    joinedAt: new Date().toISOString(),
  });

  const initial = await app.inject({
    method: "GET",
    url: `/api/projects/${project.id}/workspace`,
    headers: { cookie: owner.cookie },
  });
  assert.equal(initial.statusCode, 200);
  assert.equal(initial.json().version, 0);
  assert.deepEqual(initial.json().state.requirementText, "");

  const saved = await app.inject({
    method: "PUT",
    url: `/api/projects/${project.id}/workspace`,
    headers: { cookie: owner.cookie },
    payload: {
      baseVersion: 0,
      state: {
        requirementText: "FR1. 日历仅供公众使用。",
        rules: [{ id: "FR1", text: "日历仅供公众使用。", type: "business-rule" as const,  }],
        selectedDiagramTypes: ["usecase"],
      },
      sourceRunId: "run-requirements-1",
    },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().version, 1);
  assert.equal(saved.json().state.requirementText, "FR1. 日历仅供公众使用。");
  assert.equal(saved.json().updatedByUserId, owner.user.id);

  const stale = await app.inject({
    method: "PUT",
    url: `/api/projects/${project.id}/workspace`,
    headers: { cookie: owner.cookie },
    payload: {
      baseVersion: 0,
      state: { requirementText: "过期编辑" },
    },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().error.details.currentVersion, 1);

  const viewerSave = await app.inject({
    method: "PUT",
    url: `/api/projects/${project.id}/workspace`,
    headers: { cookie: viewer.cookie },
    payload: {
      baseVersion: 1,
      state: { requirementText: "viewer 不能保存" },
    },
  });
  assert.equal(viewerSave.statusCode, 403);

  const logs = await authStore.listAuditLogs();
  assert.ok(logs.some((entry) => entry.action === "project.workspace.update"));

  await app.close();
});

test("project workspace save reports invalid source run ids as bad requests", async () => {
  const { app, authStore } = await createTestApp();
  const owner = await registerUser({
    authStore,
    username: "workspace_source_owner",
    displayName: "Workspace Source Owner",
  });
  const project = await createProject({ app, cookie: owner.cookie, name: "Workspace Source Project" });
  authStore.saveProjectWorkspace = async () => {
    const error = new Error("violates foreign key constraint");
    Object.assign(error, {
      code: "23503",
      constraint: "project_workspace_states_source_run_id_fkey",
    });
    throw error;
  };

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${project.id}/workspace`,
    headers: { cookie: owner.cookie },
    payload: {
      baseVersion: 0,
      state: { requirementText: "invalid source run" },
      sourceRunId: "missing-run",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "VALIDATION_FAILED");
  await app.close();
});


test("project governance actions require owner-level project settings permission", async () => {
  const { app, authStore } = await createTestApp();
  const owner = await registerUser({
    authStore,
    username: "settings_owner",
    displayName: "Settings Owner",
  });
  const editor = await registerUser({
    authStore,
    username: "settings_editor",
    displayName: "Settings Editor",
  });
  const project = await createProject({ app, cookie: owner.cookie, name: "Settings Project" });
  await app.inject({
    method: "POST",
    url: `/api/projects/${project.id}/members`,
    headers: { cookie: owner.cookie },
    payload: { username: editor.user.username, role: "editor" },
  });

  const archived = await app.inject({
    method: "POST",
    url: `/api/projects/${project.id}/archive`,
    headers: { cookie: editor.cookie },
  });
  assert.equal(archived.statusCode, 403);

  await app.close();
});

test("project create and update reject retired fields and preserve current settings", async () => {
  const { app, authStore } = await createTestApp();
  const owner = await registerUser({
    authStore,
    username: "owner",
    displayName: "Owner User",
  });
  const retiredCreate = await app.inject({ method: "POST", url: "/api/projects", headers: { cookie: owner.cookie }, payload: { name: "旧配置", defaultProviderConfigId: "provider-1" } });
  assert.equal(retiredCreate.statusCode, 400);

  for (const field of ["organizationId", "courseId", "classId", "teamId"]) {
    const response = await app.inject({ method: "POST", url: "/api/projects", headers: { cookie: owner.cookie }, payload: { name: "旧归属", [field]: "retired-id" } });
    assert.equal(response.statusCode, 400, field);
  }
  const removedOptions = await app.inject({ method: "GET", url: "/api/academic-options", headers: { cookie: owner.cookie } });
  assert.equal(removedOptions.statusCode, 404);
  const created = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie: owner.cookie },
    payload: {
      name: "协作项目",
      description: "通过项目成员共同协作",

      backgroundKey: "booking",
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal("defaultProviderConfigId" in created.json().project, false);
  assert.equal(created.json().project.backgroundKey, "booking");
  for (const field of ["organizationId", "courseId", "classId", "teamId"]) {
    assert.equal(field in created.json().project, false);
    const response = await app.inject({ method: "PATCH", url: `/api/projects/${created.json().project.id}`, headers: { cookie: owner.cookie }, payload: { [field]: "retired-id" } });
    assert.equal(response.statusCode, 400, field);
  }
  const retiredVisibility = await app.inject({ method: "PATCH", url: `/api/projects/${created.json().project.id}`, headers: { cookie: owner.cookie }, payload: {  } });
  assert.equal(retiredVisibility.statusCode, 400);
  const retiredUpdate = await app.inject({ method: "PATCH", url: `/api/projects/${created.json().project.id}`, headers: { cookie: owner.cookie }, payload: { defaultProviderConfigId: "provider-2" } });
  assert.equal(retiredUpdate.statusCode, 400);

  const updated = await app.inject({
    method: "PATCH",
    url: `/api/projects/${created.json().project.id}`,
    headers: { cookie: owner.cookie },
    payload: {
      backgroundKey: "quality_traceability",
    },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal("defaultProviderConfigId" in updated.json().project, false);
  assert.equal(updated.json().project.backgroundKey, "quality_traceability");

  const automatic = await app.inject({
    method: "PATCH",
    url: `/api/projects/${created.json().project.id}`,
    headers: { cookie: owner.cookie },
    payload: {
      backgroundKey: null,
    },
  });
  assert.equal(automatic.statusCode, 200);
  assert.equal(automatic.json().project.backgroundKey, null);

  await app.close();
});

test("project background key rejects unknown template ids", async () => {
  const { app, authStore } = await createTestApp();
  const owner = await registerUser({
    authStore,
    username: "background_owner",
    displayName: "Background Owner",
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie: owner.cookie },
    payload: {
      name: "非法背景项目",

      backgroundKey: "unknown-template",
    },
  });

  assert.equal(response.statusCode, 400);
  await app.close();
});

test("project list includes owner identity and active member previews", async () => {
  const { app, authStore } = await createTestApp();
  const owner = await registerUser({
    authStore,
    username: "list_owner",
    displayName: "List Owner",
  });
  const editor = await registerUser({
    authStore,
    username: "list_editor",
    displayName: "List Editor",
  });
  const viewer = await registerUser({
    authStore,
    username: "list_viewer",
    displayName: "List Viewer",
  });
  const observer = await registerUser({
    authStore,
    username: "list_observer",
    displayName: "List Observer",
  });
  const project = await createProject({
    app,
    cookie: owner.cookie,
    name: "Member Preview Project",
    payload: { backgroundKey: "project_management" },
  });
  authStore.createMember({
    projectId: project.id,
    userId: editor.user.id,
    username: editor.user.username,
    displayName: editor.user.displayName,
    avatarUrl: null,
    role: "editor",
    status: "active",
    invitedByUserId: owner.user.id,
    invitedAt: new Date().toISOString(),
    joinedAt: new Date().toISOString(),
  });
  authStore.createMember({
    projectId: project.id,
    userId: viewer.user.id,
    username: viewer.user.username,
    displayName: viewer.user.displayName,
    avatarUrl: null,
    role: "viewer",
    status: "active",
    invitedByUserId: owner.user.id,
    invitedAt: new Date().toISOString(),
    joinedAt: new Date().toISOString(),
  });
  authStore.createMember({
    projectId: project.id,
    userId: observer.user.id,
    username: observer.user.username,
    displayName: observer.user.displayName,
    avatarUrl: null,
    role: "viewer",
    status: "active",
    invitedByUserId: owner.user.id,
    invitedAt: new Date().toISOString(),
    joinedAt: new Date().toISOString(),
  });
  authStore.createMember({
    projectId: project.id,
    userId: null,
    username: "pending",
    displayName: null,
    avatarUrl: null,
    role: "viewer",
    status: "invited",
    invitedByUserId: owner.user.id,
    invitedAt: new Date().toISOString(),
    joinedAt: null,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/projects",
    headers: { cookie: owner.cookie },
  });

  assert.equal(response.statusCode, 200, response.body);
  const listedProject = response
    .json()
    .projects.find((item: { id: string }) => item.id === project.id);
  assert.ok(listedProject);
  assert.equal(listedProject.ownerDisplayName, "List Owner");
  assert.equal(listedProject.backgroundKey, "project_management");
  assert.equal(listedProject.memberCount, 4);
  assert.equal(listedProject.memberPreviews.length, 3);
  assert.deepEqual(
    listedProject.memberPreviews.map((member: { displayName: string | null }) => member.displayName),
    ["List Owner", "List Editor", "List Viewer"],
  );

  await app.close();
});
