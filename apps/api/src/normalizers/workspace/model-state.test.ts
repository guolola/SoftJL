// Verifies that generated and manually edited models retain semantics across storage and downstream outputs.
import test from "node:test";
import assert from "node:assert/strict";
import { designInputFingerprint, snapshotInputFingerprint, startDocumentRunRequestSchema, createRequirementBaselineSnapshot, requirementBaselineSchema, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture, parallelActivityFixture, objectActivityFixture } from "@uml-platform/contracts/testing";

import { parseRequirementDiagramModelsOnly } from "../requirements/requirement-model-normalizer.js";
import { collectModelRefs } from "@uml-platform/contracts";
import { normalizeWorkspaceModelState } from "./model-state.js";
import { generateDesignPlantUmlArtifacts, generatePlantUmlArtifacts } from "../../adapters/plantuml/model-renderer.js";
import { buildDocumentContext } from "../../documents/context/document-context.js";

test("rejects obsolete classifications on workspace writes without mutating input", () => {
  const state = { rules: [{ id: "R1", text: "用户预约", category: "功能需求" }] };
  assert.throws(() => normalizeWorkspaceModelState(state), /type/);
  assert.equal("classification" in state.rules[0]!, false);
});

test("external rule edits rebuild the saved baseline and remove deleted rules", () => {
  const rule = { id: "r1", type: "functional" as const, text: "用户查看订单",  };
  const old = createRequirementBaselineSnapshot({ runId: "old", requirementText: "订单系统", rules: [rule] });
  const state = { requirementText: "订单系统", rules: [{ ...rule, text: "用户只能查看本人订单" }], requirementBaseline: old };
  const saved = normalizeWorkspaceModelState(state);
  const baseline = requirementBaselineSchema.parse(saved.requirementBaseline);
  assert.equal(baseline.rules?.[0]?.text, state.rules[0]!.text);
  assert.equal(baseline.rules?.[0]?.requirementId, old.rules![0]!.requirementId);
  assert.equal("origin" in baseline.rules[0]!, false);
  assert.deepEqual(requirementBaselineSchema.parse(normalizeWorkspaceModelState({ ...saved, rules: [] }).requirementBaseline).rules, []);
  assert.equal(old.rules![0]!.text, rule.text);
});

test("manual workspace writes preserve type and text and unchanged baseline annotations", () => {
  const rule = { id: "r1", type: "functional" as const, text: "用户只能查看自己的订单" };
  const baseline = createRequirementBaselineSnapshot({ runId: "manual", requirementText: rule.text, rules: [rule] });
  const next = normalizeWorkspaceModelState({ requirementText: rule.text, rules: [rule], requirementBaseline: baseline });
  assert.deepEqual(next.rules, [rule]);
  const changed = normalizeWorkspaceModelState({ requirementText: rule.text, rules: [{ ...rule, type: "data" }], requirementBaseline: baseline });
  assert.equal((changed.rules as typeof rule[])[0].type, "data");
});

