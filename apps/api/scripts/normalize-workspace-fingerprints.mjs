// Audits and optionally rewrites legacy JSON workspace fingerprints to compact hashes.
import { Client } from "pg";
import {
  normalizeDesignInputFingerprint,
  normalizeSnapshotFingerprint,
} from "@uml-platform/contracts";

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function normalizeRecord(record, normalizer) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { value: {}, changed: false };
  }
  let changed = false;
  const value = Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      const normalized = typeof entry === "string" ? normalizer(entry) : entry;
      if (normalized !== entry) changed = true;
      return [key, normalized];
    }),
  );
  return { value, changed };
}

function normalizeWorkspaceState(state) {
  const next = { ...(state ?? {}) };
  let changed = false;

  if (typeof next.requirementInputFingerprint === "string") {
    const normalized = normalizeSnapshotFingerprint(next.requirementInputFingerprint);
    if (normalized !== next.requirementInputFingerprint) {
      next.requirementInputFingerprint = normalized;
      changed = true;
    }
  }

  const diagram = normalizeRecord(
    next.diagramInputFingerprints,
    normalizeSnapshotFingerprint,
  );
  if (diagram.changed) {
    next.diagramInputFingerprints = diagram.value;
    changed = true;
  }

  const design = normalizeRecord(
    next.designInputFingerprints,
    normalizeDesignInputFingerprint,
  );
  if (design.changed) {
    next.designInputFingerprints = design.value;
    changed = true;
  }

  return { state: next, changed };
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const result = await client.query(
    "select project_id, version, state from project_workspace_states order by updated_at desc",
  );
  const rows = result.rows.map((row) => {
    const beforeBytes = byteLength(row.state);
    const normalized = normalizeWorkspaceState(row.state);
    const afterBytes = byteLength(normalized.state);
    return {
      projectId: row.project_id,
      version: row.version,
      changed: normalized.changed,
      beforeBytes,
      afterBytes,
      savedBytes: beforeBytes - afterBytes,
      state: normalized.state,
    };
  });

  for (const row of rows) {
    console.log(
      [
        row.changed ? "CHANGE" : "OK",
        row.projectId,
        `version=${row.version}`,
        `before=${row.beforeBytes}`,
        `after=${row.afterBytes}`,
        `saved=${row.savedBytes}`,
      ].join(" "),
    );
  }

  const changedRows = rows.filter((row) => row.changed);
  const totalSaved = changedRows.reduce((sum, row) => sum + row.savedBytes, 0);
  console.log(
    `summary changed=${changedRows.length}/${rows.length} savedBytes=${totalSaved} mode=${
      apply ? "apply" : "dry-run"
    }`,
  );

  if (apply) {
    let updatedCount = 0;
    for (const row of changedRows) {
      const updated = await client.query(
        `update project_workspace_states
         set version = version + 1,
             state = $2::jsonb,
             updated_at = now()
         where project_id = $1
           and version = $3`,
        [row.projectId, JSON.stringify(row.state), row.version],
      );
      if (updated.rowCount !== 1) {
        console.warn(
          `skipped ${row.projectId}: workspace version changed during cleanup`,
        );
      } else {
        updatedCount += 1;
      }
    }
    console.log(`updated ${updatedCount} project workspace rows`);
  }
} finally {
  await client.end();
}
