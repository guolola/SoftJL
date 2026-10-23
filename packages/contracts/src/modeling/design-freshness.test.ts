// Checks cascading staleness without automatically regenerating unrelated models.
import assert from "node:assert/strict";
import test from "node:test";
import { invalidateDesignDependents, requirementOutputFingerprints } from "./design-freshness.js";
import { designInputFingerprint, snapshotInputFingerprint } from "../fingerprints.js";
import { modelFixture } from "../testing/model-fixtures.js";
const kinds = ["sequence", "class", "component", "table", "deployment", "architecture", "navigation"];
const state = { designModels: Object.fromEntries(kinds.map(kind => [kind, { diagramKind: kind, title: kind }])), designInputFingerprints: Object.fromEntries(kinds.map(kind => [kind, "fresh"])) };

test("sequence edits do not invalidate the independent class/navigation/database branches", () => {
  const next = invalidateDesignDependents(state, { ...state, designModels: { ...state.designModels, sequence: { diagramKind: "sequence", title: "edited" } } });
  const fingerprints = next.designInputFingerprints as Record<string, string>;
  for (const kind of ["class", "navigation", "table", "component", "deployment"]) assert.equal(fingerprints[kind], "fresh");
});
test("class edit invalidates component, table and transitive deployment", () => {
  const next = invalidateDesignDependents(state, { ...state, designModels: { ...state.designModels, class: { diagramKind: "class", title: "edited" } } });
  const fingerprints = next.designInputFingerprints as Record<string, string>;
  for (const kind of ["component", "table", "deployment"]) assert.equal(fingerprints[kind], "stale:fresh");
  for (const kind of ["class", "sequence", "architecture", "navigation"]) assert.equal(fingerprints[kind], "fresh");
});

test("use-case changes invalidate class and its descendants without invalidating navigation", () => {
  const usecase = modelFixture("requirements", "usecase");
  const previous = { ...state, models: { usecase } };
  const next = invalidateDesignDependents(previous, { ...previous, models: { usecase: { ...usecase, summary: "更新用例行为" } } });
  const fingerprints = next.designInputFingerprints as Record<string, string>;
  for (const kind of ["class", "table", "component", "deployment"]) assert.equal(fingerprints[kind], "stale:fresh");
  assert.equal(fingerprints.navigation, "fresh");
});
test("requirement classification edits invalidate the recorded source branch without changing its model", () => {
  const before = scopedWorkspace();
  const rules = before.rules.map(rule => rule.id === "r-a" ? { ...rule, type: "operations" as const } : rule);
  const next = invalidateDesignDependents(before, { ...before, rules });
  assert.ok(String(next.designInputFingerprints["design-a"]).startsWith("stale:"));
  assert.equal(next.designInputFingerprints["design-b"], before.designInputFingerprints["design-b"]);
  assert.deepEqual(next.models, before.models);
});
test("same-batch regenerated dependents remain fresh while other descendants become stale", () => {
  const next = invalidateDesignDependents(state, { ...state, designModels: { ...state.designModels, class: { diagramKind: "class", title: "new" }, component: { diagramKind: "component", title: "new" } } }, ["class", "component"]);
  assert.equal((next.designInputFingerprints as Record<string, string>).component, "fresh");
  assert.equal((next.designInputFingerprints as Record<string, string>).deployment, "stale:fresh");
});

function scopedWorkspace() {
  const rules = [
    { id: "r-a", text: "办理业务 A", type: "functional" as const },
    { id: "r-b", text: "办理业务 B", type: "functional" as const },
    { id: "r-c", text: "管理订单数据", type: "data" as const },
  ];
  const models = {
    a: { modelId: "a", diagramKind: "analysis", title: "业务 A" },
    b: { modelId: "b", diagramKind: "analysis", title: "业务 B" },
    c: { modelId: "c", diagramKind: "class", title: "订单数据" },
  };
  const requirementModelTraceability = Object.keys(models).map(id => ({ ruleId: `r-${id}`,
    target: { modelId: id, diagramKind: id === "c" ? "class" : "analysis", elementId: id } }));
  const designModels = { "design-a": { modelId: "design-a", diagramKind: "sequence" },
    "design-b": { modelId: "design-b", diagramKind: "sequence" },
    "design-c": { modelId: "design-c", diagramKind: "class" } };
  const designModelTraceability = Object.keys(models).map(id => ({
    source: { modelId: `design-${id}` }, targets: [{ modelId: id }],
  }));
  const input = { requirementText: "需求", rules, models, requirementModelTraceability, designModels, designModelTraceability };
  const requirementFingerprint = snapshotInputFingerprint({ requirementText: input.requirementText, rules });
  const fingerprint = designInputFingerprint(Object.values(models), requirementModelTraceability);
  return { ...input, diagramInputFingerprints: { a: requirementFingerprint, b: requirementFingerprint, c: requirementFingerprint, analysis: requirementFingerprint, class: requirementFingerprint },
    designInputFingerprints: Object.fromEntries(Object.keys(designModels).map(id => [id, fingerprint])) };
}

