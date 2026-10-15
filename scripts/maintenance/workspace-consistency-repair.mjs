#!/usr/bin/env node
// Dry-runs or applies targeted repairs for confirmed workspace consistency bugs.
import pg from "pg";

const { Client } = pg;
const FP_VERSION = "fp:v2";
const EMPTY_REQUIREMENT_FINGERPRINT = snapshotInputFingerprint({
  requirementText: "",
  rules: [],
});
const REVIEWABLE_REQUIREMENT_FIELDS = [
  "actor",
  "subject",
  "action",
  "object",
  "condition",
  "outcome",
  "acceptanceCriteria",
];

function parseArgs(argv) {
  const args = { apply: false, projectIds: new Set(), limit: 50 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--project") args.projectIds.add(argv[++index]);
    else if (arg === "--limit") args.limit = Number(argv[++index] ?? args.limit);
    else if (arg === "--help") {
      console.log(
        "Usage: node scripts/maintenance/workspace-consistency-repair.mjs [--project <id>] [--limit <n>] [--apply]",
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

function summarize(value) {
  if (typeof value === "string" && value.startsWith(`${FP_VERSION}:`)) {
    return `${value.slice(0, 18)}...`;
  }
  if (typeof value === "string") return value.slice(0, 48);
  return value;
}

function requirementFingerprint(state) {
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

function requirementStillNeedsReview(requirement) {
  if (requirement.status !== "accepted") return true;
  return REVIEWABLE_REQUIREMENT_FIELDS.some((field) => {
    const provenance = requirement.fieldProvenance?.[field];
    return provenance?.status === "pending-review" || provenance?.status === "rejected";
  });
}

function acceptedRequirementFromCandidate(candidate, currentRequirement) {
  if (candidate?.status !== "accepted") return null;
  const reviewed = candidate.afterRequirement ?? candidate.beforeRequirement;
  if (!reviewed) return null;
  const fieldProvenance = { ...(reviewed.fieldProvenance ?? {}) };
  for (const field of REVIEWABLE_REQUIREMENT_FIELDS) {
    const provenance = fieldProvenance[field];
    if (!provenance) continue;
    fieldProvenance[field] = {
      ...provenance,
      status: "accepted",
      issueIds: [],
    };
  }
  return {
    ...reviewed,
    id: currentRequirement.id,
    sourceRuleId: currentRequirement.sourceRuleId ?? reviewed.sourceRuleId,
    status: "accepted",
    confidence: Math.max(reviewed.confidence ?? 0, currentRequirement.confidence ?? 0),
    fieldProvenance,
  };
}

function rebuildQualityReport(baseline, requirements, issues) {
  const blockingIssueIds = issues
    .filter((issue) => issue.blocksDownstream)
    .map((issue) => issue.id);
  const reviewRequiredRequirementIds = requirements
    .filter(requirementStillNeedsReview)
    .map((requirement) => requirement.id);
  const status =
    blockingIssueIds.length > 0
      ? "blocked"
      : reviewRequiredRequirementIds.length > 0 || issues.length > 0
        ? "pending-review"
        : "passed";
  return {
    ...baseline.qualityReport,
    status,
    summary:
      status === "passed"
        ? `已建立 ${requirements.length} 条原子需求基线。`
        : `发现 ${issues.length} 个需求质量提示，可继续生成并在当前页面查看。`,
    issues,
    blockingIssueIds,
    reviewRequiredRequirementIds,
  };
}

function repairEmptyDiagramFingerprints(state, changes) {
  if (!hasRequirementInput(state)) return;
  const models = state.models ?? {};
  const diagramFingerprints = state.diagramInputFingerprints ?? {};
  const currentFingerprint = requirementFingerprint(state);
  const repaired = { ...diagramFingerprints };
  let changed = false;
  for (const [diagram, fingerprint] of Object.entries(diagramFingerprints)) {
    if (fingerprint !== EMPTY_REQUIREMENT_FINGERPRINT || !models[diagram]) continue;
    repaired[diagram] = currentFingerprint;
    changes.push({
      field: `diagramInputFingerprints.${diagram}`,
      oldValue: summarize(fingerprint),
      newValue: summarize(currentFingerprint),
    });
    changed = true;
  }
  if (changed) {
    state.diagramInputFingerprints = repaired;
    if (state.requirementInputFingerprint === EMPTY_REQUIREMENT_FINGERPRINT) {
      changes.push({
        field: "requirementInputFingerprint",
        oldValue: summarize(state.requirementInputFingerprint),
        newValue: summarize(currentFingerprint),
      });
      state.requirementInputFingerprint = currentFingerprint;
    }
  }
}

function repairAcceptedBaselineSplit(state, changes) {
  const baseline = state.requirementBaseline;
  if (!baseline || !Array.isArray(baseline.requirements)) return;
  const candidates = state.requirementReviewCandidates ?? {};
  const acceptedRequirementIds = new Set();
  const requirements = baseline.requirements.map((requirement) => {
    const ruleId = requirement.sourceRuleId;
    const candidate = ruleId ? candidates[ruleId] : null;
    const reviewed = acceptedRequirementFromCandidate(candidate, requirement);
    if (!reviewed) return requirement;
    const hadIssue =
      baseline.qualityReport?.reviewRequiredRequirementIds?.includes(requirement.id) ||
      baseline.qualityReport?.issues?.some((issue) => issue.requirementId === requirement.id);
    if (requirement.status === "accepted" && !hadIssue) return requirement;
    acceptedRequirementIds.add(requirement.id);
    acceptedRequirementIds.add(reviewed.id);
    changes.push({
      field: `requirementBaseline.requirements.${requirement.id}`,
      oldValue: requirement.status,
      newValue: "accepted",
    });
    return reviewed;
  });
  if (acceptedRequirementIds.size === 0) return;
  const issues = (baseline.qualityReport?.issues ?? []).filter(
    (issue) => !issue.requirementId || !acceptedRequirementIds.has(issue.requirementId),
  );
  const qualityReport = rebuildQualityReport(baseline, requirements, issues);
  state.requirementBaseline = {
    ...baseline,
    requirements,
    qualityReport,
  };
  state.requirementQualityReport = qualityReport;
  changes.push({
    field: "requirementQualityReport",
    oldValue: baseline.qualityReport?.status,
    newValue: qualityReport.status,
  });
}

function repairState(state) {
  const next = structuredClone(state ?? {});
  const changes = [];
  repairEmptyDiagramFingerprints(next, changes);
  repairAcceptedBaselineSplit(next, changes);
  return { state: next, changes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const projectFilter = args.projectIds.size > 0 ? [...args.projectIds] : null;
    const { rows } = await client.query(
      `
        select
          pws.project_id,
          projects.name as project_name,
          pws.version,
          pws.state
        from project_workspace_states pws
        left join projects on projects.id = pws.project_id
        where ($1::text[] is null or pws.project_id = any($1::text[]))
        order by pws.updated_at desc
      `,
      [projectFilter],
    );
    const repairs = [];
    for (const row of rows) {
      const repaired = repairState(row.state);
      if (repaired.changes.length === 0) continue;
      repairs.push({
        projectId: row.project_id,
        projectName: row.project_name,
        version: row.version,
        changes: repaired.changes,
        state: repaired.state,
      });
    }

    if (args.apply && repairs.length > 0) {
      await client.query("begin");
      try {
        for (const repair of repairs) {
          await client.query(
            `
              update project_workspace_states
              set state = $2::jsonb,
                  version = version + 1,
                  updated_at = now()
              where project_id = $1
            `,
            [repair.projectId, JSON.stringify(repair.state)],
          );
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          mode: args.apply ? "applied" : "dry-run",
          scannedProjects: rows.length,
          affectedProjects: repairs.length,
          emptyInputFingerprint: summarize(EMPTY_REQUIREMENT_FINGERPRINT),
          repairs: repairs.slice(0, args.limit).map(({ state, ...repair }) => repair),
          truncated: Math.max(0, repairs.length - args.limit),
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
