// Preserves design semantics and reports malformed models for structured repair.
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture } from "@uml-platform/contracts/testing";
import { deriveTableModel } from "@uml-platform/contracts";
import { parseDesignDiagramModelsResult } from "./design-model-normalizer.js";
const parseDesignDiagramModelsOnly = (value: string) => parseDesignDiagramModelsResult(JSON.stringify({ ...JSON.parse(value), designModelTraceability: [] }));
const parse = (model: unknown) => parseDesignDiagramModelsOnly(JSON.stringify({ models: [model] })).models[0]!;
test("empty and malformed envelope records fail Schema without silently dropping them", () => {
  const model = modelFixture("design", "sequence");
  assert.throws(() => parseDesignDiagramModelsOnly(JSON.stringify({ models: [model, {}] })), /diagramKind/);
  const broken = { ...model, participants: undefined };
  assert.throws(() => parseDesignDiagramModelsOnly(JSON.stringify({ models: [model, broken] })), /participants/);
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
  assert.throws(() => parse(modelFixture("requirements", "activity")), /Invalid discriminator/);
  assert.equal(parse(modelFixture("design", "navigation")).diagramKind, "navigation");
});
test("Schema parsing preserves alt fragments without semantic branch inference", () => {
  const model = modelFixture("design", "sequence") as any;
  model.fragments = [{ id: "f", type: "alt", label: "选择", messageIds: ["m"] }];
  assert.deepEqual(parse(model), model);
  assert.equal(model.fragments[0].type, "alt");
});
test("a legitimate loop can encompass all messages", () => {
  const model = modelFixture("design", "sequence") as any;
  model.fragments = [{ id: "f", type: "loop", label: "每个订单", condition: "仍有待处理订单", messageIds: ["m"] }];
  assert.deepEqual(parse(model), model);
});
test("Schema parsing preserves deployment links without endpoint type matching", () => {
  const model = modelFixture("design", "deployment") as any;
  model.artifacts = [{ id: "a", name: "a.jar" }, { id: "b", name: "b.jar" }];
  model.relationships.push({ id: "deps", type: "dependency", sourceId: "a", targetId: "b" });
  assert.deepEqual(parse(model), model);
  model.relationships[1].type = "communication";
  assert.deepEqual(parse(model), model);
});
test("unknown class enums, missing required names and stale package references report fields", () => {
  const model = modelFixture("design", "class") as any;
  model.classes[0].classKind = "controller"; assert.throws(() => parse(model), /classKind/);
  delete model.classes[0].classKind; delete model.title; assert.throws(() => parse(model), /title/);
  const architecture = modelFixture("design", "architecture") as any; architecture.components[0].packageId = "bad";
  assert.deepEqual(parse(architecture), architecture);
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
