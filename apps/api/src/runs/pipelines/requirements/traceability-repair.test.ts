// Verifies structural and provenance errors continue one model conversation and shared repair budget.
import assert from "node:assert/strict";
import test from "node:test";
import { useCaseParticipationGaps, type DiagramModelSpec, type RequirementModelTraceabilityEntry } from "@uml-platform/contracts";
import type { LlmTransport } from "../../../adapters/llm/llm-transport.js";
import { strictTestModelCapability } from "../../../../tests/fixtures/providers/model-capability.js";
import { readDiagramReviewCounters } from "../../records/diagram-review-record.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import { generateModelsWithRepair, runStagePipeline } from "../requirements-pipeline.js";
import { createRunLlmChunkHandlers } from "../shared/llm-chunk-events.js";
import { collectModelRefs } from "@uml-platform/contracts";
import { assertGeneratedModelCandidate } from "../../../normalizers/modeling/model-candidate-validation.js";


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

test("generation preserves a fully mapped use case without adding participation associations", async () => {
  const { modelFixture } = await import("@uml-platform/contracts/testing");
  const before = modelFixture("requirements", "usecase");
  if (before.diagramKind !== "usecase") throw new Error("fixture");
  before.useCases[0]!.primaryActorId = "actor"; before.relationships = [];
  const bindings = collectModelRefs([before], true).refs.map(target => ({ ruleId: rule.id, target }));
  const run: RunRecord = { snapshot: createEmptySnapshot("post-generation", rule.text, ["usecase"], [rule]), events: [], listeners: new Set(), terminal: false };
  let calls = 0, renders = 0;
  await runStagePipeline(run, settings, { async *streamChatCompletion() {
    calls++; yield JSON.stringify({ models: [before], requirementModelTraceability: bindings });
  } }, async artifact => {
    renders++; return { svg: "<svg/>", renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 1 } };
  });
  assert.equal(calls, 1); assert.equal(renders, 1); assert.equal(run.snapshot.status, "completed");
  assert.deepEqual(run.snapshot.models[0]!.relationships, []);
  assert.equal(run.snapshot.requirementModelTraceability.length, bindings.length);
});

test("complete coverage accepts a function graph without semantic parent inference", async () => {
  const broken = {
    ...model,
    nodes: ["root", "models", "agents", "register"].map(id => ({ id, name: id, sourceRequirementIds: [rule.id] })),
    relationships: [
      { id: "a", type: "decomposition" as const, sourceId: "root", targetId: "models" },
      { id: "b", type: "decomposition" as const, sourceId: "root", targetId: "agents" },
      { id: "c", type: "decomposition" as const, sourceId: "models", targetId: "register" },
      { id: "d", type: "decomposition" as const, sourceId: "agents", targetId: "register" },
    ],
  };
  const candidate = { models: [broken], requirementModelTraceability: collectModelRefs([broken], true).refs.map(target => ({ ruleId: rule.id, target })) };
  const before = structuredClone(candidate);
  assert.doesNotThrow(() => assertGeneratedModelCandidate(JSON.stringify(candidate), { stage: "requirements", kinds: ["function"], rules: [rule] }));
  assert.deepEqual(candidate, before);
});

test("partial declarations retain generation history and request a complete corrected result", async () => {
  const run = record(); let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    calls++;
    if (calls === 1) { yield JSON.stringify({ models: [model], requirementModelTraceability: [refs[0]] }); return; }
    const prompt = String(input.messages.at(-1)?.content ?? "");
    assert.deepEqual(input.messages.map(message => message.role), ["system", "user", "assistant", "user"]);
    assert.equal(input.messages[2]!.content, JSON.stringify({ models: [model], requirementModelTraceability: [refs[0]] }));
    assert.equal(JSON.parse(prompt).errors.filter((issue: any) => issue.code === "mapping-coverage-missing").length, 2);
    assert.match(String(input.messages[0]!.content), /完整候选/);
    assert.doesNotMatch(prompt, /legalSources|candidates|repairHint/);
    yield JSON.stringify({ models: [model], requirementModelTraceability: refs });
  } };
  const result = await generateModelsWithRepair(run, settings, transport, [rule], ["function"]);
  assert.equal(calls, 2);
  assert.deepEqual(result.requirementModelTraceability.map(entry => entry.target.elementId), ["config", "password", "contains"]);
  assert.deepEqual(result.models, [model]);
  assert.deepEqual(result.requirementModelTraceability[0], refs[0]);
  assert.equal(readDiagramReviewCounters(run, "config", "function").repairAttempts, 1);
});

