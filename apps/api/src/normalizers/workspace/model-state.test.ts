// Verifies that generated and manually edited models retain semantics across storage and downstream outputs.
import test from "node:test";
import assert from "node:assert/strict";
import { startDocumentRunRequestSchema, createRequirementBaselineSnapshot, requirementBaselineSchema, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture, parallelObjectActivityFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import { parseDesignDiagramModelsOnly } from "../design/design-model-normalizer.js";
import { parseRequirementDiagramModelsOnly } from "../requirements/requirement-model-normalizer.js";
import { collectModelRefs } from "../traceability/traceability-normalizer.js";
import { normalizeWorkspaceModelState } from "./model-state.js";
import { generateDesignPlantUmlArtifacts, generatePlantUmlArtifacts } from "../../plantuml.js";
import { buildDocumentContext } from "../../documents/context/document-context.js";

test("external rule edits rebuild the saved baseline and remove deleted rules", () => {
  const rule = { id: "r1", category: "功能需求" as const, text: "用户查看订单", relatedDiagrams: ["usecase" as const] };
  const old = createRequirementBaselineSnapshot({ runId: "old", requirementText: "订单系统", rules: [rule] });
  const state = { requirementText: "订单系统", rules: [{ ...rule, text: "用户只能查看本人订单" }], requirementBaseline: old };
  const saved = normalizeWorkspaceModelState(state);
  const baseline = requirementBaselineSchema.parse(saved.requirementBaseline);
  assert.equal(baseline.rules?.[0]?.text, state.rules[0]!.text);
  assert.equal(baseline.rules?.[0]?.requirementId, old.rules![0]!.requirementId);
  assert.equal(baseline.rules?.[0]?.origin, "manual-edited");
  assert.deepEqual(requirementBaselineSchema.parse(normalizeWorkspaceModelState({ ...saved, rules: [] }).requirementBaseline).rules, []);
  assert.equal(old.rules![0]!.text, rule.text);
});



test("workspace saves discard retired candidates without changing the supplied baseline", () => {
  const baseline = { runId: "source-run", requirements: [{ id: "r1", actor: "原始角色" }] };
  const state = { requirementBaseline: baseline, requirementReviewCandidates: { r1: { status: "accepted", afterRequirement: { actor: "候选角色" } } } };
  const before = structuredClone(state);
  const normalized = normalizeWorkspaceModelState(state);
  assert.deepEqual(normalized.requirementReviewCandidates, {});
  assert.deepEqual(normalized.requirementBaseline, baseline);
  assert.deepEqual(state, before);
});

test("navigation generation, edit, persistence, redraw, trace and documents share the same model", () => {
  const model = modelFixture("design", "navigation");
  if (model.diagramKind !== "navigation") throw new Error("fixture");
  const condition = "所有未保存字段均经过用户明确确认且拥有当前订单访问权限";
  model.relationships[0]!.condition = condition;
  const generated = parseDesignDiagramModelsOnly(JSON.stringify({ models: [model] })).models[0]!;
  if (generated.diagramKind !== "navigation") throw new Error("fixture");
  generated.nodes[0]!.route = "/orders/confirmed";
  const state = normalizeWorkspaceModelState({ designModels: { navigation: generated } });
  const saved = (state.designModels as Record<string, DesignDiagramModelSpec>).navigation!;
  const artifact = generateDesignPlantUmlArtifacts([saved])[0]!;
  assert.ok(artifact.source.includes(condition));
  assert.deepEqual(generateDesignPlantUmlArtifacts([saved])[0], artifact);
  assert.ok(collectModelRefs([saved]).refs.some((ref) => ref.elementId === "a"));
  const document = buildDocumentContext(startDocumentRunRequestSchema.parse({ documentKind: "softwareDesignSpec", requirementText: "支持订单访问。", designModels: [saved] }));
  assert.deepEqual(document.designModels[0], saved);
  if (saved.diagramKind === "navigation") saved.relationships[0]!.targetId = "absent";
  assert.throws(() => normalizeWorkspaceModelState({ designModels: { navigation: saved } }), /missing-endpoint/);
});

test("activity pins and object flows survive parsing, saving and redraw without mandatory pin trace entries", () => {
  const generated = parseRequirementDiagramModelsOnly(JSON.stringify({ models: [parallelObjectActivityFixture()] })).models[0]!;
  const state = normalizeWorkspaceModelState({ models: { activity: generated } });
  assert.deepEqual((state.models as Record<string, unknown>).activity, generated);
  const artifact = generatePlantUmlArtifacts([generated])[0]!;
  assert.ok(artifact.renderMapping?.elements.some((item) => item.elementId === "invoiceIn"));
  assert.ok(artifact.renderMapping?.relationships.some((item) => item.relationshipId === "invoice"));
  const { refs } = collectModelRefs([generated]);
  assert.ok(refs.some((ref) => ref.elementId === "invoice"));
  assert.ok(!refs.some((ref) => ref.elementId === "invoiceIn"));
});

test("workspace writes enforce feasibility profiles and reject malformed model collections", () => {
  assert.throws(() => normalizeWorkspaceModelState({ models: [] }), /contract/);
  assert.throws(() => normalizeWorkspaceModelState({ feasibilityContextModel: modelFixture("feasibility", "activity") }), /stage-model/);
  assert.throws(() => normalizeWorkspaceModelState({ feasibilityBusinessFlow: { model: parallelObjectActivityFixture() } }), /contract/);
  assert.deepEqual(normalizeWorkspaceModelState({ feasibilityBusinessFlow: { model: modelFixture("feasibility", "activity") } }).feasibilityBusinessFlow, { model: modelFixture("feasibility", "activity") });
});

test("rules and review saves preserve unchanged legacy models but still reject edited invalid models", () => {
  const legacyModel = { diagramKind: "usecase", title: "旧模型" };
  const previousState = { models: { usecase: legacyModel } };
  const next = normalizeWorkspaceModelState(
    { models: { usecase: structuredClone(legacyModel) }, requirementText: "新需求" },
    previousState,
  );
  assert.deepEqual(next.models, previousState.models);
  assert.throws(() => normalizeWorkspaceModelState(
    { models: { usecase: { ...legacyModel, title: "已编辑" } } },
    previousState,
  ));
});
