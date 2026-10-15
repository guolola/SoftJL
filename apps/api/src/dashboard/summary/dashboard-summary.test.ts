// Covers aggregation scope, task outcomes, calendar boundaries and missing timing data.
import assert from "node:assert/strict";
import test from "node:test";
import { dashboardSummarySchema, type DashboardRun } from "@uml-platform/contracts";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { buildDashboardSummary, dashboardRunFromRecord } from "./dashboard-summary.js";
import { createEmptySnapshot } from "../../runs/records/snapshots.js";

const now = new Date("2026-10-05T00:30:00+08:00");
function fixture() {
  const store = createInMemoryAuthStore();
  const user = store.createUser({ email: "dashboard@example.test", displayName: "Dashboard", passwordHash: "test" })!;
  const sources = Array.from({ length: 7 }, (_, i) => {
    const { project } = store.createProject({ ownerUserId: user.id, name: `Project ${i}`, description: null, visibility: "private" });
    if (i === 6) project.status = "archived";
    return { project, owner: user, members: store.listProjectMembers(project.id), documents: [{ id: "doc-1", status: "active" as const, documentKind: "requirementsSpec" as const }, { id: "doc-1", status: "active" as const, documentKind: "requirementsSpec" as const }, { id: "doc-2", status: "deleted" as const, documentKind: "requirementsSpec" as const }] };
  });
  return { store, user, sources };
}
function run(projectId: string, status: DashboardRun["status"], patch: Partial<DashboardRun> = {}): DashboardRun {
  return { runId: `${projectId}-${status}`, projectId, status, runKind: "requirements", model: " model-a ", createdAt: "2026-10-04T16:10:00Z", startedAt: "2026-10-04T16:11:00Z", completedAt: "2026-10-04T16:12:00Z", ...patch };
}
test("all projects including the seventh and archived project participate; identities and documents are deduplicated", () => {
  const { user, sources } = fixture();
  const runs = sources.map(source => run(source.project.id, "completed"));
  runs.push(run("unauthorized", "completed", { model: "private-model" }));
  const summary = dashboardSummarySchema.parse(buildDashboardSummary(user, sources, runs, now));
  assert.equal(summary.totals.projects, 7);
  assert.equal(summary.totals.completed, 7);
  assert.equal(summary.totals.models, 1);
  assert.equal(summary.totals.members, 1);
  assert.equal(summary.projects.find(project => project.status === "archived")?.runs, 1);
  assert.ok(summary.projects.every(project => project.documents === 1 && project.averageDurationMs === 60000));
  assert.equal(summary.recentRuns.length, 5);
});
test("success uses only terminal tasks; no terminal tasks and missing/invalid durations remain null", () => {
  const { user, sources } = fixture(); const id = sources[0].project.id;
  const runs = (["completed", "failed", "cancelled", "queued", "running"] as const).map(status => run(id, status));
  runs[0].startedAt = null;
  const summary = buildDashboardSummary(user, sources, runs, now);
  assert.equal(summary.totals.successRate, 33.3);
  assert.equal(summary.totals.active, 2);
  assert.equal(summary.projects.find(project => project.id === id)?.averageDurationMs, null);
  assert.equal(summary.projects.find(project => project.id !== id)?.successRate, null);
  const reversed = buildDashboardSummary(user, sources, [run(id, "completed", { completedAt: "2026-10-04T15:00:00Z" })], now);
  assert.equal(reversed.projects.find(project => project.id === id)?.averageDurationMs, null);
});
test("task successes alone do not mark an entire module complete without current outputs", () => {
  const { user, sources } = fixture();
  for (const source of sources) source.documents = [];
  const id = sources[0].project.id;
  const runs = [run(id, "completed", { runKind: "feasibility" }), run(id, "completed"),
    run(id, "completed", { runId: "retry" }), run(id, "failed"),
    run(id, "running", { runKind: "design" }), run(id, "cancelled", { runKind: "document" }),
    run(id, "queued", { runKind: "design" }), run("unauthorized", "completed", { runKind: "design" })];
  const summary = dashboardSummarySchema.parse(buildDashboardSummary(user, sources, runs, now));
  assert.deepEqual(summary.projects.find(project => project.id === id)?.progress, {
    completed: 0, total: 20, percentage: 0, stages: [
      { kind: "feasibility", completed: 0, total: 3 }, { kind: "requirements", completed: 0, total: 7 },
      { kind: "design", completed: 0, total: 7 }, { kind: "document", completed: 0, total: 3 },
    ],
  });
  assert.equal(summary.projects.find(project => project.id === sources[1].project.id)?.progress?.percentage, 0);
});
test("existing documents complete the specification stage; deleted documents and deleted projects do not participate", () => {
  const { user, sources } = fixture();
  sources[1].documents = [{ id: "deleted", status: "deleted", documentKind: "requirementsSpec" }];
  sources[2].project.status = "deleted";
  const summary = buildDashboardSummary(user, sources, [run(sources[2].project.id, "completed")], now);
  assert.equal(summary.projects.find(project => project.id === sources[0].project.id)?.progress?.percentage, 5);
  assert.equal(summary.projects.find(project => project.id === sources[1].project.id)?.progress?.percentage, 0);
  assert.ok(!summary.projects.some(project => project.id === sources[2].project.id));
});
test("Hong Kong month/day boundaries and Monday week include feasibility and zero buckets", () => {
  const { user, sources } = fixture(); const id = sources[0].project.id;
  const summary = buildDashboardSummary(user, sources, [run(id, "completed", { runKind: "feasibility" }), run(id, "failed", { createdAt: "2026-09-30T16:00:00Z" })], now);
  assert.equal(summary.monthly.at(-1)?.runs, 2);
  assert.equal(summary.daily.at(-1)?.key, "2026-10-05");
  assert.equal(summary.daily.at(-1)?.runs, 1);
  assert.equal(summary.weekly.days[0].key, "2026-10-05");
  assert.equal(summary.weekly.requirements, 1);
  assert.equal(summary.weekly.total, 1);
  assert.equal(summary.weekly.days[6].runs, 0);
  assert.equal(summary.monthly[0].runs, 0);
  assert.equal(summary.monthly[0].successRate, null);
});
test("missing start timestamps are never replaced with queued time", () => {
  const snapshot = createEmptySnapshot("r", "req", []); snapshot.status = "completed";
  const base = { snapshot, listeners: new Set(), terminal: true, metadata: { projectId: "p", createdAt: "2026-10-01T00:00:00Z", completedAt: "2026-10-01T01:00:00Z" } };
  assert.equal(dashboardRunFromRecord({ ...base, events: [] })?.startedAt, null);
  assert.equal(dashboardRunFromRecord({ ...base, events: [{ type: "stage_started", stage: "generate_models", message: "start" }], eventCreatedAt: ["2026-10-01T00:30:00Z"] })?.startedAt, "2026-10-01T00:30:00.000Z");
});
test("concrete artifact averages are isolated by project and identity and exclude invalid samples", () => {
  const { user, sources } = fixture(); const id = sources[0].project.id;
  const artifact = { artifactId: "doc-a", artifactType: "document:requirementsSpec", name: "需求说明书.docx", startedAt: "2026-10-04T16:11:00Z", completedAt: "2026-10-04T16:12:00Z" };
  const runs = [run(id, "completed", { runId: "first", artifactTimings: [artifact] }),
    run(id, "completed", { runId: "retry", artifactTimings: [{ ...artifact, completedAt: "2026-10-04T16:13:00Z" }] }),
    run(id, "completed", { runId: "legacy", artifactTimings: [{ ...artifact, startedAt: null }] }),
    run(sources[1].project.id, "completed", { artifactTimings: [artifact] }),
    run("private", "completed", { artifactTimings: [artifact] })];
  const summary = buildDashboardSummary(user, sources, runs, now);
  assert.equal(summary.artifactDurations.length, 2);
  assert.equal(summary.artifactDurations.find(item => item.projectId === id)?.averageDurationMs, 90000);
  assert.equal(summary.artifactDurations.find(item => item.projectId === id)?.samples, 2);
});
