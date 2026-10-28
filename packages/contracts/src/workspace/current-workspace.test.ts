// Verifies read boundaries reject obsolete data while preserving saved facts, drafts and source versions.
import assert from "node:assert/strict";
import test from "node:test";
import { assertCurrentRunSnapshot, assertCurrentWorkspaceState } from "./current-workspace.js";
import { runSnapshotSchema } from "../runs/runs.js";
import { feasibilityRunSnapshotSchema } from "../feasibility.js";
import { modelFixture } from "../testing/model-fixtures.js";
import { createRequirementBaselineSnapshot } from "../requirements/requirement-baseline-snapshot.js";

test("workspace boundaries reject the retired duplicate quality report without rewriting saved state", () => {
  const state = { rules: [], requirementBaseline: null, requirementQualityReport: null };
  const before = structuredClone(state);
  assert.throws(() => assertCurrentWorkspaceState(state), /requirementQualityReport/);
  assert.deepEqual(state, before);
});

function retryBusinessFlow() {
  const model = modelFixture("requirements", "activity");
  if (model.diagramKind !== "activity") throw new Error("Expected activity fixture");
  model.nodes.push(
    { id: "coverage", type: "decision", question: "覆盖率是否达标？", actorOrLane: "system" },
    { id: "retry", type: "activity", name: "补录后重新判断", actorOrLane: "system", input: [], output: [] },
  );
  model.relationships = [
    { id: "start-work", type: "control_flow", sourceId: "start", targetId: "work" },
    { id: "check", type: "control_flow", sourceId: "work", targetId: "coverage" },
    { id: "pass", type: "control_flow", sourceId: "coverage", targetId: "end", condition: "达标" },
    { id: "retry", type: "control_flow", sourceId: "coverage", targetId: "retry", condition: "未达标" },
    { id: "recheck", type: "control_flow", sourceId: "retry", targetId: "coverage" },
  ];
  return model;
}

test("reading saved requirement output preserves a rendered decision with a retry input", () => {
  const model = retryBusinessFlow();
  const plantUml = { diagramKind: "activity" as const, modelId: model.modelId, source: "@startuml\nstart\nstop\n@enduml" };
  const svg = { diagramKind: "activity" as const, modelId: model.modelId, svg: "<svg/>", renderMeta: {
    engine: "test", generatedAt: "2026-01-01T00:00:00.000Z", sourceLength: plantUml.source.length, durationMs: 1,
  } };
  const state = { models: { [model.modelId!]: model }, plantUml: { [model.modelId!]: plantUml.source }, svgArtifacts: { [model.modelId!]: svg } };
  const snapshot = runSnapshotSchema.parse({
    runId: "rendered-retry", requirementText: "补录后重新判断覆盖率", selectedDiagrams: ["activity"], rules: [],
    models: [model], plantUml: [plantUml], svgArtifacts: [svg], requirementModelTraceability: [],
    currentStage: null, status: "completed", error: null, operationType: "requirement_modeling",
    outputManifest: [{ kind: "model", id: model.modelId, diagramKind: "activity" }],
  });
  const before = structuredClone({ state, snapshot });
  assert.doesNotThrow(() => assertCurrentWorkspaceState(state));
  assert.doesNotThrow(() => assertCurrentRunSnapshot(snapshot));
  assert.deepEqual({ state, snapshot }, before);
});

test("reading saved feasibility output does not recheck retry loop degrees", () => {
  const model = retryBusinessFlow();
  const businessFlow = {
    model, traceability: [{ requirementId: "R1", targetId: "coverage", targetKind: "node" as const }],
    plantUml: { diagramKind: "activity" as const, modelId: model.modelId, source: "@startuml\nstart\nstop\n@enduml" },
    svg: { diagramKind: "activity" as const, modelId: model.modelId, svg: "<svg/>", renderMeta: {
      engine: "test", generatedAt: "2026-01-01T00:00:00.000Z", sourceLength: 30, durationMs: 1,
    } }, fingerprint: "saved-input",
  };
  const state = { feasibilityBusinessFlow: businessFlow };
  const snapshot = feasibilityRunSnapshotSchema.parse({
    runId: "rendered-feasibility", projectId: "project", operationType: "feasibility_analysis", outputManifest: [],
    selectedArtifacts: ["business-flow"], businessFlow,
    providerSettings: { providerConfigId: "provider", model: "model" }, rules: [], requirementBaseline: null,
    inputs: {}, contextModel: null, contextPlantUml: null, contextSvg: null, implementationPlan: null,
    contextFingerprint: null, implementationFingerprint: null, currentStage: null, status: "completed", error: null,
  });
  const before = structuredClone({ state, snapshot });
  assert.doesNotThrow(() => assertCurrentWorkspaceState(state));
  assert.doesNotThrow(() => assertCurrentRunSnapshot(snapshot));
  assert.deepEqual({ state, snapshot }, before);
});

