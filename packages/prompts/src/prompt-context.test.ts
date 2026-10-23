// Guards semantic evidence, dependency scope and candidate isolation while reducing prompt payloads.
import assert from "node:assert/strict";
import test from "node:test";
import { createRequirementBaselineSnapshot, feasibilityInputsSchema, getStageModelSchemas, type ModelingStage, type RequirementRule } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import { compactPromptRules, scopeUseCaseModelForPrompt } from "./prompt-context.js";

import { buildGenerateDesignModelsPrompt, buildGenerateDesignSequencePrompt, buildGenerateModelsPrompt, buildGenerateRequirementAnalysisPrompt } from "./model-prompts.js";
import { buildGenerateFeasibilityContextPrompt, buildGenerateFeasibilityImplementationPrompt } from "./feasibility-prompts.js";
import { expandPromptData } from "./prompt-data.js";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "./feasibility-example.js";

const rules: RequirementRule[] = [{ id: "R1", type: "functional" as const, text: "金额达到5000元（含5000元）时进入审核；拒绝时保留原记录。",  }];
const baseline = createRequirementBaselineSnapshot({ runId: "context", requirementText: rules[0].text, rules });

test("type and explicit conditions survive compaction without removed classification fields", () => {
  const text = "订单系统调用门店接口时，95%的请求不超过2秒；失败时保留输入。";
  const source = [{ id: "R1", type: "interface" as const, text, sourceFragment: text }];
  const saved = createRequirementBaselineSnapshot({ runId: "text", requirementText: text, rules: source });
  const model = modelFixture("feasibility", "context");
  const prompts = [buildGenerateFeasibilityContextPrompt({ rules: source, requirementBaseline: saved, inputs: feasibilityInputsSchema.parse({}) })];
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

test("analysis participant vocabulary is taken from the requirement-stage contract", () => {
  const prompt = buildGenerateRequirementAnalysisPrompt(modelFixture("requirements", "usecase"));
  const schema = JSON.parse(prompt.split("- analysis JSON Schema: ")[1].split("\n")[0]);
  assert.deepEqual(schema.properties.participants.items.properties.participantType.enum, ["actor", "boundary", "control", "entity"]);
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
