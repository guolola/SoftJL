// Rejects invalid dashboard rates, statuses and timestamps at the shared API boundary.
import assert from "node:assert/strict";
import test from "node:test";
import { dashboardRunSchema } from "./dashboard.js";
test("dashboard task summaries preserve absent timestamps and reject invalid lifecycle values", () => {
  const run = { runId: "r", projectId: "p", runKind: "feasibility", status: "queued", model: null, createdAt: null, startedAt: null, completedAt: null };
  assert.equal(dashboardRunSchema.parse(run).startedAt, null);
  assert.equal(dashboardRunSchema.safeParse({ ...run, status: "invented" }).success, false);
  assert.equal(dashboardRunSchema.safeParse({ ...run, startedAt: "invalid" }).success, false);
});
