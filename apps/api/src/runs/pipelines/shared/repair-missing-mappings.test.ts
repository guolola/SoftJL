// Exercises missing-only provenance completion, invalid responses, model identity and shared retry budgets.
import assert from "node:assert/strict";
import test from "node:test";
import { type RequirementModelTraceabilityEntry, type DesignModelTraceabilityEntry } from "@uml-platform/contracts";
import { modelFixture } from "../../../../../../packages/contracts/src/testing/model-fixtures.js";
import { collectModelRefs } from "../../../normalizers/traceability/traceability-normalizer.js";
import { strictTestModelCapability } from "../../../test-fixtures/providers/model-capability.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import { readDiagramReviewCounters } from "../../records/diagram-review-record.js";
import { repairRequirementMappings, repairDesignMappings } from "./repair-missing-mappings.js";
import type { RunRecord } from "../../records/run-record-store.js";

const rule = { id: "r1", type: "functional" as const, text: "系统处理订单" };
const settings = { model: "test", apiBaseUrl: "https://llm.test", apiKey: "test", modelCapability: strictTestModelCapability("test") };
const model = modelFixture("requirements", "function");
const bindings: RequirementModelTraceabilityEntry[] = collectModelRefs([model]).refs.map(target => ({ ruleId: "r1", target }));
function common() {
  const record: RunRecord = { snapshot: createEmptySnapshot("mapping-repair", rule.text, ["function"], [rule]), events: [], listeners: new Set(), terminal: false };
  return { record, providerSettings: settings, stage: "generate_models" as const, targetId: "function", diagramKind: "function" as const };
}

test("complete mappings make no extra call and keep existing mapping objects", async () => {
  const result = await repairRequirementMappings({ ...common(), models: [model], rules: [rule], bindings,
    llmTransport: { async *streamChatCompletion() { throw new Error("must not call"); } } });
  assert.deepEqual(result, bindings);
  assert.equal(result[0], bindings[0]);
});

test("analysis sources do not trigger fabricated direct rule mappings", async () => {
  const result = await repairRequirementMappings({ ...common(), models: [modelFixture("requirements", "analysis")], rules: [rule], bindings: [],
    llmTransport: { async *streamChatCompletion() { throw new Error("must not call"); } } });
  assert.deepEqual(result, []);
});

for (const invalid of ["model-rewrite", "existing-element", "invalid-rule", "invalid-target", "low-confidence", "malformed"] as const) {
  test(`rejects ${invalid} before merging any mappings`, async () => {
    const input = common(); let calls = 0;
    const result = await repairRequirementMappings({ ...input, models: [model], rules: [rule], bindings: [bindings[0]!],
      llmTransport: { async *streamChatCompletion() {
        calls++;
        if (calls > 1) { yield JSON.stringify({ requirementModelTraceability: bindings.slice(1) }); return; }
        const additions = structuredClone(bindings.slice(1));
        if (invalid === "invalid-rule") additions[0]!.ruleId = "missing";
        if (invalid === "invalid-target") additions[0]!.target.elementId = "missing";
        if (invalid === "low-confidence") additions[0]!.confidence = "low";
        yield invalid === "malformed" ? "invalid JSON" : JSON.stringify(invalid === "model-rewrite" ? { models: [model], requirementModelTraceability: additions }
          : { requirementModelTraceability: invalid === "existing-element" ? bindings : additions });
      } } });
    assert.equal(calls, 2);
    assert.deepEqual(result.map(entry => entry.target.elementId), bindings.map(entry => entry.target.elementId));
    assert.equal(result[0], bindings[0]);
    assert.equal(readDiagramReviewCounters(input.record, "function", "function").repairAttempts, 2);
  });
}

test("partial additions shrink the next missing list without replaying accepted mappings", async () => {
  let calls = 0;
  const result = await repairRequirementMappings({ ...common(), models: [model], rules: [rule], bindings: [],
    llmTransport: { async *streamChatCompletion(input) {
      calls++;
      const missing = JSON.parse(String(input.messages.at(-1)!.content).match(/缺失元素清单：(.*)/)![1]!);
      assert.equal(missing.length, calls === 1 ? 3 : 2);
      yield JSON.stringify({ requirementModelTraceability: calls === 1 ? bindings.slice(0, 1) : bindings.slice(1) });
    } } });
  assert.equal(result.length, 3);
  assert.equal(calls, 2);
});

test("design additions accept real direct design dependencies and isolate sibling model IDs", async () => {
  const first = modelFixture("design", "component");
  const sibling = { ...modelFixture("design", "component"), modelId: "sibling" };
  const upstream = { ...modelFixture("design", "class"), modelId: "upstream-class" };
  const target = collectModelRefs([upstream]).refs[0]!;
  const current: DesignModelTraceabilityEntry[] = collectModelRefs([first, sibling]).refs.map(source => ({ source, targets: [target] }));
  const accepted = current.filter(entry => entry.source.modelId !== "sibling");
  let calls = 0;
  const result = await repairDesignMappings({ ...common(), stage: "generate_design_models", diagramKind: "component", targetId: "component",
    models: [first, sibling], upstreamModels: [upstream], bindings: accepted,
    llmTransport: { async *streamChatCompletion(input) {
      calls++;
      const missing = JSON.parse(String(input.messages.at(-1)!.content).match(/缺失元素清单：(.*)/)![1]!);
      assert.ok(missing.every((ref: any) => ref.modelId === "sibling"));
      yield JSON.stringify({ designModelTraceability: current.filter(entry => entry.source.modelId === "sibling") });
    } } });
  assert.equal(calls, 1);
  assert.deepEqual(result.slice(0, accepted.length), accepted);
  assert.equal(result.length, current.length);
});

test("the remaining shared budget bounds missing mappings and transport errors propagate immediately", async () => {
  for (const transportFailure of [false, true]) {
    let calls = 0;
    await assert.rejects(repairRequirementMappings({ ...common(), models: [model], rules: [rule], bindings: [], repairsUsed: 4,
      llmTransport: { async *streamChatCompletion() { calls++; if (transportFailure) throw new Error("provider offline"); yield '{"requirementModelTraceability":[]}'; } } }), transportFailure ? /provider offline/ : /共享 5 次/);
    assert.equal(calls, 1);
  }
});
