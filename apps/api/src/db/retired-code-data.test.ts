// Exercises the destructive migration inside an isolated PostgreSQL schema, never application tables.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { retiredCodeDataSql } from "./retired-code-data.js";
import { runMigrations } from "./migrations.js";
import { isRestorableRunSnapshot } from "../routes/projects/workspace-snapshot-restore.js";
import { normalizeWorkspaceModelState } from "../normalizers/workspace/model-state.js";

test("workspace writes strip retired payloads and old snapshots cannot be restored", () => {
  const output = normalizeWorkspaceModelState({ codeFiles: { "/src/App.tsx": "obsolete" }, requirementText: "keep", error: { code: "KEEP" } });
  assert.deepEqual(output, { requirementText: "keep", error: { code: "KEEP" } });
  assert.equal(isRestorableRunSnapshot({ files: {}, entryFile: null } as never), false);
});

test("migration purges only code data, preserves documents/billing, and is idempotent", async () => {
  const database = new PGlite();
  const client = { query: async (sql: string, values?: unknown[]) => values
    ? database.query<Record<string, any>>(sql, values)
    : (await database.exec(sql)).at(-1) as { rows: Record<string, any>[] } };
  const schema = `retire_code_test_${randomUUID().replaceAll("-", "")}`;
  // A generated identifier with a fixed prefix keeps cleanup bounded to this test's schema.
  assert.match(schema, /^retire_code_test_[a-f0-9]{32}$/);
  try {
    await client.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}";`);
    await client.query(`
      CREATE TABLE run_records(id text PRIMARY KEY, snapshot jsonb NOT NULL);
      CREATE TABLE run_events(run_id text REFERENCES run_records(id) ON DELETE CASCADE, payload jsonb NOT NULL);
      CREATE TABLE project_workspace_states(project_id text PRIMARY KEY, state jsonb NOT NULL, version int DEFAULT 1, updated_at timestamptz DEFAULT now(), source_run_id text REFERENCES run_records(id) ON DELETE SET NULL);
      CREATE TABLE documents(id text PRIMARY KEY, source_run_id text REFERENCES run_records(id) ON DELETE SET NULL, content text);
      CREATE TABLE billing_usage_reservations(run_id text PRIMARY KEY, amount int);
      CREATE TABLE prompt_runtime_versions(id text PRIMARY KEY, prompt_id text);
      CREATE TABLE prompt_runtime_active(prompt_id text PRIMARY KEY, version_id text REFERENCES prompt_runtime_versions(id));
    `);
    await client.query("INSERT INTO run_records VALUES ($1,$2),($3,$4)", ["old-code", { files: {}, status: "queued" }, "keep-design", { models: [], codeTrace: [], error: { code: "ordinary" } }]);
    await client.query("INSERT INTO run_events VALUES ($1,$2),($3,$4)", ["old-code", { type: "queued" }, "keep-design", { type: "completed", snapshot: { models: [], codeFiles: {} } }]);
    await client.query("INSERT INTO project_workspace_states(project_id,state,source_run_id) VALUES ($1,$2,$3),($4,$5,null)", ["changed", { requirementText: "keep", codeFiles: { a: "obsolete" }, models: { prototype: { diagramKind: "prototype" } }, error: { code: "KEEP" }, history: [{ snapshot: { files: {} } }, { snapshot: { models: [] } }] }, "old-code", "unchanged", { requirementText: "also keep" }]);
    await client.query("INSERT INTO documents VALUES ('doc','old-code','keep document'); INSERT INTO billing_usage_reservations VALUES ('old-code',4);");
    await client.query("INSERT INTO prompt_runtime_versions VALUES ('old','code.business'),('keep','design.sequence'); INSERT INTO prompt_runtime_active VALUES ('code.business','old'),('design.sequence','keep');");
    await runMigrations(client, [{ id: "030_retire_code_prototypes", sql: retiredCodeDataSql }]);
    assert.deepEqual((await client.query("SELECT id FROM run_records")).rows, [{ id: "keep-design" }]);
    assert.equal((await client.query("SELECT * FROM run_events")).rows.length, 1);
    const changed = (await client.query("SELECT * FROM project_workspace_states WHERE project_id='changed'")).rows[0];
    assert.equal(changed.version, 2);
    assert.equal(changed.source_run_id, null);
    assert.deepEqual(changed.state, { requirementText: "keep", models: { prototype: { diagramKind: "prototype" } }, error: { code: "KEEP" }, history: [{ snapshot: { models: [] } }] });
    assert.equal((await client.query("SELECT version FROM project_workspace_states WHERE project_id='unchanged'")).rows[0].version, 1);
    assert.deepEqual((await client.query("SELECT * FROM documents")).rows, [{ id: "doc", source_run_id: null, content: "keep document" }]);
    assert.deepEqual((await client.query("SELECT * FROM billing_usage_reservations")).rows, [{ run_id: "old-code", amount: 4 }]);
    assert.deepEqual((await client.query("SELECT prompt_id FROM prompt_runtime_versions")).rows, [{ prompt_id: "design.sequence" }]);
    await client.query(retiredCodeDataSql);
    assert.equal((await client.query("SELECT version FROM project_workspace_states WHERE project_id='changed'")).rows[0].version, 2);
  } finally {
    await client.query("ROLLBACK");
    await client.query(`SET search_path TO public; DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
    await database.close();
  }
});
