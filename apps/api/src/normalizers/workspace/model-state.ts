// Applies shared model semantics to manual workspace writes before they reach persistent storage.
import { isDeepStrictEqual } from "node:util";
import { stripRetiredCodeData } from "@uml-platform/contracts";
import { deriveTableModel, getStageModelSchema, ModelSemanticError, validateModelInput, type ModelingStage, type TableDiagramSpec } from "@uml-platform/contracts";

export function normalizeWorkspaceModelState(state: Record<string, unknown>, previousState: Record<string, unknown> = {}) {
  // Old browser sessions must not reintroduce retired prototype data after the migration.
  const next = stripRetiredCodeData({ ...state });
  const normalize = (model: unknown, stage: ModelingStage, expectedKind?: string) => {
    const diagnostics = validateModelInput(model, stage);
    if (diagnostics.length) throw new ModelSemanticError(diagnostics);
    const kind = (model as { diagramKind: string }).diagramKind;
    if (expectedKind && kind !== expectedKind) throw new ModelSemanticError([{ modelId: kind, diagramKind: kind, code: "stage-model", path: "diagramKind", severity: "error", message: `此位置仅接受 ${expectedKind} 模型` }]);
    const parsed = getStageModelSchema(stage, kind)!.parse(model);
    return kind === "table" ? deriveTableModel(parsed as TableDiagramSpec) : parsed;
  };
  // A rules-only save can carry older models in the full workspace payload.
  // Validate models that changed, while preserving untouched legacy artifacts.
  if (next.feasibilityContextModel != null && !isDeepStrictEqual(next.feasibilityContextModel, previousState.feasibilityContextModel)) next.feasibilityContextModel = normalize(next.feasibilityContextModel, "feasibility", "context");
  if (next.feasibilityBusinessFlow && typeof next.feasibilityBusinessFlow === "object" && "model" in next.feasibilityBusinessFlow) {
    const flow = next.feasibilityBusinessFlow;
    const previousFlow = previousState.feasibilityBusinessFlow;
    const previousModel = previousFlow && typeof previousFlow === "object" && "model" in previousFlow ? previousFlow.model : undefined;
    if (!isDeepStrictEqual(flow.model, previousModel)) next.feasibilityBusinessFlow = { ...flow, model: normalize(flow.model, "feasibility", "activity") };
  }
  for (const [key, stage] of [["models", "requirements"], ["designModels", "design"]] as const) {
    const collection = next[key];
    if (collection === undefined) continue;
    if (!collection || typeof collection !== "object" || Array.isArray(collection)) throw new ModelSemanticError([{ modelId: key, diagramKind: "unknown", code: "contract", path: key, severity: "error", message: "模型集合必须是以模型标识为键的对象" }]);
    const models: Record<string, unknown> = {};
    const previousModels = previousState[key] && typeof previousState[key] === "object" && !Array.isArray(previousState[key])
      ? previousState[key] as Record<string, unknown>
      : {};
    for (const [id, model] of Object.entries(collection)) {
      models[id] = isDeepStrictEqual(model, previousModels[id]) ? model : normalize(model, stage);
    }
    next[key] = models;
  }
  return next;
}
