// Guards semantic evidence, dependency scope and candidate isolation while reducing prompt payloads.
import assert from "node:assert/strict";
import test from "node:test";
import { createRequirementBaselineSnapshot, feasibilityInputsSchema, getStageModelSchemas, type ModelingStage, type RequirementRule } from "@uml-platform/contracts";
import { modelFixture } from "../../contracts/src/testing/model-fixtures.js";
import { compactPromptRules, modelTaskSourcePrompt, reviewPromptContext, scopeUseCaseModelForPrompt, structuralRepairPromptModel } from "./prompt-context.js";
import { buildDiagramStructureReviewPrompt } from "./diagram-review-prompts.js";
import { buildGenerateDesignModelsPrompt, buildGenerateDesignSequencePrompt, buildGenerateModelsPrompt, buildGenerateRequirementAnalysisPrompt, buildRepairModelsPrompt } from "./model-prompts.js";
import { buildGenerateFeasibilityContextPrompt, buildGenerateFeasibilityImplementationPrompt, buildRepairFeasibilitySectionPrompt } from "./feasibility-prompts.js";
import { expandPromptData } from "./prompt-data.js";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "./feasibility-example.js";

const rules: RequirementRule[] = [{ id: "R1", type: "functional" as const, text: "金额达到5000元（含5000元）时进入审核；拒绝时保留原记录。",  }];
const baseline = createRequirementBaselineSnapshot({ runId: "context", requirementText: rules[0].text, rules });

test("type and explicit conditions survive compaction without removed classification fields", () => {
  const text = "订单系统调用门店接口时，95%的请求不超过2秒；失败时保留输入。";
  const source = [{ id: "R1", type: "interface" as const, text, sourceFragment: text }];
  const saved = createRequirementBaselineSnapshot({ runId: "text", requirementText: text, rules: source });
  const model = modelFixture("feasibility", "context");
  const prompts = [buildGenerateFeasibilityContextPrompt({ rules: source, requirementBaseline: saved, inputs: feasibilityInputsSchema.parse({}) }),
    JSON.stringify(reviewPromptContext("feasibility", model, { rules: source, baseline: saved }))];
  assert.deepEqual(compactPromptRules(source), [{ id: "R1", type: "interface", text }]);
  for (const prompt of prompts) {
    assert.ok(prompt.includes(text));
    assert.ok(prompt.includes('"type":"interface"'));
    assert.doesNotMatch(prompt, /participantIds|goalIds|assumptionIds|classification/);
  }
  // Context generation only receives functional/interface rules under the fixed routing contract.
  const quality = { id: "R2", type: "quality" as const, text: "页面必须支持键盘操作" };
  const context = buildGenerateFeasibilityContextPrompt({ rules: [...source, quality], requirementBaseline: saved, inputs: feasibilityInputsSchema.parse({}) });
  assert.ok(!context.includes(quality.text));
});

test("single-target generation retains transitive use-case evidence without generating its siblings", () => {
  const model = modelFixture("requirements", "usecase"); if (model.diagramKind !== "usecase") throw new Error("fixture");
  model.useCases = ["included", "target", "extension", "parent", "unrelated"].map(id => ({ ...model.useCases[0], id, name: id, goal: `${id}的完整事件依据` }));
  model.relationships = [
    { id: "inc", sourceId: "target", targetId: "included", type: "include", label: "包含" },
    { id: "ext", sourceId: "extension", targetId: "included", type: "extend", label: "异常扩展" },
    { id: "gen", sourceId: "extension", targetId: "parent", type: "generalization", label: "继承" },
    { id: "cycle", sourceId: "parent", targetId: "target", type: "include", label: "循环" },
  ];
  const original = structuredClone(model);
  const scoped = scopeUseCaseModelForPrompt(model, "target");
  assert.deepEqual(scoped.useCases.map(item => item.id), ["target", "included", "extension", "parent"]);
  assert.deepEqual(scoped.useCases[1].eventFlows, original.useCases[0].eventFlows);
  assert.deepEqual(model, original);
  const analysis = buildGenerateRequirementAnalysisPrompt(scoped);
  const sequence = buildGenerateDesignSequencePrompt(baseline, scoped, [], "target");
  for (const prompt of [analysis, sequence]) {
    assert.ok(prompt.includes('"sourceUseCaseId":"target"'));
    assert.ok(prompt.includes('"outputCount":1'));
    assert.ok(prompt.includes("included的完整事件依据"));
    assert.ok(!prompt.includes("unrelated的完整事件依据"));
    assert.ok(!prompt.includes("models.length 必须等于 useCases.length"));
  }
});

