// Ensures replayed feasibility inputs cannot reintroduce obsolete baseline facts.
import assert from "node:assert/strict";
import test from "node:test";
import { feasibilityInputsSchema } from "@uml-platform/contracts";
import { createEmptyFeasibilitySnapshot } from "../records/snapshots.js";
import { buildRequirementBaseline } from "../baselines/requirement-baseline.js";
import { runFeasibilityStagePipeline } from "./feasibility-pipeline.js";

test("replayed feasibility reconciles baseline facts before its first provider call", async () => {
  const rule = { id: "r1", category: "功能需求" as const, text: "旧版：管理员可以删除订单", relatedDiagrams: ["usecase" as const] };
  const baseline = buildRequirementBaseline({ runId: "old", requirementText: rule.text, rules: [rule] });
  const current = { ...rule, text: "新版：管理员禁止删除订单" };
  const snapshot = createEmptyFeasibilitySnapshot("replay", { projectId: "p", selectedArtifacts: ["context"],
    rules: [current], requirementBaseline: baseline, providerSettings: { providerConfigId: "p", model: "test" }, inputs: feasibilityInputsSchema.parse({}) });
  let prompt = "";
  await assert.rejects(runFeasibilityStagePipeline({ snapshot, events: [], listeners: new Set(), terminal: false },
    { apiBaseUrl: "https://example.test", apiKey: "test", model: "test" },
    { async *streamChatCompletion(input) { prompt = JSON.stringify(input.messages); throw new Error("provider-stop"); } },
    { async render() { throw new Error("must not render"); } }), /provider-stop/);
  assert.match(prompt, /新版：管理员禁止删除订单/);
  assert.doesNotMatch(prompt, /旧版：管理员可以删除订单/);
  assert.equal(snapshot.requirementBaseline?.rules?.[0]?.text, current.text);
});
