// Rejects semantic loss in both structured and plain-JSON requirement model responses.
import assert from "node:assert/strict";
import test from "node:test";
import { collectModelRefs } from "@uml-platform/contracts";
import { modelFixture, parallelActivityFixture } from "@uml-platform/contracts/testing";
import { parseGeneratedAnalysisModels, parseRequirementDiagramModelsOnly, parseRequirementDiagramModelsResult } from "./requirement-model-normalizer.js";
const parse = (model: unknown) => parseRequirementDiagramModelsOnly(JSON.stringify({ models: [model] })).models[0]!;

test("requirement parsing preserves every supported model", () => {
  for (const kind of ["function", "usecase", "class", "activity", "deployment", "prototype", "analysis"]) {
    const model = modelFixture("requirements", kind); assert.deepEqual(parse(model), model);
  }
});
test("Schema rejects unsupported methods and relationships while retaining class stereotypes", () => {
  const model = modelFixture("requirements", "class") as any;
  model.classes[0].stereotype = "service";
  assert.deepEqual(parse(model), model);
  delete model.classes[0].stereotype; model.classes[0].operations.push({ name: "save", visibility: "public", parameters: [] });
  assert.throws(() => parse(model), /operations/);
  model.classes[0].operations = []; model.relationships[0].type = "dependency";
  assert.throws(() => parse(model), /invalid_value/);
});
test("function dependencies and conflicting parentId are rejected", () => {
  const model = modelFixture("requirements", "function") as any;
  model.relationships[0].type = "dependency"; assert.throws(() => parse(model), /invalid_value/);
  model.relationships[0].type = "decomposition"; model.nodes[1].parentId = "wrong";
  assert.throws(() => parse(model), /unsupported-field/);
});
test("localized concept metadata survives intact", () => {
  const model = modelFixture("requirements", "class") as any;
  Object.assign(model.classes[0], { chineseName: "订单", englishName: "Order", constraints: ["已完成订单不得再次提交"] });
  assert.deepEqual(parse(model), model);
});
test("ordinary completion names, parallel swimlanes and full conditions survive", () => {
  const model = parallelActivityFixture();
  const node = model.nodes.find((node) => node.id === "work")!; Object.assign(node, { name: "完成业务校验" });
  Object.assign(model.relationships[0]!, { guard: "订单金额达到5000元（包含正好5000元）且每一项审批均符合要求", trigger: "所有参与方已经确认完整的业务输入" });
  assert.deepEqual(parse(model), model);
});
test("Schema parsing preserves graph content without connectivity inference", () => {
  const model = modelFixture("requirements", "activity") as any;
  model.relationships = [];
  assert.deepEqual(parse(model), model);
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

test("first model response retains declared sources without coverage audits", () => {
  const model = modelFixture("requirements", "usecase") as any;
  const reference = { ruleId: "r1", target: { diagramKind: "usecase", elementId: "case", elementKind: "usecase", label: "下单" } };
  const parseOutput = (entries: unknown[]) => parseRequirementDiagramModelsResult(JSON.stringify({ models: [model], requirementModelTraceability: entries }));
  assert.equal(parseOutput([reference]).requirementModelTraceability.length, 1);
  assert.equal(parseOutput([{ ...reference, ruleId: "provider-declared" }]).requirementModelTraceability[0]!.ruleId, "provider-declared");
  assert.deepEqual(Object.keys(parseOutput([reference]).requirementModelTraceability[0]!), ["ruleId", "target"]);
  assert.deepEqual(parseOutput([]).requirementModelTraceability, []);
});

test("source reading trusts declarations; fixed membership is enforced when selecting input rules", () => {
  const model = modelFixture("requirements", "function");
  const response = JSON.stringify({ models: [model], requirementModelTraceability: [{ ruleId: "r1", target: {
    modelId: "function", diagramKind: "function", elementId: "root", elementKind: "function", label: "系统",
  } }] });
  assert.equal(parseRequirementDiagramModelsResult(response).requirementModelTraceability.length, 1);
});


test("optional source bindings on real start/end flows are valid without becoming required coverage", () => {
  const model = modelFixture("requirements", "activity");
  const rules = [{ id: "r1", type: "functional" as const, text: "系统处理业务" }];
  const required = collectModelRefs([model]).refs.map(target => ({ ruleId: "r1", target }));
  const optional = ["r1", "r2"].map(elementId => ({ ruleId: "r1", target: { modelId: model.modelId, diagramKind: "activity", elementId, elementKind: "relationship", label: elementId } }));
  const parse = (refs: unknown[]) => parseRequirementDiagramModelsResult(JSON.stringify({ models: [model], requirementModelTraceability: refs }));
  assert.equal(parse(required).requirementModelTraceability.length, 1);
  assert.equal(parse([...required, ...optional]).requirementModelTraceability.length, 3);
  assert.equal(parse([...required, { ...optional[0], target: { ...optional[0]!.target, elementId: "provider-flow" } }]).requirementModelTraceability.length, 2);
  assert.equal(parse(optional).requirementModelTraceability.length, 2);
});


test("analysis element source IDs survive parsing without guessed rule bindings", () => {
  const model = modelFixture("requirements", "analysis") as any;
  model.participants.forEach((item: any) => item.sourceElementIds = ["actor-original"]);
  model.messages.forEach((item: any) => item.sourceElementIds = ["flow-original", "step-original"]);
  const parsed = parseGeneratedAnalysisModels(JSON.stringify({ models: [model] })).models[0] as any;
  assert.deepEqual(parsed.messages[0].sourceElementIds, ["flow-original", "step-original"]);
  assert.deepEqual(parsed.participants[0].sourceElementIds, ["actor-original"]);
});


test("Schema parsing leaves analysis coverage to the unified validator", () => {
  const model = modelFixture("requirements", "analysis") as any;
  assert.equal(parseGeneratedAnalysisModels(JSON.stringify({ models: [model] })).models.length, 1);
  model.participants.forEach((item: any) => item.sourceElementIds = ["declared-upstream"]);
  model.messages.forEach((item: any) => item.sourceElementIds = ["declared-flow"]);
  assert.equal(parseGeneratedAnalysisModels(JSON.stringify({ models: [model] })).models.length, 1);
});
