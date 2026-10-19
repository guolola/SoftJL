// Verifies read boundaries reject obsolete data while preserving saved facts, drafts and source versions.
import assert from "node:assert/strict";
import test from "node:test";
import { assertCurrentRunSnapshot, assertCurrentWorkspaceState } from "./current-workspace.js";
import { runSnapshotSchema } from "./runs.js";
import { modelFixture } from "./testing/model-fixtures.js";
import { createRequirementBaselineSnapshot } from "./requirement-baseline-snapshot.js";

test("current workspace validation never rebuilds facts, model fields or fingerprints", () => {
  const state = { models: { class: modelFixture("requirements", "class") }, designInputFingerprints: { class: "obsolete-input" } };
  const before = structuredClone(state);
  assertCurrentWorkspaceState(state);
  assert.deepEqual(state, before);
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
