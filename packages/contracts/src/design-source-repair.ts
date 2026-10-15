// Previews provenance-only repairs after proving sources and published artifacts are unchanged.
import { activeRequirementModels } from "./active-requirement-models.js";
import { designInputFingerprint, snapshotInputFingerprint } from "./fingerprints.js";
import { designDiagramModelSpecSchema } from "./models.js";
import type { DesignRunSnapshot } from "./runs.js";

export function previewDesignSourceRepair(state: Record<string, unknown>, source: DesignRunSnapshot, legacyFingerprint: string, requirementInput?: { requirementText: string; rules: unknown[] }) {
  const models = Object.values((state.models ?? {}) as Record<string, unknown>);
  const trace = (state.requirementModelTraceability ?? []) as unknown[];
  const fingerprint = designInputFingerprint(models, trace);
  const active = activeRequirementModels(source.requirementModels);
  if (active.length >= source.requirementModels.length) throw new Error("来源记录没有已确认的失效用例来源，拒绝修复");
  // Historical design snapshots may omit text/rules. Prove them against their
  // original requirement run rather than treating an empty field as authority.
  const originalInput = requirementInput ?? source;
  if (fingerprint !== designInputFingerprint(active, source.requirementModelTraceability) || state.requirementText !== originalInput.requirementText || snapshotInputFingerprint(state.rules ?? []) !== snapshotInputFingerprint(originalInput.rules)) throw new Error("当前需求与原任务有效来源不一致，拒绝修复");
  const currentModels = (state.designModels ?? {}) as Record<string, unknown>;
  const fingerprints = (state.designInputFingerprints ?? {}) as Record<string, string>;
  const plantUml = (state.designPlantUml ?? {}) as Record<string, string>;
  const svg = (state.designSvgArtifacts ?? {}) as Record<string, { svg?: string }>;
  const changes: Array<{ modelId: string; before: string; after: string }> = [];
  const skipped: string[] = [];
  for (const model of source.models) {
    const id = model.modelId ?? model.diagramKind;
    if (fingerprints[id] === fingerprint) continue;
    const original = designDiagramModelSpecSchema.safeParse(model);
    const current = designDiagramModelSpecSchema.safeParse(currentModels[id]);
    const sourceUml = source.plantUml.find((artifact) => (artifact.modelId ?? artifact.diagramKind) === id);
    const sourceSvg = source.svgArtifacts.find((artifact) => (artifact.modelId ?? artifact.diagramKind) === id);
    if (fingerprints[id] !== legacyFingerprint || !original.success || !current.success || snapshotInputFingerprint(original.data) !== snapshotInputFingerprint(current.data) || !sourceUml || !sourceSvg || plantUml[id] !== sourceUml.source || svg[id]?.svg !== sourceSvg.svg) { skipped.push(id); continue; }
    changes.push({ modelId: id, before: fingerprints[id]!, after: fingerprint });
  }
  return { fingerprint, originalSourceCount: source.requirementModels.length, activeSourceCount: active.length, changes, skipped };
}
