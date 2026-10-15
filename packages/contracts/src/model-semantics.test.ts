// Guards model-specific semantics independently of whether PlantUML can compile a picture.
import test from "node:test";
import assert from "node:assert/strict";
import { deriveTableModel, getStageModelSchemas, validateModelInput, validateModelSemantics, type ModelingStage } from "./model-semantics.js";
import { modelFixture, objectActivityFixture } from "./testing/model-fixtures.js";

for (const stage of ["feasibility", "requirements", "design"] as ModelingStage[]) for (const schema of getStageModelSchemas(stage)) {
  const kind = schema.shape.diagramKind.value;
  test(`${stage}/${kind}: legal graph and missing endpoint`, () => {
    const model = modelFixture(stage, kind);
    assert.deepEqual(validateModelSemantics(model, stage), []);
    const invalid = structuredClone(model) as any;
    if (kind === "table") invalid.tables[1].relationalConstraints[1].referenceTableId = "absent";
    else (invalid.messages ?? invalid.relationships)[0].targetId = "absent";
    assert.ok(validateModelInput(invalid, stage).length);
  });
}
test("phase profiles exclude technical concept classes, implementation participants and design activity", () => {
  const cls = modelFixture("requirements", "class") as any;
  cls.relationships[0].type = "dependency";
  assert.ok(validateModelInput(cls, "requirements").length);
  cls.relationships[0].type = "association"; cls.classes[0].stereotype = "service";
  assert.ok(validateModelInput(cls, "requirements").some((issue) => issue.code === "analysis-implementation-detail"));
  const seq = modelFixture("requirements", "analysis") as any; seq.participants[1].participantType = "database";
  assert.ok(validateModelInput(seq, "requirements").length);
  assert.ok(validateModelInput(modelFixture("requirements", "activity"), "design").length);
});
test("unsupported fields report paths instead of silently stripping parentId or unknown content", () => {
  const model = modelFixture("requirements", "function") as any;
  model.nodes[1].parentId = "root";
  assert.ok(validateModelInput(model, "requirements").some((issue) => issue.path === "nodes.1.parentId"));
});
test("function tree enforces one root, one parent, acyclic decomposition", () => {
  const model = modelFixture("requirements", "function") as any;
  model.relationships.push({ id: "back", type: "decomposition", sourceId: "child", targetId: "root" });
  assert.ok(validateModelInput(model, "requirements").some((issue) => issue.code === "hierarchy-cycle"));
  model.relationships[1].sourceId = "root"; model.relationships[1].targetId = "child";
  assert.ok(validateModelInput(model, "requirements").some((issue) => issue.code === "tree-parent"));
});
test("boundary membership, extension references and actor/usecase directions are checked", () => {
  const model = modelFixture("requirements", "usecase") as any;
  delete model.useCases[0].systemBoundaryId;
  assert.ok(validateModelInput(model, "requirements").some((issue) => issue.code === "boundary-membership"));
  model.useCases[0].systemBoundaryId = "boundary"; model.relationships[0].type = "extend";
  model.relationships[0].extensionPointIds = ["missing"];
  const codes = validateModelInput(model, "requirements").map((issue) => issue.code);
  assert.ok(codes.includes("invalid-endpoints") && codes.includes("missing-reference"));
});
test("objects, pins, repeated action names and distinct final semantics survive validation", () => {
  const model = objectActivityFixture();
  assert.deepEqual(validateModelSemantics(model, "requirements"), []);
  model.relationships.push({ id: "again", type: "control_flow", sourceId: "consume", targetId: "work" });
  assert.deepEqual(validateModelSemantics(model, "requirements"), []);
  model.relationships.find((edge) => edge.id === "data2")!.targetId = "out";
  assert.ok(validateModelSemantics(model, "requirements").some((issue) => issue.code === "invalid-endpoints"));
});
test("object types and pin identifiers are authoritative", () => {
  const model = objectActivityFixture();
  const object = model.nodes.find((node) => node.type === "object")!;
  if (object.type === "object") object.dataType = "Invoice";
  assert.ok(validateModelSemantics(model, "requirements").some((issue) => issue.code === "object-type"));
});
test("bad package membership and containment cycles fail before rendering", () => {
  const model = modelFixture("design", "architecture") as any;
  model.components[0].packageId = "missing";
  assert.ok(validateModelInput(model, "design").some((issue) => issue.code === "missing-reference"));
});
test("class self association and sequence self invocation remain legal", () => {
  for (const kind of ["class", "sequence"]) {
    const model = modelFixture("design", kind) as any;
    const edge = (model.messages ?? model.relationships)[0];
    edge.type = kind === "class" ? "association" : "sync"; edge.targetId = edge.sourceId;
    assert.deepEqual(validateModelInput(model, "design"), []);
  }
});
test("physical foreign keys derive both ends, nullable parents and unique child cardinality", () => {
  const model = modelFixture("design", "table");
  if (model.diagramKind !== "table") throw new Error("fixture");
  const first = deriveTableModel(model);
  assert.equal(first.relationships[0]?.sourceMultiplicity, "1");
  assert.equal(first.relationships[0]?.targetMultiplicity, "0..*");
  model.tables[1]!.columns[1]!.nullable = true;
  model.tables[1]!.relationalConstraints.push({ id: "unique_order", type: "unique", columnIds: ["order"] });
  const next = deriveTableModel(model);
  assert.equal(next.relationships[0]?.sourceMultiplicity, "0..1");
  assert.equal(next.relationships[0]?.targetMultiplicity, "0..1");
  assert.ok(next.tables[1]?.columns[1]?.isForeignKey);
});

