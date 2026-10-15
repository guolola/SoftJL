#!/usr/bin/env node
// Audits persisted project workspaces and run snapshots for known workspace merge inconsistencies.
import pg from "pg";

const { Client } = pg;
const FP_VERSION = "fp:v2";
const EMPTY_REQUIREMENT_FINGERPRINT = snapshotInputFingerprint({
  requirementText: "",
  rules: [],
});

function parseArgs(argv) {
  const args = { projectIds: new Set(), limit: 25 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") args.projectIds.add(argv[++index]);
    else if (arg === "--limit") args.limit = Number(argv[++index] ?? args.limit);
    else if (arg === "--help") {
      console.log(
        "Usage: node scripts/maintenance/workspace-consistency-audit.mjs [--project <id>] [--limit <n>]",
      );
      process.exit(0);
    }
  }
  return args;
}

function fingerprintHash(value) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ char, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ char, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ char, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ char, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [h1, h2, h3, h4]
    .map((part) => (part >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

function sortFingerprintValue(value) {
  if (Array.isArray(value)) return value.map(sortFingerprintValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortFingerprintValue(entry)]),
  );
}

function snapshotInputFingerprint(value) {
  return `${FP_VERSION}:${fingerprintHash(JSON.stringify(sortFingerprintValue(value)))}`;
}

function isLegacyFingerprint(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith(`${FP_VERSION}:`);
}

function stateRequirementFingerprint(state) {
  return snapshotInputFingerprint({
    requirementText: typeof state.requirementText === "string" ? state.requirementText : "",
    rules: Array.isArray(state.rules) ? state.rules : [],
  });
}

function hasRequirementInput(state) {
  return (
    (typeof state.requirementText === "string" && state.requirementText.trim().length > 0) ||
    (Array.isArray(state.rules) && state.rules.length > 0)
  );
}

function summarizeFingerprint(value) {
  if (typeof value !== "string") return value;
  if (value.startsWith(`${FP_VERSION}:`)) return `${value.slice(0, 18)}...`;
  return `legacy:${value.slice(0, 32)}${value.length > 32 ? "..." : ""}`;
}

