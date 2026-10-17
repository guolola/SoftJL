// Propagates upstream changes through the design dependency graph without regenerating artifacts.
import { snapshotInputFingerprint } from "./fingerprints.js";
import { requirementBaselinePromptContext } from "./requirement-baseline-snapshot.js";
import { requirementBaselineSchema } from "./requirements.js";

export const designDependencies: Record<string, readonly string[]> = {
  architecture: [], sequence: [], class: ["sequence"], navigation: ["sequence"],
  component: ["class"], table: ["class", "sequence"], deployment: ["component"],
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const kindOf = (id: string, value: unknown) => String(object(value).diagramKind ?? id.split(":")[0]);
function facts(state: Record<string, unknown>) {
  const baseline = requirementBaselineSchema.safeParse(state.requirementBaseline);
  return { text: state.requirementText ?? "", rules: state.rules ?? [], baseline: baseline.success ? requirementBaselinePromptContext(baseline.data) : null, models: state.models ?? {}, traceability: state.requirementModelTraceability ?? [] };
}

export function invalidateDesignDependents(previous: Record<string, unknown>, next: Record<string, unknown>, regeneratedKinds: string[] = []) {
  const before = object(previous.designModels);
  const after = object(next.designModels);
  if (!Object.keys(before).length) return next;
  const regenerated = new Set(regeneratedKinds);
  const changed = new Set<string>();
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (snapshotInputFingerprint(before[id] ?? null) !== snapshotInputFingerprint(after[id] ?? null)) changed.add(kindOf(id, after[id] ?? before[id]));
  }
  const stale = new Set<string>();
  if (snapshotInputFingerprint(facts(previous)) !== snapshotInputFingerprint(facts(next))) {
    for (const [id, model] of Object.entries(after)) if (!regenerated.has(kindOf(id, model))) stale.add(kindOf(id, model));
  }
  // A changed upstream invalidates all descendants, including unchanged intermediate models.
  let grew = true;
  while (grew) {
    grew = false;
    for (const [kind, dependencies] of Object.entries(designDependencies)) {
      if (!regenerated.has(kind) && !stale.has(kind) && dependencies.some(source => changed.has(source) || stale.has(source))) {
        stale.add(kind); grew = true;
      }
    }
  }
  const fingerprints = { ...object(next.designInputFingerprints) };
  for (const [id, model] of Object.entries(after)) {
    if (stale.has(kindOf(id, model))) {
      const existing = fingerprints[id];
      fingerprints[id] = typeof existing === "string" && existing.startsWith("stale:") ? existing : `stale:${String(existing ?? "unknown")}`;
    }
  }
  return { ...next, designInputFingerprints: fingerprints };
}
