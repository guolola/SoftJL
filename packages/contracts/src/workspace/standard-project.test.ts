// Verifies diagram-specific provider vocabularies against the same structural contracts used at save time.
import { standardModelFixture } from "../testing/standard-model-fixtures.js";
import { unknownContractFields } from "../modeling/model-json-schema.js";
import assert from "node:assert/strict";
import test from "node:test";
import { standardAnswerSchema, standardScopeChoiceSchema, standardDiagramKinds, standardDiagramSchema, standardModelSchemaForKind, validateStandardModel, standardModelSchema, standardProjectStateSchema, createStandardProjectState, standardConversationMessageSchema } from "./standard-project.js";

test("conversation timing uses only the current recorded timing contract", () => {
  const message = { id: "reply", role: "assistant", text: "完成", createdAt: "2026-10-23T01:00:00.000Z", status: "completed",
    timing: { streamStartTime: 100, totalStreamTime: 4290, totalChunks: 2, toolCallCount: 0 } };
  assert.deepEqual(standardConversationMessageSchema.parse(message), message);
  for (const obsolete of [{ ...message, durationMs: 4290 }, { ...message, timing: undefined, durationMs: 4290 }]) {
    const before = structuredClone(obsolete);
    assert.equal(standardConversationMessageSchema.safeParse(obsolete).success, false);
    assert.equal(standardProjectStateSchema.safeParse({ ...createStandardProjectState(), conversation: [obsolete] }).success, false);
    assert.deepEqual(obsolete, before);
  }
});

test("persisted runs reject the removed preparation workflow without converting it to chat", () => {
  const run = { id: "old", operation: "prepare", status: "completed", startedAt: "2026-10-23T01:00:00.000Z" };
  assert.equal(standardProjectStateSchema.safeParse({ ...createStandardProjectState(), run }).success, false);
  assert.equal(standardProjectStateSchema.safeParse({ ...createStandardProjectState(), run: { ...run, operation: "chat", resumeOperation: "prepare" } }).success, false);
  assert.equal(run.operation, "prepare");
});

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

test("eight current schemas preserve native structures and reject obsolete or unknown fields", () => {
  for (const kind of standardDiagramKinds) {
    const model = standardModelFixture(kind);
    assert.equal(standardModelSchemaForKind(kind).safeParse(model).success, true);
    assert.equal(validateStandardModel(kind, model).diagramKind, kind);
    assert.equal(standardModelSchema.safeParse({ nodes: [], edges: [] }).success, false);
    assert.equal(standardModelSchema.safeParse({ ...model, unexpected: true }).success, false);
    assert.equal(standardModelSchemaForKind(kind).safeParse({ ...model, edges: [] }).success, false);
  }
  const model = standardModelFixture("class");
  Object.assign(model.classes[0], { unexpected: true });
  assert.equal(standardModelSchema.safeParse(model).success, false);
  assert.throws(() => validateStandardModel("sequence", standardModelFixture("class")), /类型/);
});

test("quick modeling enforces structural semantics without engineering review or source coverage", () => {
  const activity = standardModelFixture("activity");
  assert.throws(() => validateStandardModel("activity", { ...activity, relationships: [{ ...activity.relationships[0], sourceId: "missing" }] }));
  const classes = standardModelFixture("class");
  assert.throws(() => validateStandardModel("class", { ...classes, classes: [classes.classes[0], classes.classes[0]] }));
  const table = validateStandardModel("table", standardModelFixture("table"));
  assert.equal(table.diagramKind, "table");
  if (table.diagramKind === "table") assert.equal(table.relationships.length, 1);
  const er = standardModelFixture("er");
  assert.throws(() => validateStandardModel("er", { ...er, relationships: [{ ...er.relationships[0], targetId: "missing" }] }), /不存在/);
  assert.throws(() => validateStandardModel("er", { ...er, relationships: [{ ...er.relationships[0], sourceMultiplicity: "4..1" }] }), /基数/);
});

const elementCollections = { function: "nodes", usecase: "actors", activity: "nodes", architecture: "components", er: "entities", class: "classes", sequence: "participants", table: "tables" } as const;
test("current schema wrappers expose unknown fields before provider null omission", () => {
  const model = standardModelFixture("class");
  assert.deepEqual(unknownContractFields(standardModelSchemaForKind("class"), { ...model, edges: null }), ["edges"]);
  assert.deepEqual(unknownContractFields(standardModelSchema, { ...model, classes: [{ ...model.classes[0], fields: null }, model.classes[1]] }), ["classes.0.fields"]);
});
for (const kind of standardDiagramKinds) test(`${kind}: generation, edits and persisted diagrams reject obsolete and semantically invalid payloads`, () => {
  const model = standardModelFixture(kind);
  const nested = structuredClone(model);
  const elements = (nested as Record<string, unknown>)[elementCollections[kind]] as Array<Record<string, unknown>>;
  Object.assign(elements[0], { fields: ["legacy fields"], methods: [] });
  const duplicate = structuredClone(model);
  const duplicateElements = (duplicate as Record<string, unknown>)[elementCollections[kind]] as Array<Record<string, unknown>>;
  duplicateElements.push(structuredClone(duplicateElements[0]));
  const obsolete = { diagramKind: kind, nodes: [{ id: "old", type: "class", label: "旧模型", fields: [], methods: [] }], edges: [] };
  for (const input of [obsolete, nested, duplicate]) {
    const before = structuredClone(input);
    assert.equal(standardModelSchema.safeParse(input).success, false);
    assert.equal(standardModelSchemaForKind(kind).safeParse(input).success, false);
    const diagram = { id: kind, kind, title: "当前图", status: "completed", model: input };
    assert.equal(standardDiagramSchema.safeParse(diagram).success, false);
    assert.equal(standardProjectStateSchema.safeParse({ ...createStandardProjectState(), diagrams: { [kind]: diagram } }).success, false);
    assert.deepEqual(input, before, "rejection must not rewrite or migrate the input");
  }
  for (const other of standardDiagramKinds.filter(other => other !== kind)) {
    assert.equal(standardModelSchemaForKind(kind).safeParse(standardModelFixture(other)).success, false);
  }
});
