// Preserves baseline identity when generation tasks consume unchanged requirement content.
import { snapshotInputFingerprint } from "../fingerprints.js";
import type { RequirementBaseline } from "./requirements.js";

export function reuseRequirementBaseline(
  current: RequirementBaseline | null | undefined,
  incoming: RequirementBaseline,
): RequirementBaseline {
  if (!current) return incoming;
  // Run attribution changes do not replace an identical saved source snapshot.
  return current.sourceInputFingerprint === incoming.sourceInputFingerprint &&
    snapshotInputFingerprint(current.rules) === snapshotInputFingerprint(incoming.rules) ? current : incoming;
}
