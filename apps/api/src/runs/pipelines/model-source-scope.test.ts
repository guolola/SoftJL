// Verifies prompts and backend validation share one task-bound source scope.
import assert from "node:assert/strict";
import test from "node:test";
import { collectModelRefs, type DiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import type { LlmTransport, StreamChatCompletionInput } from "../../adapters/llm/llm-transport.js";
import { strictTestModelCapability } from "../../../tests/fixtures/providers/model-capability.js";
import { createEmptySnapshot, createEmptyDesignSnapshot } from "../records/snapshots.js";
import type { RunRecord } from "../records/run-record-store.js";
import { generateModelsWithRepair } from "./requirements-pipeline.js";
import { generateDesignModelsWithRepair } from "./design-pipeline.js";

const provider = { apiBaseUrl: "https://provider.test", apiKey: "test", model: "test", modelCapability: strictTestModelCapability("test") };
const rules = [
  { id: "r1", type: "functional" as const, text: "用户查询业务记录。", sourceFragment: "用户查询业务记录。" },
  { id: "r2", type: "quality" as const, text: "业务记录只供本人查看。", sourceFragment: "业务记录只供本人查看。" },
  { id: "r3", type: "functional" as const, text: "OUTSIDE_R3_ONLY_FACT" },
];
test("r1/r2 requirement tasks cannot read or validate r3 through a backend baseline", async () => {
  const snapshot = createEmptySnapshot("bound-rules", "需求", ["usecase"], rules);
  const originalBaseline = structuredClone(snapshot.requirementBaseline);
  const record: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
  const model = modelFixture("requirements", "usecase") as DiagramModelSpec;
  const candidate = { models: [model], requirementModelTraceability: collectModelRefs([model], true).refs.map(target => ({ ruleId: "r1", target })) };
  snapshot.requirementModelTraceability = [{ ruleId: "r3", target: { ...candidate.requirementModelTraceability[0]!.target, label: "OUTSIDE_TRACE_ONLY_FACT" } }];
  let turn = 0;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const prompt = String(input.messages[1]!.content);
    assert.doesNotMatch(prompt, /OUTSIDE_R3_ONLY_FACT|RequirementBaseline|requirement_baseline/);
    assert.ok(!prompt.includes(originalBaseline!.id));
    assert.equal(input.tools, undefined);
    assert.match(prompt, /r1/); assert.match(prompt, /r2/);
    if (turn++ === 0) {
      yield JSON.stringify({ ...candidate, requirementModelTraceability: candidate.requirementModelTraceability.map(binding => ({ ...binding, ruleId: "r3" })) });
    } else {
      assert.match(String(input.messages.at(-1)!.content), /mapping-rule-missing/);
      assert.doesNotMatch(String(input.messages.at(-1)!.content), /OUTSIDE_R3_ONLY_FACT|OUTSIDE_TRACE_ONLY_FACT/);
      yield JSON.stringify(candidate);
    }
  } };
  const result = await generateModelsWithRepair(record, provider, transport, rules.slice(0, 2), ["usecase"]);
  assert.equal(turn, 2);
  assert.deepEqual(result.models, [model]);
  assert.deepEqual(snapshot.requirementBaseline, originalBaseline, "Backend version and fingerprint remain intact");
});

test("design tasks reject unbound models and baseline-only rule IDs in the same conversation", async () => {
  const upstream = modelFixture("requirements", "prototype");
  if (upstream.diagramKind !== "prototype") throw new Error("fixture");
  upstream.nodes.forEach(node => { node.sourceRequirementIds = ["r1"]; });
  const outside = modelFixture("requirements", "usecase");
  if (outside.diagramKind !== "usecase") throw new Error("fixture");
  outside.useCases[0]!.goal = "UNBOUND_USECASE_FACT";
  const baseline = createEmptySnapshot("source", "需求", [], rules).requirementBaseline!;
  const snapshot = createEmptyDesignSnapshot("bound-navigation", { selectedDiagrams: ["navigation"], requirementModels: [upstream, outside], requirementBaseline: baseline, requirementModelTraceability: [] });
  const record: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
  const model = modelFixture("design", "navigation");
  if (model.diagramKind !== "navigation") throw new Error("fixture");
  model.nodes.forEach(node => { node.sourceRequirementIds = ["r1"]; });
  const candidate = { models: [model], designModelTraceability: collectModelRefs([model], true).refs.map(source => ({ source, targets: [collectModelRefs([upstream], true).refs[0]!] })) };
  snapshot.designModelTraceability = [{ source: candidate.designModelTraceability[0]!.source, targets: [{ ...collectModelRefs([outside], true).refs[0]!, label: "OUTSIDE_TRACE_ONLY_FACT" }] }];
  let turn = 0;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    assert.doesNotMatch(String(input.messages[1]!.content), /UNBOUND_USECASE_FACT|OUTSIDE_R3_ONLY_FACT|RequirementBaseline/);
    assert.equal(input.tools, undefined);
    assert.match(String(input.messages[1]!.content), /prototype/);
    if (turn++ === 0) {
      const invalid = structuredClone(candidate);
      invalid.models[0]!.nodes[0]!.sourceRequirementIds = ["r3"];
      invalid.designModelTraceability[0]!.targets = [collectModelRefs([outside], true).refs[0]!];
      yield JSON.stringify(invalid);
    } else {
      const feedback = String(input.messages.at(-1)!.content);
      assert.match(feedback, /mapping-rule-missing/); assert.match(feedback, /mapping-model-missing/);
      assert.doesNotMatch(feedback, /UNBOUND_USECASE_FACT|OUTSIDE_R3_ONLY_FACT|OUTSIDE_TRACE_ONLY_FACT/);
      yield JSON.stringify(candidate);
    }
  } };
  const result = await generateDesignModelsWithRepair(record, provider, transport, [upstream, outside], ["navigation"], "generate_design_models");
  assert.equal(turn, 2);
  assert.deepEqual(result.models, [model]);
  assert.deepEqual(snapshot.requirementBaseline, baseline);
});
