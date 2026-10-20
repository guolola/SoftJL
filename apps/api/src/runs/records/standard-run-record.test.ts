// Verifies quick task ownership, output preservation and compact PostgreSQL history parity.
import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { assertCurrentRunSnapshot, createStandardProjectState, type StandardProjectState } from "@uml-platform/contracts";
import { createRunRecordStore, serializeRunRecordStore } from "./run-record-store.js";
import { startStandardRunRecord, syncStandardRunRecord } from "./standard-run-record.js";
import { createPostgresRunRecordStore } from "./postgres-run-record-store.js";
import type { Queryable } from "../../db/transactions.js";
import { RUN_SUMMARY_SNAPSHOT_SQL } from "./run-summary-projection.js";

function diagram(id: string) {
  return { id, title: id, kind: "class" as const, status: "completed" as const,
    model: { nodes: [{ id: "order", label: "订单", type: "class" as const, fields: [], methods: [] }], edges: [] },
    source: "@startuml\nclass Order\n@enduml", svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Order</text></svg>' };
}
test("one quick turn owns only its outputs, retains partial results on failure and survives a history reload", async t => {
  const runs = createRunRecordStore();
  const before = createStandardProjectState("private description");
  before.diagrams.old = diagram("old");
  const state: StandardProjectState = structuredClone(before);
  state.run = { id: "turn-one", operation: "chat", status: "running", startedAt: "2026-10-19T00:00:00.000Z" };
  state.piSession = { entries: [{ secret: "private tool context" }], leafId: null };
  await startStandardRunRecord({ runs, state, previous: before, projectId: "project", userId: "owner", providerConfigId: "provider", model: "model" });
  state.diagrams.new = diagram("new");
  state.tests = [{ id: "test", businessId: "orders", title: "创建订单", preconditions: [], steps: ["创建"], expected: "成功" }];
  state.documents = { requirementsSpec: { title: "说明书", markdown: "private document body", generatedAt: state.run.startedAt, documentId: "doc" } };
  await syncStandardRunRecord(runs, state);
  state.run = { ...state.run, status: "failed", error: "worker failed", finishedAt: "2026-10-19T00:00:12.000Z" };
  await syncStandardRunRecord(runs, state);
  const record = runs.get("turn-one")!;
  assert.equal(record.snapshot.status, "failed"); assert.ok(record.terminal);
  assertCurrentRunSnapshot(record.snapshot);
  const restored = createRunRecordStore(serializeRunRecordStore(runs)).get("turn-one")!;
  const items = restored.snapshot.standardRun!.artifacts.map(({ svg: _svg, ...item }) => item);
  assert.deepEqual(items.map(item => item.type), ["毕设图表", "测试用例", "DOCX"]);
  assert.equal(items[0].modelId, "new");
  assert.ok(restored.snapshot.standardRun!.artifacts[0].svg);
  assert.equal(restored.snapshot.outputManifest.length, 3);
  const serialized = JSON.stringify(record.snapshot);
  for (const secret of ["private description", "private tool context", "private document body"]) assert.equal(serialized.includes(secret), false);
  const db = new PGlite(); t.after(() => db.close());
  const result = await db.query<{ snapshot: typeof record.snapshot }>(
    'select (' + RUN_SUMMARY_SNAPSHOT_SQL + ') as snapshot from (select $1::jsonb as snapshot) r', [serialized]);
  const compact = result.rows[0].snapshot;
  assert.deepEqual(compact.standardRun!.artifacts, items);
  assert.equal(JSON.stringify(compact).includes("<svg"), false);
  await db.exec(`create table run_records (id text primary key, user_id text, project_id text, source_run_id text,
      source_action text, source_run_status text, snapshot jsonb, status text, stage text, model text,
      provider_config_id text, error_message text, error jsonb, error_code text, created_at timestamptz,
      completed_at timestamptz, updated_at timestamptz);
    create table run_events (run_id text references run_records(id), sequence integer, event_type text,
      payload jsonb, created_at timestamptz default now(), primary key(run_id, sequence));`);
  const queryable: Queryable = { async query<T>(sql: string, params?: readonly unknown[]) {
    const response = await db.query<T>(sql, params ? [...params] : undefined);
    return { ...response, rowCount: response.rows.length };
  } };
  const persistent = await createPostgresRunRecordStore(queryable);
  persistent.set("turn-one", record); await persistent.flush(); persistent.release?.("turn-one");
  const reloaded = await persistent.refreshRun("turn-one", { events: "none" });
  assert.equal(reloaded?.snapshot.status, "failed");
  assert.equal(reloaded?.metadata?.completedAt, state.run.finishedAt);
  assert.deepEqual(reloaded!.snapshot.standardRun!.artifacts.map(({ svg: _svg, ...item }) => item), items);
  const listed = await persistent.listRecords!(["project"]);
  assert.deepEqual(listed[0].snapshot.standardRun!.artifacts, items);
  assert.equal(JSON.stringify(listed).includes("<svg"), false);
  const stored = await db.query<{ model: string; provider_config_id: string }>("select model, provider_config_id from run_records where id = 'turn-one'");
  assert.equal(stored.rows[0].model, "model"); assert.equal(stored.rows[0].provider_config_id, "provider");
  // The next message does not steal its predecessor's outputs.
  const second = structuredClone(state); second.run = { id: "turn-two", operation: "chat", status: "running", startedAt: "2026-10-19T00:01:00.000Z" };
  await startStandardRunRecord({ runs, state: second, previous: state, projectId: "project", userId: "owner", providerConfigId: "provider", model: "model" });
  second.diagrams.old.status = "running";
  await syncStandardRunRecord(runs, second);
  second.diagrams.old = diagram("old");
  second.run = { ...second.run, status: "stopped", finishedAt: "2026-10-19T00:01:10.000Z" };
  await syncStandardRunRecord(runs, second);
  assert.equal(runs.size, 2);
  assert.equal(runs.get("turn-two")!.snapshot.status, "cancelled");
  assert.deepEqual(runs.get("turn-two")!.snapshot.standardRun!.artifacts.map(item => item.modelId), ["old"]);
  assert.deepEqual(restored.snapshot.standardRun!.artifacts.map(({ svg: _svg, ...item }) => item), items);
  const cancelled = structuredClone(second); cancelled.run!.status = "running";
  await syncStandardRunRecord(runs, cancelled);
  assert.equal(runs.get("turn-two")!.snapshot.status, "cancelled");
});
