#!/usr/bin/env node
// Backs up, previews and conditionally updates proven obsolete design provenance only.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { previewDesignSourceRepair } from "../../packages/contracts/dist/index.js";

const args = process.argv.slice(2);
const value = (key) => args[args.indexOf(key) + 1];
for (const key of ["--project", "--source-run", "--legacy-contracts"]) if (!args.includes(key) || !value(key)) throw new Error(`Required: ${key}`);
const apply = args.includes("--apply");
if (apply && (!args.includes("--backup") || !args.includes("--expected-version"))) throw new Error("Apply requires reviewed backup and expected workspace version");
const legacy = await import(pathToFileURL(value("--legacy-contracts")).href);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(apply ? "begin" : "begin read only");
  const row = (await client.query("select * from project_workspace_states where project_id=$1", [value("--project")])).rows[0];
  const run = (await client.query("select snapshot from run_records where id=$1 and project_id=$2", [value("--source-run"), value("--project")])).rows[0];
  if (!row || !run) throw new Error("Project workspace or source run not found");
  const requirementInput = (await client.query("select snapshot from run_records where id=$1 and project_id=$2", [run.snapshot.requirementBaseline?.runId, value("--project")])).rows[0]?.snapshot;
  const preview = previewDesignSourceRepair(row.state, run.snapshot, legacy.designInputFingerprint(run.snapshot.requirementModels, run.snapshot.requirementModelTraceability), requirementInput);
  const backup = { workspace: row, sourceRunId: value("--source-run"), preview };
  if (args.includes("--backup")) {
    const path = value("--backup");
    if (!existsSync(path)) writeFileSync(path, JSON.stringify(backup), { flag: "wx", mode: 0o600 });
    else {
      const saved = JSON.parse(readFileSync(path, "utf8"));
      if (JSON.stringify(saved.workspace.state) !== JSON.stringify(row.state) || saved.workspace.version !== row.version || saved.sourceRunId !== backup.sourceRunId) throw new Error("Workspace changed since backup; review a new preview");
    }
  }
  if (apply) {
    if (Number(value("--expected-version")) !== row.version) throw new Error("Reviewed workspace version changed");
    if (!preview.changes.length) throw new Error("No proven changes to apply");
    const state = { ...row.state, designInputFingerprints: { ...row.state.designInputFingerprints } };
    for (const change of preview.changes) state.designInputFingerprints[change.modelId] = change.after;
    const updated = await client.query("update project_workspace_states set state=$1::jsonb, version=version+1, updated_at=now() where project_id=$2 and version=$3 returning version", [JSON.stringify(state), row.project_id, row.version]);
    if (updated.rowCount !== 1) throw new Error("Concurrent workspace update; repair aborted");
    await client.query("insert into audit_logs(id,actor_user_id,action,target_type,target_id,outcome,message) values($1,$2,$3,'project',$4,'success',$5)", [randomUUID(), row.updated_by_user_id, "project.workspace.design-provenance-repair", row.project_id, JSON.stringify({ sourceRunId: backup.sourceRunId, beforeVersion: row.version, changes: preview.changes })]);
    await client.query("commit");
  } else await client.query("rollback");
  console.log(JSON.stringify({ mode: apply ? "applied" : "preview", version: row.version, nextVersion: row.version + (apply ? 1 : 0), ...preview }));
} catch (error) { await client.query("rollback"); throw error; }
finally { await client.end(); }
