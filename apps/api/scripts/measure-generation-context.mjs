// Measures deterministic prompt scope reductions; it never calls a provider or estimates live billing.
import assert from "node:assert/strict";
import { getEncoding } from "js-tiktoken";
import { createRequirementBaselineSnapshot } from "@uml-platform/contracts";
import { reviewPromptContext } from "../../../packages/prompts/src/prompt-context.ts";
import { modelFixture } from "../../../packages/contracts/src/testing/model-fixtures.ts";
import { GenerationRepairSession } from "../src/runs/pipelines/shared/generation-repair.ts";

const rule = { id: "R1", type: "business-rule", text: "保存失败必须回滚，拒绝后不得创建记录。" };
const baseline = createRequirementBaselineSnapshot({ runId: "fixture", requirementText: rule.text, rules: [rule] });
const model = modelFixture("design", "sequence");
model.sourceUseCaseId = "wanted";
const usecase = modelFixture("requirements", "usecase");
usecase.useCases = ["wanted", "included", ...Array.from({ length: 18 }, (_, i) => `other-${i}`)]
  .map(id => ({ ...usecase.useCases[0], id, name: id, goal: `${id}：核对权限、提交、保存与失败处理。` }));
usecase.relationships = [{ id: "include", sourceId: "wanted", targetId: "included", type: "include", label: "必经业务" }];
const basis = { baseline, rules: [rule], upstreamModels: [usecase, ...Array.from({ length: 8 }, (_, i) => ({
  ...modelFixture("requirements", "class"), modelId: `unrelated-${i}`, notes: ["其他业务说明。".repeat(100)],
}))] };
const scoped = reviewPromptContext("design", model, basis);
assert.deepEqual(scoped.upstreamModels[0].useCases.map(item => item.id), ["wanted", "included"]);
assert.ok(JSON.stringify(scoped).includes(rule.text));

const value = { models: [{ diagramKind: "class", modelId: "class", classes: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
  relationships: [{ id: "edge", sourceId: "a", targetId: "missing" }], notes: ["已确认业务正文，不参与端点修复。".repeat(100)] }] };
const original = structuredClone(value);
const repair = new GenerationRepairSession("class", basis, ["models"], 2);
repair.accept(JSON.stringify(value));
const focused = repair.prepare(new Error("[missing-endpoint] relationships.0: 关系终点不存在"));
assert.ok(focused.includes('"targetId":"missing"'));
assert.ok(!focused.includes("unrelated-"));
assert.deepEqual(value, original);

const encoding = getEncoding("cl100k_base");
const tokens = value => encoding.encode(typeof value === "string" ? value : JSON.stringify(value), [], []).length;
const comparison = (before, after) => ({ beforeTokens: tokens(before), afterTokens: tokens(after),
  reductionPercent: Number(((1 - tokens(after) / tokens(before)) * 100).toFixed(1)) });
console.log(JSON.stringify({ fixture: "20 use cases, 8 unrelated models, one invalid relationship endpoint", tokenizer: "cl100k_base",
  reviewContext: comparison({ basis, model }, { basis: scoped, model }),
  repairContext: comparison({ basis, current: value }, focused),
  scope: "Synthetic input comparison only; excludes output, retries, latency and provider billing." }, null, 2));
