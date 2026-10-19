// Verifies mapping omissions use bounded additions while preserving the generated model and accepted sources.
import assert from "node:assert/strict";
import test from "node:test";
import { type DiagramModelSpec, type RequirementModelTraceabilityEntry } from "@uml-platform/contracts";
import type { LlmTransport } from "../../../llm.js";
import { strictTestModelCapability } from "../../../test-fixtures/providers/model-capability.js";
import { readDiagramReviewCounters } from "../../records/diagram-review-record.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import { generateModelsWithRepair } from "../requirements-pipeline.js";
import { createRunLlmChunkHandlers } from "../shared/llm-chunk-events.js";

const rule = { id: "r1", type: "functional" as const, text: "用户可以配置系统并设置密码。" };
const model: DiagramModelSpec = {
  diagramKind: "function", modelId: "config", title: "系统配置", summary: "设置密码", notes: [],
  nodes: [
    { id: "config", name: "系统配置", sourceRequirementIds: ["r1"] },
    { id: "password", name: "设置密码", sourceRequirementIds: ["r1"] },
  ],
  relationships: [{ id: "contains", type: "decomposition", sourceId: "config", targetId: "password" }],
};
const refs: RequirementModelTraceabilityEntry[] = ["config", "password", "contains"].map(elementId => ({
  ruleId: "r1", target: { diagramKind: "function", modelId: "config", elementId,
    elementKind: elementId === "contains" ? "relationship" : "function", label: elementId },
}));
const settings = { apiBaseUrl: "https://llm.test", apiKey: "test-key", model: "test-model", modelCapability: strictTestModelCapability("test-model") };
function record(): RunRecord {
  return { snapshot: createEmptySnapshot("coverage-repair", rule.text, ["function"], [rule]), events: [], listeners: new Set(), terminal: false };
}

test("partial declarations request only missing mappings and preserve accepted sources", async () => {
  const run = record(); let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    calls++;
    if (calls === 1) { yield JSON.stringify({ models: [model], requirementModelTraceability: [refs[0]] }); return; }
    const prompt = String(input.messages.at(-1)!.content);
    const missing = JSON.parse(prompt.match(/缺失元素清单：(.*)/)![1]!);
    assert.deepEqual(missing.map((ref: any) => ref.elementId), ["password", "contains"]);
    assert.match(prompt, /禁止返回 models/);
    yield JSON.stringify({ requirementModelTraceability: refs.slice(1) });
  } };
  const result = await generateModelsWithRepair(run, settings, transport, [rule], run.snapshot.requirementBaseline!, ["function"]);
  assert.equal(calls, 2);
  assert.deepEqual(result.requirementModelTraceability.map(entry => entry.target.elementId), ["config", "password", "contains"]);
  assert.deepEqual(result.models, [model]);
  assert.deepEqual(result.requirementModelTraceability[0], { ...refs[0], mappingSource: "llm" });
  assert.equal(readDiagramReviewCounters(run, "config", "function").repairAttempts, 1);
});

test("persistent empty sources fail after five repairs without publishing references", async () => {
  const run = record(); let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() {
    calls += 1;
    yield JSON.stringify(calls === 1 ? { models: [model], requirementModelTraceability: [] } : { requirementModelTraceability: [] });
  } };
  await assert.rejects(generateModelsWithRepair(run, settings, transport, [rule], run.snapshot.requirementBaseline!, ["function"]), /共享 5 次/);
  assert.equal(calls, 6); // Initial generation plus the configured five repairs.
  assert.equal(readDiagramReviewCounters(run, "config", "function").repairAttempts, 5);
  assert.deepEqual(run.snapshot.requirementModelTraceability, []);
});

test("coverage repairs share the remaining budget with earlier structural repairs", async () => {
  const run = record(); let calls = 0;
  for (let round = 1; round <= 2; round += 1) {
    const prior = createRunLlmChunkHandlers({ record: run, stage: "generate_models", subtaskId: "function", operation: "model_repair", round });
    prior.onStart?.(); prior.onComplete?.();
  }
  const transport: LlmTransport = { async *streamChatCompletion() {
    calls += 1;
    yield JSON.stringify(calls === 1 ? { models: [model], requirementModelTraceability: [] } : { requirementModelTraceability: [] });
  } };
  await assert.rejects(generateModelsWithRepair(run, settings, transport, [rule], run.snapshot.requirementBaseline!, ["function"]), /共享 5 次/);
  assert.equal(calls, 4);
  assert.equal(readDiagramReviewCounters(run, "config", "function").repairAttempts, 5);
  assert.deepEqual(run.snapshot.requirementModelTraceability, []);
  assert.deepEqual(run.events.filter(event => event.type === "run_activity" && event.phase === "started" && event.operation === "model_repair").map(event => event.round), [1, 2, 3, 4, 5]);
});

