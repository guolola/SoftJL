// Verifies current model identities and rejects retired traceability aliases at generation boundaries.
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture } from "@uml-platform/contracts/testing";
import { collectModelRefs } from "@uml-platform/contracts";
import { readGeneratedRequirementSources } from "./generated-sources.js";

test("coverage keeps case-sensitive element identities and distinct model instances", () => {
  const model = modelFixture("requirements", "class");
  if (model.diagramKind !== "class") throw new Error("Expected class fixture");
  const entity = model.classes[0]!;
  const first = { ...model, modelId: "first", classes: [{ ...entity, id: "Entity" }, { ...entity, id: "entity" }], relationships: [] };
  const second = { ...first, modelId: "second" };
  const identities = collectModelRefs([first, second]).refs.filter(ref => ["Entity", "entity"].includes(ref.elementId));
  assert.deepEqual(identities.map(ref => [ref.modelId, ref.elementId]), [
    ["first", "Entity"], ["first", "entity"], ["second", "Entity"], ["second", "entity"],
  ]);
});

test("activity coverage omits structural control nodes while retaining business elements", () => {
  const model = modelFixture("requirements", "activity");
  if (model.diagramKind !== "activity") throw new Error("Expected activity fixture");
  const refs = collectModelRefs([model]).refs;
  const structuralIds = model.nodes.filter(node => ["start", "end", "merge", "fork", "join", "flow_final"].includes(node.type)).map(node => node.id);
  assert.ok(structuralIds.length);
  assert.ok(refs.length);
  assert.ok(refs.every(ref => !structuralIds.includes(ref.elementId)));
  assert.ok(collectModelRefs([model], true).refs.length >= refs.length);
});

test("generation rejects missing mappings and retired diagram or reference aliases", () => {
  const model = modelFixture("requirements", "class");
  assert.throws(() => readGeneratedRequirementSources(undefined, [model]), /requirementModelTraceability/);
  assert.throws(() => readGeneratedRequirementSources([
    { ruleId: "r1", target: { diagramKind: "class-diagram", element_id: "entity" } },
  ], [model]));
});
