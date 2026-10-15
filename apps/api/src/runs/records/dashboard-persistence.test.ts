// Exercises the dashboard projection against PostgreSQL-compatible SQL after external writes.
import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Queryable } from "../../db/transactions.js";
import { createPostgresRunRecordStore } from "./postgres-run-record-store.js";
import { createEmptySnapshot } from "./snapshots.js";

test("dashboard reads persisted tasks absent from the process map without hydrating snapshots", async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create table run_records (id text primary key, user_id text, project_id text, source_run_id text,
      source_action text, source_run_status text, snapshot jsonb, status text, stage text, model text,
      provider_config_id text, error_message text, error jsonb, error_code text, created_at timestamptz, completed_at timestamptz);
    create table run_events (run_id text, sequence integer, payload jsonb, created_at timestamptz);
  `);
  const store = await createPostgresRunRecordStore(db as unknown as Queryable);
  const snapshot = createEmptySnapshot("persisted", "req", []);
  for (const [id, project, status, completed] of [["persisted", "visible", "completed", "2026-10-01T00:03:00Z"], ["other", "private", "failed", "2026-10-01T00:04:00Z"], ["missing-start", "visible", "cancelled", "2026-10-01T00:05:00Z"]]) {
    await db.query(`insert into run_records(id, project_id, snapshot, status, stage, model, created_at, completed_at) values($1,$2,$3,$4,'queued','model-a','2026-10-01T00:00:00Z',$5)`, [id, project, JSON.stringify({ ...snapshot, runId: id }), status, completed]);
  }
  await db.query(`insert into run_events values('persisted',1,'{"type":"stage_started"}','2026-10-01T00:01:00Z')`);
  await db.query(`update run_records set snapshot = snapshot || '{"models":[{"modelId":"order-class","diagramKind":"class","title":"订单类图"}]}'::jsonb where id='persisted'`);
  await db.query(`insert into run_events values
    ('persisted',2,'{"type":"stage_progress","stage":"generate_models","subtaskId":"class","diagramKind":"class","subtaskStatus":"running"}','2026-10-01T00:01:10Z'),
    ('persisted',3,'{"type":"artifact_ready","stage":"generate_models","artifactKind":"model","subtaskId":"class","diagramKind":"class","subtaskStatus":"completed"}','2026-10-01T00:02:10Z')`);
  await db.query(`insert into run_records(id,project_id,snapshot,status,stage,created_at,completed_at) values
    ('document','visible','{"documentId":"doc-a","documentKind":"softwareDesignSpec","fileName":"设计说明书.docx"}','completed','render_document_file','2026-10-01T00:00:00Z','2026-10-01T00:02:00Z'),
    ('legacy-model','visible','{"models":[{"modelId":"legacy-class","diagramKind":"class","title":"旧类模型"}]}','completed','generate_models','2026-10-01T00:00:00Z','2026-10-01T00:02:00Z')`);
  await db.query(`insert into run_events values
    ('document',1,'{"type":"stage_started","stage":"generate_document_text"}','2026-10-01T00:01:00Z'),
    ('document',2,'{"type":"artifact_ready","stage":"render_document_file","artifactKind":"document"}','2026-10-01T00:02:00Z'),
    ('legacy-model',1,'{"type":"run_activity","stage":"generate_models","callId":"legacy-call","subtaskId":"legacy-class","phase":"started"}','2026-10-01T00:00:10Z'),
    ('legacy-model',2,'{"type":"run_activity","stage":"generate_models","callId":"legacy-call","subtaskId":"legacy-class","phase":"completed"}','2026-10-01T00:00:20Z'),
    ('legacy-model',3,'{"type":"artifact_ready","stage":"generate_models","artifactKind":"model"}','2026-10-01T00:00:30Z')`);
  const summaries = await store.listDashboardRuns!(["visible"]);
  assert.equal(store.size, 0);
  assert.equal(summaries.length, 4);
  const persisted = summaries.find(run => run.runId === "persisted")!;
  assert.equal(persisted.status, "completed");
  assert.equal(persisted.runKind, "requirements");
  assert.equal(persisted.startedAt, "2026-10-01T00:01:00.000Z");
  assert.deepEqual(persisted.artifactTimings, [{ artifactId: "order-class", artifactType: "requirements:class", name: "订单类图",
    startedAt: "2026-10-01T00:01:10.000Z", completedAt: "2026-10-01T00:02:10.000Z" }]);
  assert.equal(summaries.find(run => run.runId === "missing-start")?.startedAt, null);
  assert.equal(summaries.find(run => run.runId === "document")?.artifactTimings?.[0].artifactType, "document:softwareDesignSpec");
  assert.equal(summaries.find(run => run.runId === "legacy-model")?.artifactTimings?.[0].completedAt, "2026-10-01T00:00:20.000Z");
  assert.deepEqual(await store.listDashboardRuns!([]), []);
});
