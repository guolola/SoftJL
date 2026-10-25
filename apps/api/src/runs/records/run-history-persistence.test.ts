// Exercises lazy history reads, compact lists and event cursors against PostgreSQL-compatible SQL.
import { strictTestModelCapability } from "../../../tests/fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Queryable } from "../../db/transactions.js";
import { createPostgresRunRecordStore } from "./postgres-run-record-store.js";
import { createEmptySnapshot, createEmptyDocumentSnapshot } from "./snapshots.js";
import { captureWorkspaceGuard } from "./workspace-run-guard.js";
import { documentInputFromSnapshot } from "../pipelines/run-record-pipeline-starter.js";
import { emitEvent, type RunRecord } from "./run-record-store.js";
import { RUN_SUMMARY_SNAPSHOT_SQL } from "./run-summary-projection.js";
import { runOutputView } from "./run-output-provenance.js";
import { summarizeRunRecord } from "./run-record-summaries.js";
import { emptyRequirementTokenUsage } from "./requirement-token-usage.js";

test("persisted history remains complete without a process-wide snapshot/log cache", async t => {
  const previousMode = process.env.UML_RUN_QUEUE_MODE;
  process.env.UML_RUN_QUEUE_MODE = "bullmq";
  t.after(() => { if (previousMode === undefined) delete process.env.UML_RUN_QUEUE_MODE; else process.env.UML_RUN_QUEUE_MODE = previousMode; });
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create table run_records (id text primary key, user_id text, project_id text, source_run_id text,
      source_action text, source_run_status text, snapshot jsonb, status text, stage text, model text,
      provider_config_id text, error_message text, error jsonb, error_code text, created_at timestamptz,
      completed_at timestamptz, updated_at timestamptz);
    create table run_events (run_id text references run_records(id) on delete cascade,
      sequence integer, event_type text, payload jsonb, created_at timestamptz default now(),
      primary key(run_id, sequence));
  `);
  const snapshot = {
    ...createEmptySnapshot("large", "业务需求", ["class"]), status: "completed" as const,
    providerSettings: { modelCapability: strictTestModelCapability("model-a"), model: "model-a", providerConfigId: "provider-a", apiKey: "private-key" },
    models: [{ diagramKind: "class", modelId: "class-a", title: "类模型", summary: "业务实体", notes: [],
      classes: [{ id: "internal", name: "Internal", attributes: [], operations: [], constraints: [] }], interfaces: [], enums: [], relationships: [] }],
    plantUml: [{ diagramKind: "class", modelId: "class-a", source: "@startuml\nclass A\n@enduml" }],
    svgArtifacts: [{ diagramKind: "class", modelId: "class-a", svg: "<svg>" + "image".repeat(100_000) + "</svg>",
      renderMeta: { engine: "plantuml", generatedAt: "2026-10-01T00:01:00.000Z", sourceLength: 27, durationMs: 1 } }],
    traceabilityMatrix: null,
    outputManifest: [{ kind: "model", id: "class-a", diagramKind: "class" }],
  };
  await db.query(`insert into run_records(id,project_id,snapshot,status,stage,model,created_at,completed_at)
    values('large','visible',$1,'completed','generate_models','model-a','2026-10-01','2026-10-01T00:01:00Z')`, [JSON.stringify(snapshot)]);
  await db.exec(`insert into run_events(run_id,sequence,event_type,payload)
    select 'large',n,'run_activity',jsonb_build_object('type','run_activity','runId','large','callId','call',
      'stage','generate_models','phase','reasoning','text',repeat('thought',300),
      'eventId','reasoning-' || n,'createdAt','2026-10-01T00:00:00Z')
      from generate_series(2,2001) n;
    insert into run_events(run_id,sequence,event_type,payload) values
      ('large',2003,'artifact_ready','{"type":"artifact_ready","eventId":"svg-ready","createdAt":"2026-10-01T00:01:00Z","stage":"render_svg","artifactKind":"svg","modelId":"class-a","diagramKind":"class"}'),
      ('large',1,'run_activity','{"type":"run_activity","eventId":"started","createdAt":"2026-10-01T00:00:00Z","runId":"large","callId":"call","stage":"generate_models","phase":"started","inputImages":[{"url":"private-image"}],"text":"private-prompt"}'),
      ('large',2002,'completed','{"type":"completed","snapshotRef":"large","eventId":"completed","createdAt":"2026-10-01T00:01:00Z"}');
    insert into run_records(id,project_id,snapshot,status,stage,created_at,completed_at)
      select 'batch-' || lpad(n::text,3,'0'), 'visible', '{"runId":"batch","models":[],"status":"completed"}',
        'completed','generate_models','2026-10-01','2026-10-01' from generate_series(1,205) n;
    insert into run_records(id,project_id,snapshot,status,stage,created_at) values
      ('private','private','{"runId":"private","models":[],"status":"running"}','running','generate_models','2026-10-01'),
      ('design','visible','{"runId":"design","designModelTraceability":[],"models":[],"status":"completed"}','completed','generate_design_models','2026-10-01'),
      ('document','visible','{"runId":"document","documentKind":"requirementsSpec","sections":[{"title":"chapter","content":"private-body"}],"status":"completed"}','completed','render_document_file','2026-10-01'),
      ('feasibility','visible','{"runId":"feasibility","selectedArtifacts":[],"status":"completed"}','completed','generate_context','2026-10-01');
  `);
  await db.query(`update run_records set snapshot = $1 where id = 'private'`, [JSON.stringify(createEmptySnapshot("private", "私有需求", []))]);
  const queries: string[] = [];
  const queryable: Queryable = { async query<T>(sql: string, params?: readonly unknown[]) {
    queries.push(sql);
    const result = await db.query<T>(sql, params ? [...params] : undefined);
    return { ...result, rowCount: result.rows.length };
  } };
  const store = await createPostgresRunRecordStore(queryable);

  await t.test("queue-mode startup performs no historical reads", () => {
    assert.equal(store.size, 0);
    assert.equal(queries.length, 0);
  });
  await t.test("lists paginate database metadata, preserve summaries and do not cache history", async () => {
    const records = await store.listRecords!(["visible"]);
    assert.equal(records.length, 209);
    assert.equal(records.some(record => record.snapshot.runId === "private"), false);
    assert.equal(store.size, 0);
    assert.ok(queries.filter(sql => sql.includes("order by id asc limit 100")).length >= 3);
    const record = records.find(record => record.snapshot.runId === "large")!;
    assert.equal(record.events.length, 1);
    assert.equal(record.events[0]?.type, "artifact_ready");
    assert.doesNotMatch(JSON.stringify(record.events), /private-matrix|coverageMatrix/);
    assert.equal(summarizeRunRecord(record).eventCount, 2003);
    assert.equal(record.persist, undefined);
    assert.deepEqual(runOutputView(record.snapshot).references, runOutputView(snapshot as unknown as RunRecord["snapshot"]).references);
    assert.ok(JSON.stringify(record.snapshot).length < 3000);
    assert.doesNotMatch(JSON.stringify(records), /private-key|private-prompt|private-image|private-body/);
    assert.deepEqual(await store.listRecords!([]), []);
  });
  await t.test("snapshot-only and filtered replay preserve total counts and terminal cursors", async () => {
    const plain = (await store.refreshRun("large", { events: "none" }))!;
    assert.equal(plain.events.length, 0);
    assert.equal(plain.persistedEventCount, 2003);
    assert.equal(plain.eventSequence, 2003);
    const progress = (await store.refreshRun("large", { events: "progress" }))!;
    assert.deepEqual(progress.events.map(event => event.type), ["run_activity", "completed", "artifact_ready"]);
    assert.doesNotMatch(JSON.stringify(progress.events[0]), /private-image|private-prompt/);
    const resumed = (await store.refreshRun("large", { events: "progress", afterSequence: 2001 }))!;
    assert.deepEqual(resumed.events.map(event => event.sequence), [2002, 2003]);
    const all = (await store.refreshRun("large"))!;
    assert.equal(all.events.length, 2003);
    assert.equal(store.size, 0);
  });
  await t.test("actions append after unloaded events and never overwrite the complete snapshot", async () => {
    const record = (await store.refreshRun("large", { events: "none" }))!;
    emitEvent(record, { type: "run_action", action: "rerun", sourceRunId: "large", newRunId: "derived", createdAt: "2026-10-01T00:02:00Z" });
    await store.flush();
    const reloaded = (await store.refreshRun("large"))!;
    assert.equal(reloaded.events.at(-1)?.sequence, 2004);
    assert.equal(reloaded.events.length, 2004);
    assert.equal("svgArtifacts" in reloaded.snapshot && reloaded.snapshot.svgArtifacts[0]?.svg, snapshot.svgArtifacts[0]!.svg);
    const summary = (await store.listRecords!(["visible"])).find(record => record.snapshot.runId === "large")!;
    assert.deepEqual(summarizeRunRecord(summary).derivedRunIds, ["derived"]);
  });
  await t.test("tool lifecycles persist and survive compact history and cursor restoration", async () => {
    const live: RunRecord = { snapshot: createEmptySnapshot("tool-progress", "private upstream", []), events: [], listeners: new Set(), terminal: false };
    store.set("tool-progress", live);
    const metadata = { eventId: "provider", createdAt: "2026-10-25T00:00:00Z", runId: "tool-progress", stage: "generate_models" as const, callId: "provider", modelId: "usecase", subtaskId: "usecase" };
    emitEvent(live, { ...metadata, type: "run_activity", phase: "started", format: "technical" });
    const tool = { ...metadata, type: "run_tool" as const, toolCallId: "validation", toolName: "validate_model" as const };
    emitEvent(live, { ...tool, eventId: "tool-start", phase: "started" });
    emitEvent(live, { ...tool, eventId: "tool-end", phase: "failed", errorCount: 2 });
    emitEvent(live, { ...metadata, eventId: "provider-end", type: "run_activity", phase: "completed", format: "technical" });
    live.snapshot.status = "cancelled";
    emitEvent(live, { type: "cancelled", message: "停止" });
    await store.flush();
    store.release?.("tool-progress");
    const progress = (await store.refreshRun("tool-progress", { events: "progress" }))!;
    assert.deepEqual(progress.events.filter(event => event.type === "run_tool").map(event => [event.toolName, event.phase, event.errorCount]),
      [["validate_model", "started", undefined], ["validate_model", "failed", 2]]);
    const resumed = (await store.refreshRun("tool-progress", { events: "progress", afterSequence: 2 }))!;
    assert.equal(resumed.events[0]?.type, "run_tool");
    assert.equal(resumed.events[0]?.eventId, "tool-end");
    assert.doesNotMatch(JSON.stringify(progress.events), /private upstream/);
  });
  await t.test("live local pipelines retain identity and completed writes release execution memory", async () => {
    const live: RunRecord = { snapshot: createEmptySnapshot("local", "需求", []), events: [], listeners: new Set(), terminal: false, executionActive: true };
    store.set("local", live);
    await store.flush();
    assert.equal(await store.refreshRun("local"), live);
    live.snapshot.status = "completed";
    emitEvent(live, { type: "completed", snapshot: live.snapshot });
    await store.flush();
    assert.equal(store.get("local"), undefined);
    assert.equal((await store.refreshRun("local"))?.snapshot.status, "completed");
    assert.equal(store.size, 0);
  });
  await t.test("deleting uncached history remains durable and scoped", async () => {
    store.delete("large");
    await store.flush();
    assert.equal(await store.refreshRun("large"), null);
    assert.equal((await store.refreshRun("private", { events: "none" }))?.snapshot.status, "running");
  });
  await t.test("document replay inputs and guards survive eviction and database reload", async () => {
    const snapshot = createEmptyDocumentSnapshot("durable-document", { documentKind: "requirementsSpec", requirementText: "完整原需求", rules: [], requirementModels: [], designModels: [], useAiText: false, documentStyle: { presetName: "courseDesign", includeTableOfContents: false, autoNumberHeadings: false } });
    const record: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
    snapshot.workspaceGuard = captureWorkspaceGuard(record, { requirementText: "完整原需求" });
    snapshot.publicationSkipped = "输入已变更";
    store.set(snapshot.runId, record);
    await store.flush();
    store.release?.(snapshot.runId);
    const reloaded = (await store.refreshRun(snapshot.runId, { events: "none" }))!;
    assert.notEqual(reloaded, record);
    assert.deepEqual(reloaded.snapshot.workspaceGuard, snapshot.workspaceGuard);
    assert.equal(reloaded.snapshot.publicationSkipped, "输入已变更");
    assert.deepEqual(documentInputFromSnapshot(reloaded), snapshot.replayInput);
  });
});

test("compact PostgreSQL summaries preserve use-case completeness without flow bodies", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const tokenUsage = { ...emptyRequirementTokenUsage("model"), contextTokens: 5700 };
  const snapshot = {
    ...createEmptySnapshot("analysis", "需求", ["analysis"]), status: "completed" as const,
    tokenUsage,
    models: [
      { diagramKind: "usecase", modelId: "input-usecase", useCases: [{ id: "UC1", goal: "private-flow" }, { id: "UC2", goal: "private-flow" }] },
      { diagramKind: "analysis", modelId: "analysis:UC1", sourceUseCaseId: "UC1" }
    ],
    outputManifest: [{ kind: "model", id: "analysis:UC1", diagramKind: "analysis", sourceUseCaseId: "UC1" }],
  } as unknown as RunRecord["snapshot"];
  for (const legacy of [false, true]) {
    if (legacy) delete snapshot.outputManifest;
    const result = await db.query<{ snapshot: RunRecord["snapshot"] }>(`select (${RUN_SUMMARY_SNAPSHOT_SQL}) as snapshot from (select $1::jsonb as snapshot) r`, [JSON.stringify(snapshot)]);
    const compact = result.rows[0]!.snapshot;
    if (legacy) {
      assert.throws(() => runOutputView(compact));
      continue;
    }
    assert.equal(runOutputView(compact).resultConsistency, "missing_requested_output");
    assert.equal(runOutputView(compact).resultConsistency, runOutputView(snapshot).resultConsistency);
    assert.doesNotMatch(JSON.stringify(compact), /private-flow/);
    assert.deepEqual("tokenUsage" in compact ? compact.tokenUsage : undefined, tokenUsage);
  }
});
