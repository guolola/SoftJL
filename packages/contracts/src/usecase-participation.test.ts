// Covers declared participation, auxiliary cases and directional inheritance without inventing business roles.
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture } from "./testing/model-fixtures.js";
import { useCaseParticipationGaps } from "./usecase-participation.js";
import { validateModelInput } from "./model-semantics.js";

function fixture() { const model = modelFixture("requirements", "usecase"); if (model.diagramKind !== "usecase") throw new Error("fixture"); return model; }
test("declared actors without links fail validation and yield exact, idempotent associations", () => {
  const model = fixture(); model.useCases[0].primaryActorId = "actor"; model.relationships = [];
  assert.ok(validateModelInput(model, "requirements").some((item) => item.code === "actor-participation"));
  const result = useCaseParticipationGaps(model);
  assert.deepEqual(result.gaps.map((item) => [item.actorId, item.useCaseId]), [["actor", "case"]]);
  model.relationships = result.relationships;
  assert.deepEqual(validateModelInput(model, "requirements"), []);
  assert.equal(useCaseParticipationGaps(model).gaps.length, 0);
});
test("reverse associations and included auxiliary use cases preserve legitimate coverage", () => {
  const model = fixture(); model.relationships[0].sourceId = "case"; model.relationships[0].targetId = "actor";
  model.useCases.push({ ...model.useCases[0], id: "aux", primaryActorId: "actor" });
  model.relationships.push({ id: "include", type: "include", sourceId: "case", targetId: "aux" });
  assert.deepEqual(validateModelInput(model, "requirements"), []);
  assert.equal(useCaseParticipationGaps(model).gaps.length, 0);
});
test("specific actors inherit participation but general actors do not inherit backwards", () => {
  const model = fixture(); model.actors.push({ ...model.actors[0], id: "specific" });
  model.relationships.push({ id: "inherits", type: "generalization", sourceId: "specific", targetId: "actor" });
  model.useCases[0].primaryActorId = "specific";
  assert.deepEqual(validateModelInput(model, "requirements"), []);
  model.relationships[0].sourceId = "specific"; model.useCases[0].primaryActorId = "actor";
  assert.equal(useCaseParticipationGaps(model).gaps[0].actorId, "actor");
});
test("unbound isolated actors are reported without guessed repair targets", () => {
  const model = fixture(); model.actors.push({ ...model.actors[0], id: "orphan" });
  assert.ok(validateModelInput(model, "requirements").some((item) => item.code === "isolated-actor"));
  assert.equal(useCaseParticipationGaps(model).gaps.length, 0);
});
test("an association on a shared included case cannot justify participation in unrelated base cases", () => {
  const model = fixture();
  model.useCases[0].primaryActorId = "actor";
  model.useCases.push({ ...model.useCases[0], id: "aux" });
  model.relationships[0].targetId = "aux";
  model.relationships.push({ id: "include", type: "include", sourceId: "case", targetId: "aux" });
  assert.deepEqual(useCaseParticipationGaps(model).gaps.map((item) => item.useCaseId), ["case"]);
});
test("general actors and abstract base use cases can have context through specializations without redundant associations", () => {
  const model = fixture();
  model.actors.push({ ...model.actors[0], id: "specificActor" });
  model.useCases.push({ ...model.useCases[0], id: "specificCase" });
  model.relationships = [
    { id: "actorGeneralization", type: "generalization", sourceId: "specificActor", targetId: "actor" },
    { id: "caseGeneralization", type: "generalization", sourceId: "specificCase", targetId: "case" },
    { id: "participates", type: "association", sourceId: "specificActor", targetId: "specificCase" },
  ];
  assert.deepEqual(validateModelInput(model, "requirements"), []);
  assert.equal(useCaseParticipationGaps(model).gaps.length, 0);
});
