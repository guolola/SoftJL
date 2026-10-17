// Preserves baseline identity when generation tasks consume unchanged requirement content.
import { snapshotInputFingerprint } from "./fingerprints.js";
import type { RequirementBaseline } from "./requirements.js";

export function reuseRequirementBaseline(
  current: RequirementBaseline | null | undefined,
  incoming: RequirementBaseline,
): RequirementBaseline {
  if (!current) return incoming;
  if (current.schemaVersion !== incoming.schemaVersion) return incoming;
  if (current.sourceInputFingerprint && incoming.sourceInputFingerprint) {
    if (current.sourceInputFingerprint !== incoming.sourceInputFingerprint) return incoming;
    // A source hash alone does not prove the stored snapshot still has every
    // rule. Older editing flows could leave the hash behind after deleting facts.
    const currentFacts = current.rules ?? current.requirements;
    const incomingFacts = incoming.rules ?? incoming.requirements;
    return snapshotInputFingerprint(currentFacts) === snapshotInputFingerprint(incomingFacts) ? current : incoming;
  }
  // Older baselines have no source hash. Compare their complete content while
  // excluding task attribution; reading old data must not change its identity.
  return contentFingerprint(current) === contentFingerprint(incoming) ? current : incoming;
}

function contentFingerprint(baseline: RequirementBaseline) {
  const { runId: _runId, createdAt: _createdAt, sourceInputFingerprint: _source, qualityReport, ...content } = baseline;
  const { runId: _qualityRunId, ...quality } = qualityReport;
  return snapshotInputFingerprint({ ...content, qualityReport: quality });
}