test("design repair source keeps baseline constraints and the selected use case", () => {
  const prompts = [buildGenerateDesignModelsPrompt(baseline, [], [], ["architecture"]),
    buildGenerateDesignSequencePrompt(baseline, modelFixture("requirements", "usecase"), [], "wanted")];
  for (const prompt of prompts) assert.ok(modelTaskSourcePrompt(prompt).includes(rules[0].text));
  assert.ok(modelTaskSourcePrompt(prompts[1]).includes('"sourceUseCaseId":"wanted"'));
});

test("function generation and repair distinguish nodes from explanatory constraints", () => {
  for (const prompt of [buildGenerateModelsPrompt(rules, baseline, ["function"]), buildRepairModelsPrompt(rules, baseline, ["function"], "{}", "invalid")]) {
    assert.ok(prompt.includes("非功能需求、界面需求和部署约束不得作为独立功能节点"));
    assert.ok(prompt.includes("适用约束保留在 summary、notes 或节点 description"));
    assert.ok(!prompt.includes("不得纳入非功能需求"));
  }
});

for (const stage of ["feasibility", "requirements", "design"] as ModelingStage[]) for (const schema of getStageModelSchemas(stage)) {
  const kind = schema.shape.diagramKind.value;
  test(`${stage}/${kind} retains the complete current model and untraced source boundaries`, () => {
    const model = modelFixture(stage, kind);
    model.notes.push("异常时拒绝执行；权限不足则返回。".repeat(100));
    const prompt = buildDiagramStructureReviewPrompt({ stage, model, basis: { baseline, rules, upstreamModels: [{ ...modelFixture("requirements", "activity"), modelId: "UNRELATED_SIBLING" }] } });
    assert.ok(prompt.endsWith(JSON.stringify(model)));
    assert.ok(prompt.includes(rules[0].text));
    assert.equal(prompt.split(rules[0].text).length - 1, 1, "rule text is not repeated by baseline metadata");
    assert.ok(!prompt.includes("UNRELATED_SIBLING"));
    assert.ok(!prompt.includes('"additionalProperties"'), "program-validated schema is not resent to semantic review");
  });
}

test("review sources retain complete use-case dependencies and pending trace provenance", () => {
  const model = modelFixture("design", "sequence"); if (model.diagramKind !== "sequence") throw new Error("fixture");
  model.sourceUseCaseId = "wanted";
  const usecase = modelFixture("requirements", "usecase"); if (usecase.diagramKind !== "usecase") throw new Error("fixture");
  usecase.useCases = ["wanted", "included", "unrelated"].map(id => ({ ...usecase.useCases[0], id, name: id, goal: id }));
  usecase.relationships = [{ id: "dependency", sourceId: "wanted", targetId: "included", type: "include", label: "必经业务" }];
  const trace = [{ source: { modelId: model.modelId, diagramKind: "sequence", elementId: "m1" }, targets: [{ modelId: usecase.modelId, diagramKind: "usecase", elementId: "wanted" }], mappingSource: "auto-filled-pending-review", reviewStatus: "pending", confidence: "low", rationale: "候选映射需要确认" }];
  const result = reviewPromptContext("design", model, { baseline, upstreamModels: [usecase], traceability: trace, requirementTraceability: [{ ruleId: "R1", target: trace[0].targets[0] }, { ruleId: "OTHER", target: { ...trace[0].targets[0], elementId: "unrelated" } }] }) as any;
  assert.deepEqual(result.upstreamModels[0].useCases.map((item: any) => item.id), ["wanted", "included"]);
  assert.deepEqual(result.upstreamModels[0].useCases[0].eventFlows, usecase.useCases[0].eventFlows);
  assert.equal(result.traceability[0].reviewStatus, "pending");
  assert.equal(result.traceability[0].rationale, "候选映射需要确认");
  assert.equal(result.requirementTraceability.length, 1);
  assert.deepEqual(trace[0].targets[0].elementId, "wanted", "stored evidence stays unchanged");
});