test("persistent empty sources fail after five repairs without publishing references", async () => {
  const run = record(); let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() {
    calls += 1;
    yield JSON.stringify({ models: [model], requirementModelTraceability: [] });
  } };
  await assert.rejects(generateModelsWithRepair(run, settings, transport, [rule], ["function"]), /共享 5 次/);
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
    yield JSON.stringify({ models: [model], requirementModelTraceability: [] });
  } };
  await assert.rejects(generateModelsWithRepair(run, settings, transport, [rule], ["function"]), /共享 5 次/);
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
    const generation = generateModelsWithRepair(run, settings, transport, [rule], ["function"]);
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
      : { models: [model, { ...model, modelId: "config-other" }], requirementModelTraceability: [] });
  } };
  await assert.rejects(generateModelsWithRepair(run, settings, transport, [rule], ["function"]), /共享 5 次/);
  assert.equal(calls, 2);
  assert.equal(readDiagramReviewCounters(run, "function", "function").repairAttempts, 5);
});


test("structural corrections and missing sources retain the complete prior conversation", async () => {
  const { modelFixture } = await import("@uml-platform/contracts/testing");
  const { collectModelRefs } = await import("@uml-platform/contracts");
  const prototype = modelFixture("requirements", "prototype") as any;
  const malformed = structuredClone(prototype); malformed.relationships[0] = "expected object, received string";
  const declared = collectModelRefs([prototype], true).refs.map(target => ({ ruleId: rule.id, target }));
  const run = record(); const prompts: string[] = [];
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const prompt = String(input.messages.at(-1)?.content ?? ""); prompts.push(prompt);
    if (prompts.length === 1) { yield JSON.stringify({ models: [malformed] }); return; }
    if (prompts.length === 2) {
      assert.equal(input.runContext?.round, 1);
      assert.match(prompt, /models\.0\.relationships\.0/);
      yield JSON.stringify({ models: [prototype] }); return;
    }
    assert.equal(input.runContext?.round, 2);
    assert.deepEqual(input.messages.map(message => message.role), ["system", "user", "assistant", "user", "assistant", "user"]);
    const diagnostics = JSON.parse(prompt).errors;
    assert.deepEqual(diagnostics.map((issue: any) => issue.path), ["requirementModelTraceability"]);
    assert.match(diagnostics[0].reason, /requirementModelTraceability/);
    assert.doesNotMatch(prompt, /legalRuleSources|candidates|repairHint/);
    assert.ok(String(input.messages[1]!.content).includes(rule.text));
    yield JSON.stringify({ models: [prototype], requirementModelTraceability: declared });
  } };
  const result = await generateModelsWithRepair(run, settings, transport, [rule], ["prototype"]);
  assert.equal(prompts.length, 3);
  assert.deepEqual(result.models, [prototype]);
  assert.equal(result.requirementModelTraceability.length, declared.length);
  assert.equal(readDiagramReviewCounters(run, "prototype", "prototype").repairAttempts, 2);
});

test("requirement repair preserves mistyped targets and identifies absent and inapplicable rules", async () => {
  const run = record();
  const wrongType = { ...rule, id: "data-only", type: "data" as const, text: "持久化数据约束" };
  let calls = 0;
  const result = await generateModelsWithRepair(run, settings, { async *streamChatCompletion(input) {
    calls++;
    if (calls > 1) {
      const feedback = String(input.messages.at(-1)?.content ?? "");
      const [issue] = JSON.parse(feedback).errors;
      if (calls === 2) {
        assert.equal(issue.path, "requirementModelTraceability.0.target.diagramKind");
        assert.equal(issue.code, "mapping-diagram-kind-mismatch");
        assert.match(issue.reason, /实际类型为 function/);
      } else {
        assert.equal(issue.path, "requirementModelTraceability.0.ruleId");
        assert.equal(issue.code, "mapping-rule-missing");
        assert.match(issue.reason, /不存在/);
      }
      assert.doesNotMatch(feedback, /legalSources|candidates|repairHint/);
      assert.equal(input.messages.filter(message => message.role === "assistant").length, calls - 1);
    }
    yield JSON.stringify({ models: [model], requirementModelTraceability: refs.map((binding, index) => index !== 0 || calls === 4 ? binding
      : calls === 1 ? { ...binding, target: { ...binding.target, diagramKind: "prototype" } }
      : { ...binding, ruleId: calls === 2 ? "invented-rule" : wrongType.id }) });
  } }, [rule, wrongType], ["function"]);
  assert.equal(calls, 3);
  assert.equal(result.requirementModelTraceability[0]!.ruleId, wrongType.id);
  assert.equal(readDiagramReviewCounters(run, "function", "function").repairAttempts, 2);
});