function collectWorkspaceFindings(row) {
  const state = row.state ?? {};
  const currentFingerprint = stateRequirementFingerprint(state);
  const diagramFingerprints = state.diagramInputFingerprints ?? {};
  const models = state.models ?? {};
  const emptyDiagramFingerprints = [];
  const legacyDiagramFingerprints = [];
  for (const [diagram, fingerprint] of Object.entries(diagramFingerprints)) {
    if (isLegacyFingerprint(fingerprint)) {
      legacyDiagramFingerprints.push({ diagram, fingerprint: summarizeFingerprint(fingerprint) });
      continue;
    }
    if (
      hasRequirementInput(state) &&
      fingerprint === EMPTY_REQUIREMENT_FINGERPRINT &&
      models[diagram]
    ) {
      emptyDiagramFingerprints.push({
        diagram,
        oldFingerprint: summarizeFingerprint(fingerprint),
        expectedFingerprint: summarizeFingerprint(currentFingerprint),
      });
    }
  }

  const reviewInconsistencies = [];
  const candidates = state.requirementReviewCandidates ?? {};
  const baseline = state.requirementBaseline ?? null;
  const report = baseline?.qualityReport ?? state.requirementQualityReport ?? null;
  const reviewRequiredIds = new Set(report?.reviewRequiredRequirementIds ?? []);
  const issueRequirementIds = new Set(
    (report?.issues ?? [])
      .map((issue) => issue?.requirementId)
      .filter((id) => typeof id === "string"),
  );
  if (baseline && Array.isArray(baseline.requirements)) {
    for (const requirement of baseline.requirements) {
      const ruleId = requirement?.sourceRuleId;
      const candidate = ruleId ? candidates[ruleId] : null;
      if (candidate?.status !== "accepted") continue;
      if (
        requirement.status !== "accepted" ||
        reviewRequiredIds.has(requirement.id) ||
        issueRequirementIds.has(requirement.id)
      ) {
        reviewInconsistencies.push({
          ruleId,
          requirementId: requirement.id,
          baselineStatus: requirement.status,
          reviewRequired: reviewRequiredIds.has(requirement.id),
          issueCount: (report?.issues ?? []).filter(
            (issue) => issue?.requirementId === requirement.id,
          ).length,
        });
      }
    }
  }

  return {
    projectId: row.project_id,
    projectName: row.project_name,
    currentFingerprint: summarizeFingerprint(currentFingerprint),
    emptyDiagramFingerprints,
    legacyDiagramFingerprints,
    reviewInconsistencies,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const projectFilter = args.projectIds.size > 0 ? [...args.projectIds] : null;
    const workspaceRows = await client.query(
      `
        select
          pws.project_id,
          projects.name as project_name,
          pws.state
        from project_workspace_states pws
        left join projects on projects.id = pws.project_id
        where ($1::text[] is null or pws.project_id = any($1::text[]))
        order by pws.updated_at desc
      `,
      [projectFilter],
    );
    const runRows = await client.query(
      `
        select id, project_id, stage, status, created_at, snapshot
        from run_records
        where project_id is not null
          and ($1::text[] is null or project_id = any($1::text[]))
          and snapshot ? 'requirementModels'
          and jsonb_typeof(snapshot->'requirementModels') = 'array'
          and jsonb_array_length(snapshot->'requirementModels') > 0
          and (
            coalesce(snapshot->>'requirementText', '') = ''
            or case
              when jsonb_typeof(snapshot->'rules') = 'array'
              then jsonb_array_length(snapshot->'rules')
              else 0
            end = 0
          )
        order by created_at desc
      `,
      [projectFilter],
    );

    const workspaceFindings = workspaceRows.rows.map(collectWorkspaceFindings);
    const projectsWithEmptyDiagramFingerprints = workspaceFindings.filter(
      (finding) => finding.emptyDiagramFingerprints.length > 0,
    );
    const projectsWithReviewInconsistencies = workspaceFindings.filter(
      (finding) => finding.reviewInconsistencies.length > 0,
    );
    const projectsWithLegacyFingerprints = workspaceFindings.filter(
      (finding) => finding.legacyDiagramFingerprints.length > 0,
    );
    const suspiciousRunSnapshots = runRows.rows.map((row) => ({
      projectId: row.project_id,
      runId: row.id,
      stage: row.stage,
      status: row.status,
      createdAt: row.created_at,
      requirementModels: row.snapshot.requirementModels?.length ?? 0,
      requirementTextLength: row.snapshot.requirementText?.length ?? 0,
      rulesCount: row.snapshot.rules?.length ?? 0,
    }));

    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          scannedProjects: workspaceRows.rowCount,
          emptyInputFingerprint: summarizeFingerprint(EMPTY_REQUIREMENT_FINGERPRINT),
          summary: {
            projectsWithEmptyDiagramFingerprints:
              projectsWithEmptyDiagramFingerprints.length,
            emptyDiagramFingerprints: projectsWithEmptyDiagramFingerprints.reduce(
              (sum, finding) => sum + finding.emptyDiagramFingerprints.length,
              0,
            ),
            projectsWithReviewInconsistencies:
              projectsWithReviewInconsistencies.length,
            reviewInconsistencies: projectsWithReviewInconsistencies.reduce(
              (sum, finding) => sum + finding.reviewInconsistencies.length,
              0,
            ),
            projectsWithLegacyFingerprints: projectsWithLegacyFingerprints.length,
            suspiciousRunSnapshots: suspiciousRunSnapshots.length,
          },
          examples: {
            emptyDiagramFingerprints: projectsWithEmptyDiagramFingerprints.slice(0, args.limit),
            reviewInconsistencies: projectsWithReviewInconsistencies.slice(0, args.limit),
            legacyDiagramFingerprints: projectsWithLegacyFingerprints.slice(0, args.limit),
            suspiciousRunSnapshots: suspiciousRunSnapshots.slice(0, args.limit),
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