test("current workspace validation never rebuilds facts, model fields or fingerprints", () => {
  const state = { models: { class: modelFixture("requirements", "class") }, designInputFingerprints: { class: "obsolete-input" } };
  const before = structuredClone(state);
  assertCurrentWorkspaceState(state);
  assert.deepEqual(state, before);
});

test("scoped models require explicit use-case provenance even when their IDs encode a source", () => {
  for (const kind of ["analysis", "sequence"] as const) {
    const stage = kind === "analysis" ? "requirements" : "design";
    const model = { ...modelFixture(stage, kind), modelId: `${kind}:case` } as Record<string, unknown>;
    const field = kind === "analysis" ? "models" : "designModels";
    assert.doesNotThrow(() => assertCurrentWorkspaceState({ [field]: { [String(model.modelId)]: model } }));
    delete model.sourceUseCaseId;
    const state = { [field]: { [String(model.modelId)]: model } };
    const before = structuredClone(state);
    assert.throws(() => assertCurrentWorkspaceState(state), /sourceUseCaseId/);
    assert.deepEqual(state, before);
  }
});

test("read boundaries reject mismatched rule facts without rewriting the baseline", () => {
  const rule = { id: "r1", text: "用户提交订单", type: "functional" as const };
  const requirementBaseline = createRequirementBaselineSnapshot({ runId: "source", requirementText: rule.text, rules: [rule] });
  const state = { rules: [{ ...rule, text: "用户取消订单" }], requirementBaseline };
  const before = structuredClone(state);
  assert.throws(() => assertCurrentWorkspaceState(state), /baseline does not match/);
  assert.throws(() => assertCurrentRunSnapshot(state), /baseline does not match/);
  assert.deepEqual(state, before);
});

test("obsolete model, baseline, feasibility and test payloads fail current workspace validation", () => {
  for (const state of [
    { models: { usecase: { diagramKind: "usecase", title: "obsolete" } } },
    { designModels: { navigation: { diagramKind: "navigation", title: "obsolete" } } },
    { requirementBaseline: { requirements: [] } },
    { feasibilityImplementationPlan: { architecture: {}, candidates: [] } },
    { feasibilityBusinessFlow: { model: modelFixture("feasibility", "activity") } },
    { testGenerationResult: { testCases: [{}] } },
    { svgArtifacts: { class: { diagramKind: "class", svg: "<svg/>" } } },
    { designSvgArtifacts: { class: { diagramKind: "class", svg: "<svg/>" } } },
    { standardProject: { description: "旧项目" } },
    { standardProject: { description: "旧模型", rounds: [], diagrams: { class: { id: "class", kind: "class", title: "类图", status: "completed", model: { nodes: [], edges: [] } } } } },
    { plantUml: { class: { source: "@startuml\n@enduml" } } },
    { requirementReviewCandidates: {} },
    { visualReviews: { usecase: { status: "passed", issues: [], reason: "旧检查", attempts: 1, checkedAt: "check" } } },
  ]) assert.throws(() => assertCurrentWorkspaceState(state));
});

test("current candidate drafts may explicitly omit implementation details", () => {
  const state = { feasibilityImplementationPlan: {
    overview: "草稿", recommendedCandidateId: "option", recommendationRationale: "用户正在编辑", candidates: [{
      id: "option", name: "方案", summary: "草稿", advantages: [], disadvantages: [], estimatedCost: "待确认",
      estimatedSchedule: "待确认", implementation: null, provenance: "user-edited",
    }],
  } };
  assert.doesNotThrow(() => assertCurrentWorkspaceState(state));
  assert.equal(state.feasibilityImplementationPlan.candidates[0]!.implementation, null);
});

test("snapshots require explicit provenance and current structured models before reuse", () => {
  const snapshot = runSnapshotSchema.parse({ runId: "run", requirementText: "需求", selectedDiagrams: [], rules: [],
    models: [], plantUml: [], svgArtifacts: [], requirementTrace: [], requirementModelTraceability: [], currentStage: null, status: "completed", error: null,
    operationType: "requirement_extraction", outputManifest: [],
  });
  assert.doesNotThrow(() => assertCurrentRunSnapshot(snapshot));
  for (const field of ["operationType", "outputManifest"] as const) {
    const obsolete = { ...snapshot };
    delete (obsolete as Record<string, unknown>)[field];
    assert.throws(() => assertCurrentRunSnapshot(obsolete));
  }
  assert.throws(() => assertCurrentRunSnapshot({ ...snapshot, models: [{ diagramKind: "usecase", title: "obsolete" }] }));
  for (const operationType of ["unknown", "design_modeling", "document_generation", "feasibility_analysis"])
    assert.throws(() => assertCurrentRunSnapshot({ ...snapshot, operationType }));
  assert.throws(() => assertCurrentRunSnapshot({ ...snapshot, selectedDiagrams: ["usecase"] }));
});