test("changing one use case event flow invalidates only its retained analysis and preserves the yellow marker until regeneration", () => {
  const source = { diagramKind: "usecase", modelId: "usecase", actors: [], systemBoundaries: [], relationships: [],
    useCases: [{ id: "a", eventFlows: [{ id: "flow-a", steps: [{ id: "step-a", action: "提交申请" }] }] },
      { id: "b", eventFlows: [{ id: "flow-b", steps: [{ id: "step-b", action: "查看申请" }] }] }] };
  const models = { usecase: source, "analysis:a": { diagramKind: "analysis", modelId: "analysis:a", sourceUseCaseId: "a" },
    "analysis:b": { diagramKind: "analysis", modelId: "analysis:b", sourceUseCaseId: "b" } };
  const fingerprint = snapshotInputFingerprint({ requirementText: "需求", rules: [] });
  const before = { requirementText: "需求", rules: [], models, designModels: {},
    diagramInputFingerprints: { usecase: fingerprint, analysis: fingerprint, "analysis:a": fingerprint, "analysis:b": fingerprint } };
  const edited = structuredClone(before);
  edited.models.usecase.useCases[0]!.eventFlows[0]!.steps[0]!.action = "确认后提交申请";
  const next = invalidateDesignDependents(before, edited);
  assert.match(String(next.diagramInputFingerprints["analysis:a"]), /^stale:/u);
  assert.equal(next.diagramInputFingerprints["analysis:b"], fingerprint);
  assert.equal(next.diagramInputFingerprints.usecase, fingerprint);
  assert.match(String(next.diagramInputFingerprints.analysis), /^stale:/u);
  const persisted = invalidateDesignDependents(next, next);
  assert.equal(persisted.diagramInputFingerprints.analysis, next.diagramInputFingerprints.analysis);
  const regenerated = invalidateDesignDependents(next, { ...next, diagramInputFingerprints: {
    ...next.diagramInputFingerprints, "analysis:a": fingerprint } });
  assert.equal(regenerated.diagramInputFingerprints.analysis, fingerprint);
});

test("editing one rule only invalidates its traced model and design, including models of the same kind", () => {
  const before = scopedWorkspace();
  const edited = { ...before, rules: before.rules.map(rule => rule.id === "r-a" ? { ...rule, text: "业务 A 新要求" } : rule) };
  const next = invalidateDesignDependents(before, edited);
  const requirementFingerprint = snapshotInputFingerprint({ requirementText: edited.requirementText, rules: edited.rules });
  assert.notEqual(next.diagramInputFingerprints.a, requirementFingerprint);
  assert.equal(next.diagramInputFingerprints.b, requirementFingerprint);
  assert.equal(next.diagramInputFingerprints.c, requirementFingerprint);
  assert.equal(next.diagramInputFingerprints.class, requirementFingerprint);
  assert.ok(String(next.designInputFingerprints["design-a"]).startsWith("stale:"));
  assert.equal(next.designInputFingerprints["design-b"], before.designInputFingerprints["design-b"]);
  assert.equal(next.designInputFingerprints["design-c"], before.designInputFingerprints["design-c"]);
  assert.deepEqual(next.models, before.models);
});

test("a requirement model edit rebases unrelated design receipts without clearing existing stale flags", () => {
  const before = scopedWorkspace();
  before.designInputFingerprints["design-c"] = "stale:earlier";
  const edited = { ...before, models: { ...before.models, a: { ...before.models.a, title: "更新业务 A" } } };
  const next = invalidateDesignDependents(before, edited);
  const fingerprint = designInputFingerprint(Object.values(edited.models), edited.requirementModelTraceability);
  assert.ok(String(next.designInputFingerprints["design-a"]).startsWith("stale:"));
  assert.equal(next.designInputFingerprints["design-b"], fingerprint);
  assert.equal(next.designInputFingerprints["design-c"], "stale:earlier");
  assert.deepEqual(next.rules, before.rules);
});