test("alternative branches have independent lifetimes, but a later unconditional call must be safe on both paths", () => {
  const model = modelFixture("design", "sequence") as any;
  model.messages = [
    { id: "delete", type: "destroy", sourceId: "a", targetId: "b", name: "删除", parameters: [] },
    { id: "keep", type: "sync", sourceId: "a", targetId: "b", name: "保留", parameters: [] },
  ];
  model.fragments = [{ id: "choice", type: "alt", label: "选择", messageIds: ["delete", "keep"], branches: [
    { id: "yes", label: "删除", messageIds: ["delete"], condition: "删除" }, { id: "no", label: "保留", messageIds: ["keep"], condition: "保留" },
  ] }];
  assert.deepEqual(validateModelInput(model, "design"), []);
  model.messages.push({ ...model.messages[1], id: "after" });
  assert.ok(validateModelInput(model, "design").some((issue) => issue.code === "message-after-destroy"));
});

test("crossing fragments, invalid parent branches and activation intervals are rejected", () => {
  const model = modelFixture("design", "sequence") as any;
  model.messages = Array.from({ length: 4 }, (_, i) => ({ ...model.messages[0], id: `m${i}` }));
  model.fragments = [{ id: "one", type: "loop", label: "一", messageIds: ["m0", "m1", "m2"] }, { id: "two", type: "opt", label: "二", messageIds: ["m1", "m2", "m3"] }];
  assert.ok(validateModelInput(model, "design").some((issue) => issue.code === "fragment-overlap"));
  model.fragments = [];
  model.activations = [{ id: "x", participantId: "b", startMessageId: "m0", endMessageId: "m2" }, { id: "y", participantId: "b", startMessageId: "m1", endMessageId: "m3" }];
  assert.ok(validateModelInput(model, "design").some((issue) => issue.code === "activation-overlap"));
});

test("object types propagate through fork and join, while global ID collisions cannot hide in auxiliary collections", () => {
  const model = objectActivityFixture();
  model.nodes.push({ id: "fork", type: "fork" }, { id: "other", type: "object", name: "发票", dataType: "Invoice" });
  model.relationships.find((edge) => edge.id === "data1")!.targetId = "fork";
  model.relationships.push({ id: "split1", type: "object_flow", sourceId: "fork", targetId: "data" }, { id: "split2", type: "object_flow", sourceId: "fork", targetId: "other" });
  assert.ok(validateModelInput(model, "requirements").some((issue) => issue.code === "object-type"));
  model.swimlanes[0]!.id = "work";
  assert.ok(validateModelInput(model, "requirements").some((issue) => issue.code === "duplicate-id"));
});

test("business concept names do not trigger implementation heuristics", () => {
  const model = modelFixture("requirements", "class") as any;
  model.classes[0].name = "AccountManager";
  assert.deepEqual(validateModelInput(model, "requirements"), []);
});

test("empty alternatives preserve the no-op path and activations cannot cross operands", () => {
  const model = modelFixture("design", "sequence") as any;
  model.messages[0].type = "create";
  model.fragments = [{ id: "choice", type: "alt", label: "创建", messageIds: ["m"], branches: [
    { id: "yes", label: "需要", messageIds: ["m"] }, { id: "no", label: "无需", messageIds: [] },
  ] }];
  assert.deepEqual(validateModelInput(model, "design"), []);
  model.messages.push({ ...model.messages[0], id: "later", type: "sync" });
  assert.ok(validateModelInput(model, "design").some((issue) => issue.code === "message-before-create"));
  model.messages[0].type = "sync";
  model.activations = [{ id: "active", participantId: "b", startMessageId: "m", endMessageId: "later" }];
  assert.ok(validateModelInput(model, "design").some((issue) => issue.code === "activation-branch"));
});

test("removing a foreign key does not require editing its read-only derived relationship", () => {
  const input = modelFixture("design", "table");
  if (input.diagramKind !== "table") throw new Error("fixture");
  const model = deriveTableModel(input);
  model.tables[1]!.relationalConstraints = model.tables[1]!.relationalConstraints.filter((key) => key.type !== "foreign-key");
  model.tables.splice(0, 1);
  assert.deepEqual(validateModelInput(model, "design"), []);
  assert.equal(deriveTableModel(model).relationships.length, 0);
});
