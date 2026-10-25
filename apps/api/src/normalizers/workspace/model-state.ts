// Applies shared model semantics to manual workspace writes before they reach persistent storage.
import { assertCurrentWorkspaceState, invalidateDesignDependents, createRequirementBaselineSnapshot, requirementBaselineSchema, requirementRulesSchema } from "@uml-platform/contracts";
import { deriveTableModel, getStageModelSchema, ModelSemanticError, validateModelInput, type ModelingStage, type TableDiagramSpec } from "@uml-platform/contracts";

export function normalizeWorkspaceModelState(state: Record<string, unknown>, previousState: Record<string, unknown> = {}) {
  const next: Record<string, unknown> = {
    ...state,
    ...(state.requirementBaseline === undefined && previousState.requirementBaseline
      ? { requirementBaseline: previousState.requirementBaseline } : {}),
  };
  // An explicit rule write creates a new manual baseline before validating the
  // complete saved state. Read paths never create baselines or alter provenance.
  if (Array.isArray(next.rules)) {
    next.rules = requirementRulesSchema.parse(next.rules);
    const previous = requirementBaselineSchema.nullable().parse(next.requirementBaseline ?? previousState.requirementBaseline ?? null);
    const baseline = createRequirementBaselineSnapshot({
      runId: previous?.runId ?? "manual-rules",
      requirementText: typeof next.requirementText === "string" ? next.requirementText : "",
      rules: requirementRulesSchema.parse(next.rules),
      previousBaseline: previous,
    });
    next.requirementBaseline = baseline;
  }
  assertCurrentWorkspaceState(next);
  const normalize = (model: unknown, stage: ModelingStage, expectedKind?: string) => {
    const diagnostics = validateModelInput(model, stage);
    if (diagnostics.length) throw new ModelSemanticError(diagnostics);
    const kind = (model as { diagramKind: string }).diagramKind;
    if (expectedKind && kind !== expectedKind) throw new ModelSemanticError([{ modelId: kind, diagramKind: kind, code: "stage-model", path: "diagramKind", severity: "error", message: `此位置仅接受 ${expectedKind} 模型` }]);
    const parsed = getStageModelSchema(stage, kind)!.parse(model);
    return kind === "table" ? deriveTableModel(parsed as TableDiagramSpec) : parsed;
  };
  // Every persisted model must satisfy the current contract, including unchanged records.
  if (next.feasibilityContextModel != null) next.feasibilityContextModel = normalize(next.feasibilityContextModel, "feasibility", "context");
  if (next.feasibilityBusinessFlow && typeof next.feasibilityBusinessFlow === "object" && "model" in next.feasibilityBusinessFlow) {
    const flow = next.feasibilityBusinessFlow;
    next.feasibilityBusinessFlow = { ...flow, model: normalize(flow.model, "feasibility", "activity") };
  }
  for (const [key, stage] of [["models", "requirements"], ["designModels", "design"]] as const) {
    const collection = next[key];
    if (collection === undefined) continue;
    if (!collection || typeof collection !== "object" || Array.isArray(collection)) throw new ModelSemanticError([{ modelId: key, diagramKind: "unknown", code: "contract", path: key, severity: "error", message: "模型集合必须是以模型标识为键的对象" }]);
    const models: Record<string, unknown> = {};
    for (const [id, model] of Object.entries(collection)) {
      models[id] = normalize(model, stage);
    }
    next[key] = models;
  }
  return invalidateDesignDependents(previousState, next);
}