test("new candidates invalidate all models while deleted rules use their actual trace targets", () => {
  const before = scopedWorkspace();
  const added = invalidateDesignDependents(before, { ...before, rules: [...before.rules,
    { id: "r-new", type: "business-rule", text: "新增业务约束" }] });
  assert.ok(String(added.designInputFingerprints["design-a"]).startsWith("stale:"));
  assert.ok(String(added.designInputFingerprints["design-b"]).startsWith("stale:"));
  assert.ok(String(added.designInputFingerprints["design-c"]).startsWith("stale:"));
  const deleted = invalidateDesignDependents(before, { ...before, rules: before.rules.filter(rule => rule.id !== "r-a"),
    requirementModelTraceability: before.requirementModelTraceability.filter(row => row.ruleId !== "r-a") });
  assert.ok(String(deleted.designInputFingerprints["design-a"]).startsWith("stale:"));
  assert.equal(deleted.designInputFingerprints["design-b"],
    designInputFingerprint(Object.values(before.models), deleted.requirementModelTraceability as unknown[]));
});

test("baseline version changes alone leave all model receipts current", () => {
  const before = { ...scopedWorkspace(), requirementBaseline: { version: 1, id: "old" } };
  const next = invalidateDesignDependents(before, { ...before, requirementBaseline: { version: 2, id: "new" } });
  assert.deepEqual(next.designInputFingerprints, before.designInputFingerprints);
  assert.deepEqual(next.diagramInputFingerprints, before.diagramInputFingerprints);
});

test("a targeted published receipt clears only that requirement model's stale marker", () => {
  const before = scopedWorkspace();
  const rules = [...before.rules, { id: "r-new", type: "business-rule", text: "新增约束" }];
  const edited = invalidateDesignDependents(before, { ...before, rules });
  const receipt = requirementOutputFingerprints({ requirementText: before.requirementText, rules,
    models: [before.models.a, before.models.b], outputManifest: [{ kind: "model", id: "a" }] });
  const next = invalidateDesignDependents(edited, { ...edited,
    diagramInputFingerprints: { ...edited.diagramInputFingerprints, ...receipt } });
  assert.equal(next.diagramInputFingerprints.a, receipt.a);
  assert.notEqual(next.diagramInputFingerprints.b, receipt.a);
  assert.notEqual(next.diagramInputFingerprints.analysis, receipt.a);
  assert.ok(String(next.designInputFingerprints["design-a"]).startsWith("stale:"));
  assert.deepEqual(requirementOutputFingerprints({ requirementText: before.requirementText, rules,
    models: [before.models.b], outputManifest: [] }), {});
});

test("editor-only metadata changes do not invalidate a requirement model's design dependents", () => {
  const model = modelFixture("requirements", "class");
  const fingerprint = designInputFingerprint([model], []);
  const before = { models: { class: model }, designModels: { class: { diagramKind: "class" } },
    designInputFingerprints: { class: fingerprint } };
  const next = invalidateDesignDependents(before, { ...before,
    models: { class: { ...model, editorOnlyLabel: "编辑器显示名称" } } });
  assert.equal(next.designInputFingerprints.class, fingerprint);
});

test("workspace-wide receipts cannot certify models without their own source receipts", () => {
  const source = scopedWorkspace();
  const before = { ...source, diagramInputFingerprints: {},
    requirementInputFingerprint: source.diagramInputFingerprints.analysis };
  const rules = before.rules.map(rule => rule.id === "r-a" ? { ...rule, text: "调整业务 A" } : rule);
  const next = invalidateDesignDependents(before, { ...before, rules });
  const fingerprint = snapshotInputFingerprint({ requirementText: before.requirementText, rules });
  assert.notEqual(next.diagramInputFingerprints.a, fingerprint);
  assert.notEqual(next.diagramInputFingerprints.b, fingerprint);
  assert.notEqual(next.diagramInputFingerprints.c, fingerprint);
});

test("a kind summary cannot supply source receipts for scoped model instances", () => {
  const source = scopedWorkspace();
  const before = { ...source, diagramInputFingerprints: { analysis: source.diagramInputFingerprints.analysis } };
  const next = invalidateDesignDependents(before, before);
  for (const id of ["a", "b", "c"]) assert.equal(next.diagramInputFingerprints[id], undefined);
  assert.equal(next.diagramInputFingerprints.analysis, "stale:unknown");
});
