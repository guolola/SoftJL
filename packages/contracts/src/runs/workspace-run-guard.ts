// Guards replay and publication against edits to relevant inputs and write targets.
import { snapshotInputFingerprint } from "../fingerprints.js";
import { requirementBaselinePromptContext } from "../requirements/requirement-baseline-snapshot.js";
import { requirementBaselineSchema } from "../requirements/requirements.js";
import { designDependencies } from "../modeling/design-freshness.js";
import { assertCurrentRunSnapshot } from "../workspace/current-workspace.js";
import type { RunSnapshot, DesignRunSnapshot, DocumentRunSnapshot } from "./runs.js";
import { feasibilityInputsSchema, type FeasibilityRunSnapshot } from "../feasibility.js";
type RunRecord = { snapshot: RunSnapshot | DesignRunSnapshot | DocumentRunSnapshot | FeasibilityRunSnapshot; metadata?: { projectId?: string } };

type State = Record<string, unknown>;
const object = (value: unknown): State => value && typeof value === "object" && !Array.isArray(value) ? value as State : {};
const emptyFeasibilityInputsFingerprint = snapshotInputFingerprint(feasibilityInputsSchema.parse({}));
export function workspaceState(value: unknown): State {
  const record = object(value);
  return "state" in record ? object(record.state) : record;
}

function valueFor(state: State, key: string) {
  const [field, kind] = key.split(":");
  const value = state[field!];
  // A new project has no persisted rules field yet; the browser initializes it
  // to []. Both represent the same empty source, not an edit during generation.
  if (field === "rules") return value ?? [];
  // Publishing the first branch saves default facts. An untouched empty form
  // must still match the absent facts captured before generation started.
  if (field === "feasibilityInputs") {
    const parsed = feasibilityInputsSchema.safeParse(value ?? {});
    if (!parsed.success) return value;
    return snapshotInputFingerprint(parsed.data) === emptyFeasibilityInputsFingerprint ? null : parsed.data;
  }
  // The repository stores absent feasibility renders as empty strings, while
  // live session state uses null until an artifact exists. They are equivalent.
  if (field === "feasibilityContextPlantUml" || field === "feasibilityContextSvg") return value || null;
  if (field === "requirementBaseline") {
    const parsed = requirementBaselineSchema.safeParse(value);
    return parsed.success ? requirementBaselinePromptContext(parsed.data) : value ?? null;
  }
  if (!kind) return value ?? null;
  return Object.fromEntries(Object.entries(object(value)).filter(([id, model]) =>
    object(model).diagramKind === kind || id === kind || id.startsWith(`${kind}:`)));
}
const hashes = (state: State, keys: string[]) => Object.fromEntries(keys.map(key => [key, snapshotInputFingerprint(valueFor(state, key))]));

export function captureWorkspaceGuard(record: RunRecord, state: State) {
  const snapshot = record.snapshot;
  const inputs = ["requirementText", "rules", "requirementBaseline"];
  const targets: string[] = [];
  if ("documentKind" in snapshot) {
    inputs.push("models", "requirementModelTraceability", "plantUml", "svgArtifacts", "designModels", "designModelTraceability", "designPlantUml", "designSvgArtifacts", "feasibilityInputs", "feasibilityImplementationPlan");
  } else if ("selectedArtifacts" in snapshot) {
    inputs.push("feasibilityInputs");
    if (snapshot.selectedArtifacts.includes("implementation")) inputs.push("feasibilityBusinessFlow", "feasibilityContextModel");
    for (const kind of snapshot.selectedArtifacts) targets.push(...(kind === "context" ? ["feasibilityContextModel", "feasibilityContextPlantUml", "feasibilityContextSvg"] : kind === "business-flow" ? ["feasibilityBusinessFlow"] : ["feasibilityImplementationPlan"]));
  } else if ("designModelTraceability" in snapshot) {
    inputs.push("models", "requirementModelTraceability");
    const selected = new Set(snapshot.selectedDiagrams);
    // Only supplied upstream design kinds are read by this operation.
    for (const kind of new Set(snapshot.models.filter(model => !selected.has(model.diagramKind)).map(model => model.diagramKind))) inputs.push(`designModels:${kind}`);
    for (const kind of selected) targets.push(`designModels:${kind}`, `designPlantUml:${kind}`, `designSvgArtifacts:${kind}`);
  } else {
    if (snapshot.selectedDiagrams.includes("analysis") && !snapshot.selectedDiagrams.includes("usecase")) inputs.push("models:usecase");
    for (const kind of snapshot.selectedDiagrams) targets.push(`models:${kind}`, `plantUml:${kind}`, `svgArtifacts:${kind}`);
    if (!snapshot.selectedDiagrams.length) targets.push("requirementText", "rules", "requirementBaseline");
  }
  return { version: 1 as const, inputs: hashes(state, inputs), targets: hashes(state, targets) };
}

