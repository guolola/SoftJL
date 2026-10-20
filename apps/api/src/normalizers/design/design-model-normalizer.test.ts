// Preserves design semantics and reports malformed models for structured repair.
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import { deriveTableModel, ModelSemanticError } from "@uml-platform/contracts";
import { parseDesignDiagramModelsOnly, parseDesignDiagramModelsResult } from "./design-model-normalizer.js";
const parse = (model: unknown) => parseDesignDiagramModelsOnly(JSON.stringify({ models: [model] })).models[0]!;
test("empty envelope records consume no repair and every substantive model error retains its array position", () => {
  const model = modelFixture("design", "sequence");
  const result = parseDesignDiagramModelsOnly(JSON.stringify({ models: [model, {}, { designModelTraceability: [] }] }));
  assert.deepEqual(result.models, [model]);
  const broken = { ...model, modelId: "second", participants: undefined, messages: undefined, fragments: undefined };
  assert.throws(() => parseDesignDiagramModelsOnly(JSON.stringify({ models: [model, broken, { unexpected: "PRESERVE_REAL_DATA" }] })), error => {
    assert.ok(error instanceof ModelSemanticError);
    assert.deepEqual(error.diagnostics.map(item => item.responsePath), ["models.1.participants", "models.1.messages", "models.1.fragments", "models.2.diagramKind"]);
    return true;
  });
});
test("design parsing preserves all models and derives physical relational views", () => {
  for (const kind of ["architecture", "sequence", "navigation", "class", "component", "deployment", "table"]) {
    const model = modelFixture("design", kind);
    assert.deepEqual(parse(model), model.diagramKind === "table" ? deriveTableModel(model) : model);
  }
});

test("an empty misplaced traceability envelope is removed locally without discarding real metadata", () => {
  const model = modelFixture("design", "table");
  const input = { ...model, designModelTraceability: [] };
  assert.deepEqual(parse(input), model.diagramKind === "table" ? deriveTableModel(model) : model);
  assert.deepEqual(input.designModelTraceability, []);
  assert.throws(() => parse({ ...model, designModelTraceability: [{ source: "must-not-discard" }] }), /unsupported-field/);
});
test("design activity is rejected; independent navigation is accepted", () => {
  assert.throws(() => parse(modelFixture("requirements", "activity")), /当前阶段不支持/);
  assert.equal(parse(modelFixture("design", "navigation")).diagramKind, "navigation");
});
test("invalid alt is reported, never downgraded to opt", () => {
  const model = modelFixture("design", "sequence") as any;
  model.fragments = [{ id: "f", type: "alt", label: "选择", messageIds: ["m"] }];
  assert.throws(() => parse(model), /fragment-branches/);
  assert.equal(model.fragments[0].type, "alt");
});
test("a legitimate loop can encompass all messages", () => {
  const model = modelFixture("design", "sequence") as any;
  model.fragments = [{ id: "f", type: "loop", label: "每个订单", condition: "仍有待处理订单", messageIds: ["m"] }];
  assert.deepEqual(parse(model), model);
});
test("invalid deployment links fail without removing legal artifact dependencies", () => {
  const model = modelFixture("design", "deployment") as any;
  model.artifacts = [{ id: "a", name: "a.jar" }, { id: "b", name: "b.jar" }];
  model.relationships.push({ id: "deps", type: "dependency", sourceId: "a", targetId: "b" });
  assert.deepEqual(parse(model), model);
  model.relationships[1].type = "communication";
  assert.throws(() => parse(model), /invalid-endpoints/);
});
test("unknown class enums, missing required names and stale package references report fields", () => {
  const model = modelFixture("design", "class") as any;
  model.classes[0].classKind = "controller"; assert.throws(() => parse(model), /classKind/);
  delete model.classes[0].classKind; delete model.title; assert.throws(() => parse(model), /title/);
  const architecture = modelFixture("design", "architecture") as any; architecture.components[0].packageId = "bad";
  assert.throws(() => parse(architecture), /missing-reference/);
});
test("first design output retains declared sources without coverage or reference audits", () => {
  const model = modelFixture("design", "sequence");
  const requirement = modelFixture("requirements", "usecase") as any;
  const traceability = ["a", "b", "m"].map(elementId => ({
    source: { modelId: model.modelId, diagramKind: "sequence", elementId, elementKind: "participant", label: elementId },
    targets: [{ modelId: requirement.modelId, diagramKind: "usecase", elementId: "case", elementKind: "usecase", label: "下单" }],
  }));
  const parseOutput = (entries: unknown[]) => parseDesignDiagramModelsResult(JSON.stringify({ models: [model], designModelTraceability: entries }), [requirement]);
  assert.equal(parseOutput(traceability).designModelTraceability.length, 3);
  assert.deepEqual(parseOutput([]).designModelTraceability, []);
  assert.equal(parseOutput(traceability.slice(0, 1)).designModelTraceability.length, 1);
  assert.throws(() => parseOutput(traceability.map(entry => ({ ...entry, confidence: "low" }))), /Unrecognized key/);
  assert.equal(parseOutput(traceability.map(entry => ({ ...entry, targets: [...entry.targets, { ...entry.targets[0], elementId: "ef-real-nested-flow" }] }))).designModelTraceability[0]!.targets.length, 2);
});
