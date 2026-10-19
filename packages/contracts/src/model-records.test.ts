// Verifies custom model IDs work for lookup and artifact replacement across both modeling stages.
import assert from "node:assert/strict";
import test from "node:test";
import { findModelByDiagramKind, modelRecordBelongsToDiagramKinds, resolveModelArtifactIdentity } from "./model-records.js";

test("kind lookup finds custom IDs and rejects a misleading fixed key", () => {
  const useCase = { modelId: "usecase-home-security", diagramKind: "usecase" };
  const models = { usecase: { diagramKind: "activity" }, "usecase-home-security": useCase };
  assert.equal(findModelByDiagramKind(models, "usecase"), useCase);
  assert.equal(findModelByDiagramKind(models, "class"), undefined);
});

test("singleton lookup prefers the matching explicit diagram kind", () => {
  const model = { diagramKind: "usecase" };
  assert.equal(findModelByDiagramKind({ usecase: model, other: { diagramKind: "usecase" } }, "usecase"), model);
});

for (const diagramKind of ["usecase", "architecture"]) {
  test(`custom ${diagramKind} artifacts inherit their scope from model metadata`, () => {
    const models = { "custom-model": { diagramKind }, "unrelated-model": { diagramKind: "class" } };
    assert.equal(modelRecordBelongsToDiagramKinds("custom-model", "@startuml\n@enduml", [diagramKind], models), true);
    assert.equal(modelRecordBelongsToDiagramKinds("custom-model", { error: "failed" }, [diagramKind], models), true);
    assert.equal(modelRecordBelongsToDiagramKinds("unrelated-model", "source", [diagramKind], models), false);
  });
}

test("explicit model kinds take precedence over misleading key prefixes", () => {
  assert.equal(modelRecordBelongsToDiagramKinds("usecase:legacy", { diagramKind: "class" }, ["usecase"]), false);
  assert.equal(modelRecordBelongsToDiagramKinds("analysis:uc-1", "source", ["analysis"]), true);
  assert.equal(modelRecordBelongsToDiagramKinds("design-architecture", "source", ["architecture"]), false);
});

test("source serialization preserves explicit and current scoped identities without translating old aliases", () => {
  assert.deepEqual(resolveModelArtifactIdentity("custom-id", { "custom-id": { diagramKind: "usecase", modelId: "custom-id" } }), { diagramKind: "usecase", modelId: "custom-id" });
  assert.deepEqual(resolveModelArtifactIdentity("custom-id", {}, { "custom-id": { diagramKind: "class", modelId: "custom-id" } }), { diagramKind: "class", modelId: "custom-id" });
  assert.deepEqual(resolveModelArtifactIdentity("usecase", {}), { diagramKind: "usecase" });
  assert.deepEqual(resolveModelArtifactIdentity("analysis:uc-1", {}), { diagramKind: "analysis", modelId: "analysis:uc-1" });
  assert.throws(() => resolveModelArtifactIdentity("design-class", {}));
});
