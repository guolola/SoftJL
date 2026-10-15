// Compares each generated design branch with the models present when its run began.
import { designRecordBelongsToDiagramKinds } from "./models.js";
import { snapshotInputFingerprint } from "./fingerprints.js";
import type { DesignDiagramKind } from "./requirements.js";

export const designGenerationKinds: DesignDiagramKind[] = ["sequence", "architecture", "class", "navigation", "table", "component", "deployment"];
export function designBranchFingerprint(models: Record<string, unknown>, kind: DesignDiagramKind) {
  return snapshotInputFingerprint(Object.fromEntries(Object.entries(models).filter(([id, model]) => designRecordBelongsToDiagramKinds(id, model, [kind]))));
}
function artifactBody(value: unknown, key: "source" | "svg") {
  return typeof value === "string" ? value : value && typeof value === "object" ? (value as Record<string, unknown>)[key] ?? null : null;
}
export function designGenerationBaseFingerprints(models: Record<string, unknown>, sources: Record<string, unknown> = {}, svgs: Record<string, unknown> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const kind of designGenerationKinds) {
    result[kind] = designBranchFingerprint(models, kind);
    for (const [id, model] of Object.entries(models)) {
      if (!designRecordBelongsToDiagramKinds(id, model, [kind])) continue;
      result[`record:${kind}:${id}`] = snapshotInputFingerprint(model);
      result[`source:${kind}:${id}`] = snapshotInputFingerprint(artifactBody(sources[id], "source"));
      result[`svg:${kind}:${id}`] = snapshotInputFingerprint(artifactBody(svgs[id], "svg"));
    }
  }
  return result;
}

export function protectedDesignGenerationKinds(current: Record<string, unknown>, generated: Record<string, unknown>, base: Record<string, string>, applied: Record<string, string> = {}, artifacts?: { currentSources: Record<string, unknown>; currentSvgs: Record<string, unknown>; generatedSources: Record<string, unknown>; generatedSvgs: Record<string, unknown> }) {
  return designGenerationKinds.filter((kind) => {
    const fingerprint = designBranchFingerprint(current, kind);
    const entries = Object.entries(current).filter(([id, model]) => designRecordBelongsToDiagramKinds(id, model, [kind]));
    if (artifacts && entries.some(([id]) => (["source", "svg"] as const).some((type) => {
      const key = `${type}:${kind}:${id}`;
      if (!base[key]) return false;
      const value = snapshotInputFingerprint(artifactBody((type === "source" ? artifacts.currentSources : artifacts.currentSvgs)[id], type));
      return value !== base[key] && value !== applied[key] && value !== snapshotInputFingerprint(artifactBody((type === "source" ? artifacts.generatedSources : artifacts.generatedSvgs)[id], type));
    }))) return true;
    if (fingerprint === base[kind] || fingerprint === applied[kind] || fingerprint === designBranchFingerprint(generated, kind)) return false;
    const prefix = `record:${kind}:`;
    const initialIds = Object.keys(base).filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
    // Accepted partial results from this run may already be saved by a client.
    // Only baseline records or exact generated records can justify that change.
    if (initialIds.some((id) => !(id in current))) return true;
    if (!initialIds.length && base[kind] !== designBranchFingerprint({}, kind)) return true;
    return entries.some(([id, model]) => snapshotInputFingerprint(model) !== base[`${prefix}${id}`] && (!(id in generated) || snapshotInputFingerprint(model) !== snapshotInputFingerprint(generated[id])));
  });
}
