// Verifies diagram-specific provider vocabularies against the same structural contracts used at save time.
import assert from "node:assert/strict";
import test from "node:test";
import { standardAnswerSchema, standardScopeChoiceSchema, standardDiagramKinds, standardDiagramSchema, standardModelSchemaForKind, standardModelNodeTypes, standardModelRelationTypes } from "./standard-project.js";

test("model choices carry current diagram kinds and answers preserve selected option identifiers", () => {
  const choice = { id: "yes", label: "是，加入并生成领域概念图", kinds: ["er"], recommended: true };
  assert.deepEqual(standardScopeChoiceSchema.parse(choice), choice);
  assert.equal(standardScopeChoiceSchema.safeParse({ ...choice, kinds: ["concept_er"] }).success, false);
  assert.equal(standardScopeChoiceSchema.safeParse({ ...choice, kinds: ["state"] }).success, false);
  assert.equal(standardScopeChoiceSchema.safeParse({ ...choice, kinds: [] }).success, true);
  const answer = { questionId: "scope", answer: choice.label, selectedOptionIds: ["yes"] };
  assert.deepEqual(standardAnswerSchema.parse(answer), answer);
  assert.equal(standardAnswerSchema.safeParse({ ...answer, selectedOptionIds: [] }).success, false);
});

test("use-case diagrams have one current overview identity without role-view aliases", () => {
  const diagram = { id: "usecase", kind: "usecase", title: "用例图", status: "pending" };
  assert.equal(standardDiagramSchema.safeParse(diagram).success, true);
  assert.equal(standardDiagramSchema.safeParse({ ...diagram, id: "usecase_user" }).success, false);
  assert.equal(standardDiagramSchema.safeParse({ ...diagram, roleId: "user" }).success, false);
});

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
