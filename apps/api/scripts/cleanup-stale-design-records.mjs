// Audits and optionally removes stale sequence design records from project workspaces.
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { designTraceabilityTouchesDiagramKinds } from "@uml-platform/contracts";

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function designKindFromKey(key) {
  return key.includes(":") ? key.split(":", 1)[0] : key;
}

function designModelId(key, value) {
  return stringValue(record(value).modelId) || key;
}

function collectUseCaseIds(state) {
  const ids = new Set();
  for (const model of Object.values(record(state.models))) {
    const candidate = record(model);
    if (candidate.diagramKind !== "usecase") continue;
    const useCases = Array.isArray(candidate.useCases) ? candidate.useCases : [];
    for (const useCase of useCases) {
      const id = stringValue(record(useCase).id);
      if (id) ids.add(id);
    }
  }
  return ids;
}

function sequenceModelEntries(state) {
  return Object.entries(record(state.designModels)).filter(([key, value]) => {
    const model = record(value);
    return model.diagramKind === "sequence" || designKindFromKey(key) === "sequence";
  });
}

function collectStaleSequenceIds(state) {
  const currentUseCaseIds = collectUseCaseIds(state);
  const staleIds = new Set();
  if (currentUseCaseIds.size === 0) return { currentUseCaseIds, staleIds };

  for (const [key, value] of sequenceModelEntries(state)) {
    const sourceUseCaseId = stringValue(record(value).sourceUseCaseId);
    if (sourceUseCaseId && !currentUseCaseIds.has(sourceUseCaseId)) {
      staleIds.add(designModelId(key, value));
    }
  }

  return { currentUseCaseIds, staleIds };
}

function keyOrModelIdIsStale(key, value, staleIds) {
  if (staleIds.has(key)) return true;
  const modelId = stringValue(record(value).modelId);
  return Boolean(modelId && staleIds.has(modelId));
}

function removeStaleRecordEntries(value, staleIds) {
  const current = record(value);
  const next = {};
  const removed = [];
  for (const [key, entry] of Object.entries(current)) {
    if (keyOrModelIdIsStale(key, entry, staleIds)) {
      removed.push(key);
      continue;
    }
    next[key] = entry;
  }
  return { value: next, removed };
}

function removeStaleStringEntries(value, staleIds) {
  const current = record(value);
  const next = {};
  const removed = [];
  for (const [key, entry] of Object.entries(current)) {
    if (staleIds.has(key)) {
      removed.push(key);
      continue;
    }
    next[key] = entry;
  }
  return { value: next, removed };
}

export function cleanupState(state) {
  const next = { ...record(state) };
  const { currentUseCaseIds, staleIds } = collectStaleSequenceIds(next);
  const beforeDesignModels = Object.keys(record(next.designModels)).length;
  const beforeSequenceModels = sequenceModelEntries(next).length;

  const designModels = removeStaleRecordEntries(next.designModels, staleIds);
  const designSvgArtifacts = removeStaleRecordEntries(
    next.designSvgArtifacts,
    staleIds,
  );
  const designPlantUml = removeStaleStringEntries(next.designPlantUml, staleIds);
  const designInputFingerprints = removeStaleStringEntries(
    next.designInputFingerprints,
    staleIds,
  );
  const designModelTraceability = Array.isArray(next.designModelTraceability)
    ? next.designModelTraceability
    : [];
  const keptTraceability = designModelTraceability.filter(
    (entry) => !designTraceabilityTouchesDiagramKinds(entry, [], staleIds),
  );

  next.designModels = designModels.value;
  next.designSvgArtifacts = designSvgArtifacts.value;
  next.designPlantUml = designPlantUml.value;
  next.designInputFingerprints = designInputFingerprints.value;
  next.designModelTraceability = keptTraceability;

  const afterDesignModels = Object.keys(record(next.designModels)).length;
  const afterSequenceModels = sequenceModelEntries(next).length;
  const removedTraceability =
    designModelTraceability.length - keptTraceability.length;

  return {
    state: next,
    changed:
      designModels.removed.length > 0 ||
      designSvgArtifacts.removed.length > 0 ||
      designPlantUml.removed.length > 0 ||
      designInputFingerprints.removed.length > 0 ||
      removedTraceability > 0,
    currentUseCaseIds: Array.from(currentUseCaseIds).sort(),
    staleSequenceIds: Array.from(staleIds).sort(),
    counts: {
      designModelsBefore: beforeDesignModels,
      designModelsAfter: afterDesignModels,
      sequenceBefore: beforeSequenceModels,
      sequenceAfter: afterSequenceModels,
      staleSequenceModels: designModels.removed.length,
      staleSvgArtifacts: designSvgArtifacts.removed.length,
      stalePlantUml: designPlantUml.removed.length,
      staleFingerprints: designInputFingerprints.removed.length,
      staleTraceability: removedTraceability,
    },
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const projectId = argValue("--project-id");
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  if (!projectId) {
    console.error("--project-id is required.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query(
      "select project_id, version, state from project_workspace_states where project_id = $1",
      [projectId],
    );
    if (result.rowCount === 0) {
      console.error(`workspace not found for project ${projectId}`);
      process.exitCode = 1;
    } else {
      const row = result.rows[0];
      const cleanup = cleanupState(row.state);
      console.log(
        JSON.stringify(
          {
            mode: apply ? "apply" : "dry-run",
            projectId: row.project_id,
            version: row.version,
            currentUseCaseIds: cleanup.currentUseCaseIds,
            staleSequenceIds: cleanup.staleSequenceIds,
            counts: cleanup.counts,
            changed: cleanup.changed,
          },
          null,
          2,
        ),
      );

      if (apply && cleanup.changed) {
        await client.query("begin");
        const update = await client.query(
          "update project_workspace_states set state = $1, version = version + 1, updated_at = now() where project_id = $2 and version = $3",
          [cleanup.state, row.project_id, row.version],
        );
        if (update.rowCount === 0) {
          await client.query("rollback");
          console.error(
            `version conflict for project ${row.project_id}; cleanup skipped`,
          );
          process.exitCode = 1;
        } else {
          await client.query("commit");
          console.log(
            `updated project ${row.project_id} from version ${row.version} to ${
              row.version + 1
            }`,
          );
        }
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
