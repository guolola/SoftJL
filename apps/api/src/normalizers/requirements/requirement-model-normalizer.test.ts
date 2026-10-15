// Rejects semantic loss in both structured and plain-JSON requirement model responses.
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture, objectActivityFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import { parseRequirementDiagramModelsOnly, parseRequirementTraceabilityCoverageResult } from "./requirement-model-normalizer.js";
const parse = (model: unknown) => parseRequirementDiagramModelsOnly(JSON.stringify({ models: [model] })).models[0]!;

test("requirement parsing preserves every supported model", () => {
  for (const kind of ["function", "usecase", "class", "activity", "deployment", "prototype", "analysis"]) {
    const model = modelFixture("requirements", kind); assert.deepEqual(parse(model), model);
  }
});
test("technical classes, methods and unsupported relationships fail instead of disappearing", () => {
  const model = modelFixture("requirements", "class") as any;
  model.classes[0].stereotype = "service";
  assert.throws(() => parse(model), /analysis-implementation-detail/);
  delete model.classes[0].stereotype; model.classes[0].operations.push({ name: "save", visibility: "public", parameters: [] });
  assert.throws(() => parse(model), /operations/);
  model.classes[0].operations = []; model.relationships[0].type = "dependency";
  assert.throws(() => parse(model), /relationships.0.type/);
});
test("function dependencies and conflicting parentId are rejected", () => {
  const model = modelFixture("requirements", "function") as any;
  model.relationships[0].type = "dependency"; assert.throws(() => parse(model), /contract/);
  model.relationships[0].type = "decomposition"; model.nodes[1].parentId = "wrong";
  assert.throws(() => parse(model), /unsupported-field/);
});
test("localized concept metadata survives intact", () => {
  const model = modelFixture("requirements", "class") as any;
  Object.assign(model.classes[0], { chineseName: "订单", englishName: "Order", constraints: ["已完成订单不得再次提交"] });
  assert.deepEqual(parse(model), model);
});
test("same-name actions, ordinary completion names, object pins and full conditions survive", () => {
  const model = objectActivityFixture();
  const node = model.nodes.find((node) => node.id === "work")!; Object.assign(node, { name: "完成业务校验" });
  Object.assign(model.relationships[0]!, { guard: "订单金额达到5000元（包含正好5000元）且每一项审批均符合要求", trigger: "所有参与方已经确认完整的业务输入" });
  assert.deepEqual(parse(model), model);
});
test("missing endpoints or flow continuity fail without invented nodes or edges", () => {
  const model = modelFixture("requirements", "activity") as any;
  model.relationships = [];
  assert.throws(() => parse(model), /unreachable-node/);
  assert.equal(model.nodes.length, 3); assert.equal(model.relationships.length, 0);
});
test("optional null fields normalize but unknown elements fail with exact paths", () => {
  const model = modelFixture("requirements", "analysis") as any;
  model.messages[0].condition = null;
  assert.equal((parse(model) as any).messages[0].condition, undefined);
  model.messages[0].unexpected = "must not disappear";
  assert.throws(() => parse(model), /messages.0.unexpected/);
});
test("prototype returns retain the original endpoint, guard and trigger without inventing entries", () => {
  const model = modelFixture("requirements", "prototype") as any;
  Object.assign(model.relationships[0], { type: "returns", trigger: "返回操作", guard: "尚未保存的数据已经确认放弃" });
  assert.deepEqual(parse(model), model);
});
test("traceability still accepts nullable optional model identifiers", () => {
  const model = modelFixture("requirements", "usecase") as any; delete model.modelId;
  const coverage = parseRequirementTraceabilityCoverageResult(JSON.stringify({ requirementModelTraceability: [{ ruleId: "R1", target: { diagramKind: "usecase", modelId: null, elementId: "case", elementKind: "usecase", label: "下单" } }] }), [{ id: "R1", category: "功能需求", text: "顾客可以下单", relatedDiagrams: ["usecase"] }], [model]);
  assert.equal(coverage.traceability[0]?.target.elementId, "case");
});
