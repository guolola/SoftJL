// Measures scoped sequence source inputs and retained model-repair messages without provider calls or billing estimates.
import assert from "node:assert/strict";
import { getEncoding } from "js-tiktoken";
import { createRequirementBaselineSnapshot } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import { buildGenerateDesignSequencePrompt, scopeUseCaseModelForPrompt } from "@uml-platform/prompts";
import { ModelGenerationConversation } from "../src/runs/pipelines/shared/model-generation-conversation.ts";
import { createMessages } from "../src/runs/pipelines/shared/llm-messages.ts";

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
// Reuse the current pipeline's source selector; the broad fixture is only a synthetic comparison input.
const scoped = { ...basis, upstreamModels: [scopeUseCaseModelForPrompt(usecase, "wanted")] };
assert.deepEqual(scoped.upstreamModels[0].useCases.map(item => item.id), ["wanted", "included"]);
assert.ok(JSON.stringify(scoped).includes(rule.text));

const initial = createMessages(buildGenerateDesignSequencePrompt(baseline, scoped.upstreamModels[0], [], "wanted"));
const repair = new ModelGenerationConversation("sequence:wanted", initial);
const raw = JSON.stringify({ models: [model], designModelTraceability: [] });
repair.accept(raw);
repair.prepare(new Error("designModelTraceability 映射缺少业务元素，请返回完整模型及有效来源映射"));
const repairedRequest = repair.messages;
// The comparison uses the production repair protocol: exact prefix, raw output and feedback.
assert.deepEqual(repairedRequest.slice(0, initial.length), initial);
assert.equal(repairedRequest.at(-2).content, raw);
assert.ok(!JSON.stringify(repairedRequest).includes("unrelated-"));

const encoding = getEncoding("cl100k_base");
const tokens = value => encoding.encode(typeof value === "string" ? value : JSON.stringify(value), [], []).length;
const comparison = (before, after) => ({ beforeTokens: tokens(before), afterTokens: tokens(after),
  reductionPercent: Number(((1 - tokens(after) / tokens(before)) * 100).toFixed(1)) });
console.log(JSON.stringify({ fixture: "20 use cases, 8 unrelated models, one sequence model with missing provenance", tokenizer: "cl100k_base",
  sequenceSourceContext: comparison({ basis, model }, { basis: scoped, model }),
  modelRepairConversation: { initialRequestTokens: tokens(initial), firstRepairRequestTokens: tokens(repairedRequest),
    retainedPrefixTokens: tokens(initial), addedMessagesTokens: tokens(repairedRequest) - tokens(initial) },
  scope: "Synthetic request inputs only. Repair retains history and adds input; no cache, total-token, latency or billing savings are inferred." }, null, 2));
