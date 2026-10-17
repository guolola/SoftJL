// Verifies diagram-specific provider vocabularies against the same structural contracts used at save time.
import assert from "node:assert/strict";
import test from "node:test";
import { standardDiagramKinds, standardModelSchemaForKind, standardModelNodeTypes, standardModelRelationTypes } from "./standard-project.js";

test("each diagram schema accepts only its own node and relation vocabulary", () => {
  for (const kind of standardDiagramKinds) {
    const schema = standardModelSchemaForKind(kind);
    const node = { id: "a", label: "A", type: standardModelNodeTypes[kind][0] };
    const swimlanes = kind === "activity" ? [{ id: "system", name: "系统" }, { id: "user", name: "用户" }] : undefined;
    assert.equal(schema.safeParse({ nodes: [node], edges: [{ id: "e", from: "a", to: "a", relation: standardModelRelationTypes[kind][0] }], ...(swimlanes ? { swimlanes } : {}) }).success, true);
    assert.equal(schema.safeParse({ nodes: [{ ...node, type: "unrelated" }], edges: [] }).success, false);
    assert.equal(schema.safeParse({ nodes: [node], edges: [{ id: "e", from: "a", to: "a", relation: "unrelated" }] }).success, false);
  }
  const functionSchema = standardModelSchemaForKind("function");
  assert.equal(functionSchema.safeParse({ nodes: [{ id: "a", label: "A", type: "module" }], edges: [{ id: "e", from: "a", to: "a", relation: "composition" }] }).success, false);
  assert.equal(standardModelSchemaForKind("usecase").safeParse({ nodes: [{ id: "a", label: "A", type: "system" }], edges: [] }).success, false);
});
