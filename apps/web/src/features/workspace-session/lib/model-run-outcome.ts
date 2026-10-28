// Resolves this run's model outcomes from accepted receipts and the original generation scope.
import type { DesignRunSnapshot, RunSnapshot } from "@uml-platform/contracts";
import { getModelTaskLabel } from "../../../entities/diagram/model";
import { i18n } from "../../../shared/i18n/i18n";

export function modelRunOutcome(snapshot: RunSnapshot | DesignRunSnapshot) {
  if (snapshot.status !== "completed" && snapshot.status !== "failed") return { succeeded: [], failed: [] };
  const design = "requirementModels" in snapshot;
  const selected = new Set<string>(snapshot.selectedDiagrams);
  const targets = new Map<string, string>();
  for (const kind of selected) {
    const scoped = kind === "analysis" || kind === "sequence";
    const savedIds = kind === "analysis" && "analysisTargetUseCaseIds" in snapshot ? snapshot.analysisTargetUseCaseIds
      : kind === "sequence" && design ? snapshot.sequenceTargetUseCaseIds : [];
    const sources = design ? snapshot.requirementModels : snapshot.models;
    const useCases = sources.flatMap((model) => model.diagramKind === "usecase" ? model.useCases : []);
    const ids = scoped ? (savedIds?.length ? savedIds : useCases.map((item) => item.id)) : [];
    const models = snapshot.models.filter((model) => model.diagramKind === kind);
    if (ids.length) {
      for (const useCaseId of ids) {
        const model = models.find((item) => (item.diagramKind === "analysis" || item.diagramKind === "sequence") && item.sourceUseCaseId === useCaseId);
        targets.set(model?.modelId ?? `${kind}:${useCaseId}`, kind);
      }
    } else if (models.length) {
      for (const model of models) targets.set(model.modelId ?? kind, kind);
    } else {
      targets.set(kind, kind);
    }
  }
  // Instance failures may precede model creation. Keep their use-case identities visible.
  for (const id of Object.keys(snapshot.diagramErrors)) {
    const kind = snapshot.models.find((model) => model.modelId === id)?.diagramKind ?? id.split(":")[0]!;
    if (!selected.has(kind)) continue;
    if (id !== kind) targets.delete(kind);
    if (id !== kind || ![...targets.values()].includes(kind)) targets.set(id, kind);
  }
  const accepted = new Set(snapshot.outputManifest.filter((output) => output.kind === "model").map((output) => output.id));
  const succeeded: string[] = [];
  const failed: string[] = [];
  for (const [id, kind] of targets) {
    const label = getModelTaskLabel(id, { design, models: snapshot.models,
      requirementModels: design ? snapshot.requirementModels : undefined, t: i18n.t.bind(i18n) });
    const success = accepted.has(id) && !snapshot.diagramErrors[id] && !snapshot.diagramErrors[kind];
    (success ? succeeded : failed).push(label);
  }
  return { succeeded, failed };
}