test("singleton model references use their current diagram-kind identity", () => {
  const model = modelFixture("design", "class"); delete model.modelId;
  const domain = modelFixture("requirements", "class"); delete domain.modelId;
  const result = reviewPromptContext("design", model, { upstreamModels: [domain], traceability: [{
    source: { diagramKind: "class", modelId: "class", elementId: "entity" }, targets: [], reviewStatus: "confirmed", rationale: "仅为相似候选，并非已核实事实",
  }] }) as any;
  assert.deepEqual(result.upstreamModels, [domain]);
  assert.equal(result.traceability.length, 1);
  assert.equal(result.traceability[0].rationale, "仅为相似候选，并非已核实事实");
  const unrelated = reviewPromptContext("design", model, { traceability: [{
    source: { diagramKind: "class", modelId: "obsolete-class-alias", elementId: "entity" }, targets: [],
  }] }) as any;
  assert.deepEqual(unrelated.traceability, []);
});

test("compact references retain omitted source element labels once without whole unrelated models", () => {
  const model = modelFixture("design", "component");
  const target = { modelId: "domain", diagramKind: "class", elementId: "Order", elementKind: "class", label: "订单领域对象" };
  const result = reviewPromptContext("design", model, { upstreamModels: [], traceability: ["a", "b"].map(elementId => ({
    source: { modelId: model.modelId, diagramKind: "component", elementId }, targets: [target], reviewStatus: "pending",
  })) }) as any;
  assert.deepEqual(result.referenceIndex, [target]);
  assert.equal(result.traceability.length, 2);
  assert.ok(result.traceability.every((entry: any) => entry.reviewStatus === "pending"));
});

test("design dependencies exclude sequences and use domain/use-case sources for class generation", () => {
  const unrelated = { ...modelFixture("requirements", "usecase"), modelId: "UNRELATED_REQUIREMENTS" };
  const sequence = { ...modelFixture("design", "sequence"), modelId: "ALL_USE_CASE_BEHAVIOR", notes: ["事务失败必须回滚，拒绝后不能保存。"] };
  const designClass = modelFixture("design", "class");
  const component = buildGenerateDesignModelsPrompt(baseline, [unrelated], [sequence], ["component"], [designClass]);
  assert.ok(!component.includes("UNRELATED_REQUIREMENTS")); assert.ok(!component.includes("ALL_USE_CASE_BEHAVIOR"));
  const section = (prompt: string, heading: string) => expandPromptData(JSON.parse(prompt.split(heading + "\n")[1].split("\n")[0]));
  assert.deepEqual(section(component, "已生成设计阶段上下文模型："), [designClass]);
  const table = buildGenerateDesignModelsPrompt(baseline, [unrelated], [sequence], ["table"], [designClass]);
  assert.ok(!table.includes("UNRELATED_REQUIREMENTS")); assert.deepEqual(section(table, "全部用例实现设计："), []);
  assert.deepEqual(section(table, "已生成设计阶段上下文模型："), [designClass]);
  const domain = { ...modelFixture("requirements", "class"), modelId: "DOMAIN_SOURCE" };
  const prototype = { ...modelFixture("requirements", "prototype"), modelId: "PROTOTYPE_SOURCE" };
  const classPrompt = buildGenerateDesignModelsPrompt(baseline, [domain, unrelated, prototype], [sequence], ["class"]);
  assert.deepEqual(section(classPrompt, "需求阶段来源模型："), [domain, unrelated]);
  assert.deepEqual(section(classPrompt, "全部用例实现设计："), []);
  const navigation = buildGenerateDesignModelsPrompt(baseline, [domain, unrelated, prototype], [sequence], ["navigation"]);
  assert.deepEqual(section(navigation, "需求阶段来源模型："), [prototype]);
  assert.deepEqual(section(navigation, "全部用例实现设计："), []);
  for (const kind of ["class", "navigation", "table"] as const) {
    const model = modelFixture("design", kind);
    const upstreamModels = kind === "table" ? [unrelated, prototype, sequence, designClass] : [domain, unrelated, prototype, sequence];
    const context = expandPromptData(reviewPromptContext("design", model, { upstreamModels })) as { upstreamModels: unknown[] };
    assert.deepEqual(context.upstreamModels, kind === "class" ? [domain, unrelated] : kind === "navigation" ? [prototype] : [designClass]);
  }
});