function ownAcceptedValues(record: RunRecord): State {
  const snapshot = record.snapshot;
  const outputs = snapshot.outputManifest;
  const state: State = {};
  if ("documentKind" in snapshot) return state;
  if ("selectedArtifacts" in snapshot) {
    if (outputs.some(item => item.kind === "context")) Object.assign(state, { feasibilityContextModel: snapshot.contextModel, feasibilityContextPlantUml: snapshot.contextPlantUml?.source, feasibilityContextSvg: snapshot.contextSvg?.svg });
    if (outputs.some(item => item.kind === "businessFlow")) state.feasibilityBusinessFlow = snapshot.businessFlow;
    if (outputs.some(item => item.kind === "implementationPlan")) state.feasibilityImplementationPlan = snapshot.implementationPlan;
    return state;
  }
  const design = "designModelTraceability" in snapshot;
  const accepted = new Set(outputs.filter(item => item.kind === "model").map(item => item.id));
  const models = snapshot.models.filter(model => accepted.has(model.modelId ?? model.diagramKind));
  const ids = new Set(models.map(model => model.modelId ?? model.diagramKind));
  state[design ? "designModels" : "models"] = Object.fromEntries(models.map(model => [model.modelId ?? model.diagramKind, model]));
  state[design ? "designPlantUml" : "plantUml"] = Object.fromEntries(snapshot.plantUml.filter(item => ids.has(item.modelId ?? item.diagramKind)).map(item => [item.modelId ?? item.diagramKind, item.source]));
  state[design ? "designSvgArtifacts" : "svgArtifacts"] = Object.fromEntries(snapshot.svgArtifacts.filter(item => ids.has(item.modelId ?? item.diagramKind)).map(item => [item.modelId ?? item.diagramKind, item]));
  if (!design && outputs.some(item => item.kind === "rule")) Object.assign(state, { requirementText: snapshot.requirementText, rules: snapshot.rules, requirementBaseline: snapshot.requirementBaseline });
  return state;
}

export function workspaceGuardConflicts(record: RunRecord, state: State, includeTargets = true): string[] {
  const guard = record.snapshot.workspaceGuard;
  if (!guard) return ["missing-original-inputs"];
  const own = ownAcceptedValues(record);
  const expected = { ...guard.inputs, ...(includeTargets ? guard.targets : {}) };
  return Object.entries(expected).flatMap(([key, fingerprint]) => {
    const actual = snapshotInputFingerprint(valueFor(state, key));
    if (actual === fingerprint) return [];
    const field = key.split(":")[0]!;
    const accepted = valueFor(own, key);
    // Only outputs actually accepted by this run can explain a changed value.
    if (field in own && accepted !== null && (typeof accepted !== "object" || Object.keys(accepted as object).length > 0) && actual === snapshotInputFingerprint(accepted)) return [];
    return [key];
  });
}

export function retryInputProblem(record: RunRecord, state?: State) {
  if (object(record.snapshot).operationType === "quick_modeling") return "请在快速建模项目中继续或重新发送消息。";
  const source = record.snapshot;
  // Retries must not translate outdated records into apparently current queued runs.
  try {
    assertCurrentRunSnapshot(source);
  } catch {
    return "原任务不符合当前生成契约，请从当前工作区重新生成。";
  }
  if ("designModelTraceability" in source && !requirementBaselineSchema.safeParse(source.requirementBaseline).success) {
    return "原任务不符合当前生成契约，请从当前工作区重新生成。";
  }
  if ("documentKind" in record.snapshot && !record.snapshot.replayInput) return "原任务未保存完整文档输入，请从文档页面重新生成。";
  if (!record.metadata?.projectId) return null;
  if (!state || !record.snapshot.workspaceGuard) return "原任务缺少可验证的输入快照，请从当前工作区重新生成。";
  let candidate = record;
  const snapshot = record.snapshot;
  if ("designModelTraceability" in snapshot) {
    const guard = snapshot.workspaceGuard!;
    const resolvedModels = Object.fromEntries(snapshot.requirementModels.map(model => [model.modelId ?? model.diagramKind, model]));
    const currentModels = valueFor(state, "models");
    // A preceding workspace save can change the captured catalog representation.
    // Exact equality with the design run's frozen inputs proves this is still a valid replay.
    if (guard.inputs.models && snapshotInputFingerprint(resolvedModels) === snapshotInputFingerprint(currentModels)) {
      candidate = { ...record, snapshot: { ...snapshot, workspaceGuard: { ...guard, inputs: { ...guard.inputs, models: snapshotInputFingerprint(currentModels) } } } };
    }
  }
  if ("diagramErrors" in snapshot && "selectedDiagrams" in snapshot) {
    const failed = Object.entries(snapshot.diagramErrors).filter(([, value]) => value.error.retryable).map(([key]) => key.split(":")[0]!);
    if (failed.length) {
      const relevant = new Set(failed);
      const visit = (kind: string) => { for (const dependency of designDependencies[kind] ?? []) if (!relevant.has(dependency)) { relevant.add(dependency); visit(dependency); } };
      if ("designModelTraceability" in snapshot) failed.forEach(visit);
      const guard = candidate.snapshot.workspaceGuard!;
      candidate = { ...candidate, snapshot: { ...candidate.snapshot, workspaceGuard: { ...guard, targets: Object.fromEntries(Object.entries(guard.targets).filter(([key]) => !key.includes(":") || relevant.has(key.split(":")[1]!))) } } };
    }
  }
  return workspaceGuardConflicts(candidate, state).length ? "相关输入或目标产物已变更，无法重试旧任务，请从当前工作区重新生成。" : null;
}
