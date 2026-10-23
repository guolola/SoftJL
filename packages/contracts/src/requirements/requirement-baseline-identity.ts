// Preserves baseline identity when generation tasks consume unchanged requirement content.
import { snapshotInputFingerprint } from "../fingerprints.js";
import type { RequirementBaseline } from "./requirements.js";

export function reuseRequirementBaseline(
  current: RequirementBaseline | null | undefined,
  incoming: RequirementBaseline,
): RequirementBaseline {
  if (!current) return incoming;
  // Run attribution changes do not replace an identical saved source snapshot.
  const facts = (baseline: RequirementBaseline) => {
    const { runId: _runId, ...qualityReport } = baseline.qualityReport;
    return { rules: baseline.rules, assumptions: baseline.assumptions, conflicts: baseline.conflicts, qualityReport };
  };
  return current.sourceInputFingerprint === incoming.sourceInputFingerprint &&
    snapshotInputFingerprint(facts(current)) === snapshotInputFingerprint(facts(incoming)) ? current : incoming;
}