test("analysis participant vocabulary is taken from the requirement-stage contract", () => {
  const prompt = buildGenerateRequirementAnalysisPrompt(modelFixture("requirements", "usecase"));
  const schema = JSON.parse(prompt.split("- analysis JSON Schema: ")[1].split("\n")[0]);
  assert.deepEqual(schema.properties.participants.items.properties.participantType.enum, ["actor", "boundary", "control", "entity"]);
});

test("section repair excludes the other candidate and irrelevant chapters but preserves all source boundaries", () => {
  const plan = structuredClone(FEASIBILITY_IMPLEMENTATION_EXAMPLE);
  (plan.candidates[1] as any).name = "OTHER_CANDIDATE_PRIVATE_DETAIL";
  (plan.candidates[0].implementation as any).verdicts = [{ text: "UNRELATED_VERDICT_DETAIL" }];
  const originalPrompt = '生成规则\n输入：\n' + JSON.stringify({ rules, requirementBaseline: { conflicts: ["人工待确认"] } });
  const prompt = buildRepairFeasibilitySectionPrompt({ candidateIndex: 0, section: "economics", currentPlan: plan, issues: ["成本缺少区间"], originalPrompt });
  assert.ok(prompt.includes(rules[0].text)); assert.ok(prompt.includes("人工待确认"));
  assert.ok(!prompt.includes("OTHER_CANDIDATE_PRIVATE_DETAIL")); assert.ok(!prompt.includes("UNRELATED_VERDICT_DETAIL"));
  assert.ok(prompt.includes(JSON.stringify(plan.candidates[0].implementation.costEstimates)));
  assert.ok(prompt.includes(JSON.stringify(plan.candidates[0].implementation.milestones)));
  assert.ok(!prompt.includes("生成规则"));
});

test("local repair evidence includes full affected edge and endpoints without unrelated model bodies", () => {
  const model = modelFixture("design", "class"); if (model.diagramKind !== "class") throw new Error("fixture");
  const evidence = structuralRepairPromptModel(model, [{ path: "relationships.0.targetMultiplicity" }]) as any;
  assert.deepEqual(evidence.targets[0].value, model.relationships[0]);
  assert.ok(evidence.dependencies.classes.some((item: any) => item.id === model.relationships[0].targetId));
});

test("implementation generation retains both-candidate instructions and the complete business flow", () => {
  const model = modelFixture("feasibility", "activity"); if (model.diagramKind !== "activity") throw new Error("fixture");
  const prompt = buildGenerateFeasibilityImplementationPrompt({ rules, requirementBaseline: baseline, inputs: {} as any,
    contextModel: modelFixture("feasibility", "context") as any, businessFlow: { model, traceability: [] } });
  assert.match(prompt, /恰好 2 个可执行候选方案/);
  assert.match(prompt, /实际必须生成两份完整候选/);
  assert.ok(prompt.includes(JSON.stringify(model)));
  assert.ok(prompt.includes(rules[0].text));
});
