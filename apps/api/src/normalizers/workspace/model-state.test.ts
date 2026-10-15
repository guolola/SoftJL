// Verifies that generated and manually edited models retain semantics across storage and downstream outputs.
import test from "node:test";
import assert from "node:assert/strict";
import { startDocumentRunRequestSchema, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture, parallelObjectActivityFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import { parseDesignDiagramModelsOnly } from "../design/design-model-normalizer.js";
import { parseRequirementDiagramModelsOnly } from "../requirements/requirement-model-normalizer.js";
import { collectModelRefs } from "../traceability/traceability-normalizer.js";
import { normalizeWorkspaceModelState } from "./model-state.js";
import { generateDesignPlantUmlArtifacts, generatePlantUmlArtifacts } from "../../plantuml.js";
import { buildDocumentContext } from "../../documents/context/document-context.js";



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
