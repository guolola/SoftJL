// Verifies every graphical model receives business checks in its original generation prompt.
import assert from "node:assert/strict";
import test from "node:test";
import { getStageModelSchemas, getModelReviewProfile, type DesignDiagramKind, type DiagramKind } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import { buildGenerateModelsPrompt, buildGenerateRequirementAnalysisPrompt, buildGenerateDesignModelsPrompt, buildGenerateDesignSequencePrompt } from "./model-prompts.js";
import { buildGenerateFeasibilityContextPrompt, buildGenerateFeasibilityImplementationPrompt } from "./feasibility-prompts.js";
import { buildGenerateFeasibilityBusinessFlowPrompt } from "./feasibility-business-flow-prompt.js";

test("model generation requests only canonical mapping fields without annotation output", () => {
  const prompts = [buildGenerateModelsPrompt([], ["function"]),
    buildGenerateRequirementAnalysisPrompt(modelFixture("requirements", "usecase")),
    buildGenerateDesignModelsPrompt([], [], ["component"]),
    buildGenerateDesignSequencePrompt(modelFixture("requirements", "usecase"))];
  for (const prompt of prompts) assert.doesNotMatch(prompt, /mappingSource|upstreamDesignRefs|"rationale"/);
  assert.match(prompts[0]!, /每项只给出 ruleId 和 target/);
  assert.match(prompts[2]!, /每条映射只返回 source 和 targets/);
});

test("both business flow prompts require vertical swimlanes without the retired object-flow guidance", () => {
  const prompts = [buildGenerateModelsPrompt([], ["activity"]), buildGenerateFeasibilityBusinessFlowPrompt({ rules: [], inputs: {} as any })];
  for (const prompt of prompts) {
    assert.match(prompt, /竖向泳道/);
    assert.match(prompt, /actorOrLane/);
    assert.match(prompt, /control_flow/);
    assert.doesNotMatch(prompt, /对象流连接输出引脚|flow_final 只终止/);
  }
});
for (const stage of ["requirements", "design"] as const) for (const schema of getStageModelSchemas(stage)) {
  const kind = schema.shape.diagramKind.value;
  test(`${stage}/${kind} includes its business focus before returning the final artifact`, () => {
    const prompt = stage === "requirements"
      ? kind === "analysis" ? buildGenerateRequirementAnalysisPrompt(modelFixture("requirements", "usecase")) : buildGenerateModelsPrompt([], [kind as DiagramKind])
      : kind === "sequence" ? buildGenerateDesignSequencePrompt(modelFixture("requirements", "usecase")) : buildGenerateDesignModelsPrompt([], [], [kind as DesignDiagramKind]);
    assert.match(prompt, /生成阶段业务自检/);
    assert.match(prompt, /只输出最终产物，不输出自检过程/);
    for (const focus of getModelReviewProfile(stage, kind).content) assert.ok(prompt.includes(focus));
    assert.equal(prompt.split("生成阶段业务自检").length - 1, 1);
  });
}

test("feasibility context, flow and implementation check business in their generation turn", () => {
  const sources = { rules: [], inputs: {} as Parameters<typeof buildGenerateFeasibilityContextPrompt>[0]["inputs"] };
  const contextModel = modelFixture("feasibility", "context");
  if (contextModel.diagramKind !== "context") throw new Error("fixture");
  const businessFlow = { model: modelFixture("feasibility", "activity"), traceability: [] } as Parameters<typeof buildGenerateFeasibilityImplementationPrompt>[0]["businessFlow"];
  const prompts = [buildGenerateFeasibilityContextPrompt(sources), buildGenerateFeasibilityBusinessFlowPrompt(sources), buildGenerateFeasibilityImplementationPrompt({ ...sources, contextModel, businessFlow })];
  for (const prompt of prompts) {
    assert.match(prompt, /生成阶段业务自检/);
    assert.match(prompt, /在本次生成中修正/);
    assert.equal(prompt.split("生成阶段业务自检").length - 1, 1);
  }
});


test("context sources retain all bound rule types without a baseline payload", () => {
  const rules = [{ id: "r-functional", type: "functional" as const, text: "FUNCTIONAL-SOURCE" }, { id: "r-interface", type: "interface" as const, text: "INTERFACE-SOURCE" }, { id: "r-data", type: "data" as const, text: "EXCLUDED-DATA-SOURCE" }, { id: "r-quality", type: "quality" as const, text: "EXCLUDED-QUALITY-SOURCE" }];
  const prompt = buildGenerateFeasibilityContextPrompt({ rules, inputs: {} as any });
  const payload = JSON.parse(prompt.split("输入：\n")[1]!);
  assert.deepEqual(payload.rules.map((rule: any) => rule.id), rules.map(rule => rule.id));
  assert.equal("requirementBaseline" in payload, false);
  assert.match(prompt, /EXCLUDED-DATA-SOURCE/); assert.match(prompt, /EXCLUDED-QUALITY-SOURCE/);
});

test("first generation declares analysis sources and direct design dependencies", () => {
  const analysis = buildGenerateRequirementAnalysisPrompt(modelFixture("requirements", "usecase"));
  assert.match(analysis, /每个带 id 的元素.*branches、activations.*sourceElementIds/);
  assert.doesNotMatch(analysis, /来源覆盖关系由系统.*派生/);
  for (const kind of ["component", "table", "deployment"] as const) {
    const prompt = buildGenerateDesignModelsPrompt([], [], [kind], [modelFixture("design", "class") as any]);
    assert.match(prompt, /直接上游/);
    assert.match(prompt, /修复时在本对话中返回完整模型和全部有效来源映射/);
  }
});