test("saving a rule edit preserves unrelated requirement and design model freshness across subsequent saves", () => {
  const rules = ([{ id: "r-data", type: "data" as const, text: "记录订单数据",  },
    { id: "r-ui", type: "interaction" as const, text: "浏览订单页面",  }]);
  const models = { class: modelFixture("requirements", "class"), prototype: modelFixture("requirements", "prototype") };
  const trace = [{ ruleId: "r-data", target: { modelId: "class", diagramKind: "class", elementId: "order", elementKind: "class", label: "Order" } },
    { ruleId: "r-ui", target: { modelId: "prototype", diagramKind: "prototype", elementId: "a", elementKind: "screen", label: "Screen" } }];
  const fingerprint = snapshotInputFingerprint({ requirementText: "订单需求", rules });
  const designFingerprint = designInputFingerprint(Object.values(models), trace);
  const before = { requirementText: "订单需求", rules, models, requirementModelTraceability: trace,
    designModels: { class: modelFixture("design", "class"), navigation: modelFixture("design", "navigation") },
    designModelTraceability: [{ source: { modelId: "class", diagramKind: "class", elementId: "order", elementKind: "class", label: "Order" }, targets: [trace[0].target] },
      { source: { modelId: "navigation", diagramKind: "navigation", elementId: "a", elementKind: "screen", label: "Screen" }, targets: [trace[1].target] }],
    diagramInputFingerprints: { class: fingerprint, prototype: fingerprint },
    designInputFingerprints: { class: designFingerprint, navigation: designFingerprint } };
  const edited = { ...before, rules: rules.map(rule => rule.id === "r-data" ? { ...rule, text: "记录订单及其来源" } : rule) };
  const saved = normalizeWorkspaceModelState(edited, before);
  const current = snapshotInputFingerprint({ requirementText: before.requirementText, rules: edited.rules });
  assert.equal((saved.diagramInputFingerprints as Record<string, string>).prototype, current);
  assert.notEqual((saved.diagramInputFingerprints as Record<string, string>).class, current);
  assert.equal((saved.designInputFingerprints as Record<string, string>).navigation, designFingerprint);
  assert.ok((saved.designInputFingerprints as Record<string, string>).class.startsWith("stale:"));
  const reloaded = normalizeWorkspaceModelState(saved, saved);
  assert.deepEqual(reloaded.diagramInputFingerprints, saved.diagramInputFingerprints);
  assert.deepEqual(reloaded.designInputFingerprints, saved.designInputFingerprints);
});

test("vertical lane flows survive parsing, saving and redraw with their exact graph", () => {
  const generated = parseRequirementDiagramModelsOnly(JSON.stringify({ models: [parallelActivityFixture()] })).models[0]!;
  const state = normalizeWorkspaceModelState({ models: { activity: generated } });
  assert.deepEqual((state.models as Record<string, unknown>).activity, generated);
  const artifact = generatePlantUmlArtifacts([generated])[0]!;
  assert.equal(artifact.renderMapping?.mode, "native");
  assert.ok(artifact.renderMapping?.elements.some(item => item.elementId === "settle"));
  assert.ok(artifact.renderMapping?.relationships.some(item => item.relationshipId === "right"));
  const { refs } = collectModelRefs([generated], true);
  assert.ok(refs.some(ref => ref.elementId === "right"));
  assert.throws(() => parseRequirementDiagramModelsOnly(JSON.stringify({ models: [objectActivityFixture()] })));
  assert.throws(() => normalizeWorkspaceModelState({ models: { activity: objectActivityFixture() } }));
});

test("workspace writes enforce feasibility profiles and reject malformed model collections", () => {
  assert.throws(() => normalizeWorkspaceModelState({ models: [] }), /models/);
  assert.throws(() => normalizeWorkspaceModelState({ feasibilityContextModel: modelFixture("feasibility", "activity") }), /stage-model/);
  assert.throws(() => normalizeWorkspaceModelState({ feasibilityBusinessFlow: { model: objectActivityFixture() } }));
  assert.throws(() => normalizeWorkspaceModelState({ feasibilityBusinessFlow: { model: modelFixture("feasibility", "activity") } }));
  const flow = {
    model: modelFixture("feasibility", "activity"),
    traceability: [{ requirementId: "r1", targetId: "start", targetKind: "node" as const }],
    plantUml: { diagramKind: "activity", modelId: "activity", source: "@startuml\n@enduml" },
    svg: { diagramKind: "activity", modelId: "activity", svg: "<svg/>", renderMeta: { engine: "plantuml", generatedAt: "2026-10-18T00:00:00Z", sourceLength: 0, durationMs: 0 } },
    fingerprint: "fp:v3:flow",
  };
  assert.deepEqual(normalizeWorkspaceModelState({ feasibilityBusinessFlow: flow }).feasibilityBusinessFlow, flow);
});

test("workspace saves reject invalid models even when their content is unchanged", () => {
  const legacyModel = { diagramKind: "usecase", title: "旧模型" };
  const previousState = { models: { usecase: legacyModel } };
  assert.throws(() => normalizeWorkspaceModelState(
    { models: { usecase: structuredClone(legacyModel) }, requirementText: "新需求" },
    previousState,
  ));
  assert.throws(() => normalizeWorkspaceModelState(
    { models: { usecase: { ...legacyModel, title: "已编辑" } } },
    previousState,
  ));
});
