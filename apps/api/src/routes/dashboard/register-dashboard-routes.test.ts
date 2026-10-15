// Verifies that dashboard summaries require a session and never leak other users' project activity.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { createRunRecordStore } from "../../runs/records/run-record-store.js";
import { createEmptySnapshot } from "../../runs/records/snapshots.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import { registerDashboardRoutes } from "./register-dashboard-routes.js";

test("requires login and aggregates only active memberships, including archived projects", async t => {
  const app = Fastify(); t.after(() => app.close());
  const authStore = createInMemoryAuthStore(); const runs = createRunRecordStore();
  const documentCalls: string[] = [];
  const documentLibrary = { async listAllDocuments(options: { projectId: string }) { documentCalls.push(options.projectId); return []; } } as unknown as DocumentLibrary;
  registerDashboardRoutes({ app, authStore, runs, documentLibrary });
  assert.equal((await app.inject({ url: "/api/dashboard/summary" })).statusCode, 401);
  const user = authStore.createUser({ email: "reader@example.test", displayName: "Reader", passwordHash: "test" })!;
  const other = authStore.createUser({ email: "other@example.test", displayName: "Other", passwordHash: "test" })!;
  const session = authStore.createSession({ userId: user.id, ipAddress: null, userAgent: null });
  const projects = Array.from({ length: 8 }, (_, i) => authStore.createProject({ ownerUserId: i === 7 ? other.id : user.id, name: `P${i}`, description: null, visibility: "private" }).project);
  projects[6].status = "archived";
  authStore.saveProjectWorkspace({ projectId: projects[0].id, baseVersion: 0, updatedByUserId: user.id,
    state: { models: { "analysis:a": { diagramKind: "analysis" }, "analysis:b": { diagramKind: "analysis" }, usecase: { diagramKind: "usecase" } } } });
  for (const project of projects) {
    const snapshot = createEmptySnapshot(project.id, "requirements", []); snapshot.status = "completed";
    runs.set(project.id, { snapshot, events: [], terminal: true, listeners: new Set(), metadata: { projectId: project.id, createdAt: "2026-10-01T00:00:00Z" } });
  }
  const response = await app.inject({ url: "/api/dashboard/summary", headers: { cookie: `uml_session=${session.id}` } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.json().totals.projects, 7);
  assert.equal(response.json().totals.completed, 7);
  const progress = response.json().projects.find((project: { id: string }) => project.id === projects[0].id).progress;
  assert.equal(progress.completed, 2);
  assert.equal(progress.total, 20);
  assert.equal(progress.percentage, 10);
  assert.equal(response.json().projects.find((project: { id: string }) => project.id === projects[6].id).progress.completed, 0);
  assert.ok(!documentCalls.includes(projects[7].id));
  assert.ok(!response.body.includes(projects[7].id));
  authStore.updateMember(authStore.findProjectMember(projects[0].id, user.id)!.id, { status: "invited" });
  const changed = await app.inject({ url: "/api/dashboard/summary", headers: { cookie: `uml_session=${session.id}` } });
  assert.equal(changed.json().totals.projects, 6);
});