test("complete coverage skips repair and malformed repair output cannot reset the budget", async () => {
  for (const malformed of [false, true]) {
    const run = record(); let calls = 0;
    const transport: LlmTransport = { async *streamChatCompletion() {
      calls += 1;
      yield calls === 1 ? JSON.stringify({ models: [model], requirementModelTraceability: malformed ? [] : refs }) : "invalid JSON";
    } };
    const generation = generateModelsWithRepair(run, settings, transport, [rule], run.snapshot.requirementBaseline!, ["function"]);
    if (malformed) {
      await assert.rejects(generation, /共享 5 次/);
      assert.equal(calls, 6);
    } else {
      const result = await generation;
      assert.equal(calls, 1);
      assert.equal(result.requirementModelTraceability.length, 3);
    }
  }
});

test("multiple models of one kind retain the same structural repair budget", async () => {
  const run = record(); let calls = 0;
  for (let round = 1; round <= 4; round += 1) {
    const prior = createRunLlmChunkHandlers({ record: run, stage: "generate_models", subtaskId: "function", operation: "model_repair", round });
    prior.onStart?.(); prior.onComplete?.();
  }
  const transport: LlmTransport = { async *streamChatCompletion() {
    calls += 1;
    yield JSON.stringify(calls === 1
      ? { models: [model, { ...model, modelId: "config-other" }], requirementModelTraceability: [] }
      : { requirementModelTraceability: [] });
  } };
  await assert.rejects(generateModelsWithRepair(run, settings, transport, [rule], run.snapshot.requirementBaseline!, ["function"]), /共享 5 次/);
  assert.equal(calls, 2);
  assert.equal(readDiagramReviewCounters(run, "function", "function").repairAttempts, 5);
});


test("a repaired relationship followed by missing sources targets the new field rather than the old relationship", async () => {
  const { modelFixture } = await import("../../../../../../packages/contracts/src/testing/model-fixtures.js");
  const { collectModelRefs } = await import("../../../normalizers/traceability/traceability-normalizer.js");
  const prototype = modelFixture("requirements", "prototype") as any;
  const malformed = structuredClone(prototype); malformed.relationships[0] = "expected object, received string";
  const declared = collectModelRefs([prototype]).refs.map(target => ({ ruleId: rule.id, target }));
  const run = record(); const prompts: string[] = [];
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const prompt = String(input.messages.at(-1)?.content); prompts.push(prompt);
    if (prompts.length === 1) { yield JSON.stringify({ models: [malformed] }); return; }
    const metadata = JSON.parse(prompt.match(/修复上下文：(.*)/)![1]!);
    if (prompts.length === 2) {
      assert.deepEqual(metadata.paths, ["models.0.relationships.0"]);
      yield JSON.stringify({ ...metadata, changes: [{ path: "models.0.relationships.0", value: prototype.relationships[0] }] }); return;
    }
    assert.deepEqual(metadata.paths, ["requirementModelTraceability"]);
    const diagnostics = JSON.parse(prompt.match(/完整校验诊断：(.*)/)![1]!);
    assert.deepEqual(diagnostics.map((issue: any) => issue.path), ["requirementModelTraceability"]);
    assert.match(prompt, /必要来源事实/);
    assert.ok(prompt.includes(rule.text));
    assert.match(prompt, /expectedSchema.*array/);
    yield JSON.stringify({ ...metadata, changes: [{ path: "requirementModelTraceability", value: declared }] });
  } };
  const result = await generateModelsWithRepair(run, settings, transport, [rule], run.snapshot.requirementBaseline!, ["prototype"]);
  assert.equal(prompts.length, 3);
  assert.deepEqual(result.models, [prototype]);
  assert.equal(result.requirementModelTraceability.length, declared.length);
  assert.equal(readDiagramReviewCounters(run, "prototype", "prototype").repairAttempts, 2);
});
