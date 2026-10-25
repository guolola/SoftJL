// Verifies design repair and traceability progress retain their exact model-task ownership.
import { strictTestModelCapability } from "../../../tests/fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import { deriveTableModel, designGenerationKinds, designRequirementSources, designDependencies, type DesignDiagramKind, type DiagramModelSpec, type ProviderSettings } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import type { LlmTransport } from "../../adapters/llm/llm-transport.js";
import type { RunRecord } from "../records/run-record-store.js";
import { createEmptyDesignSnapshot, createEmptySnapshot } from "../records/snapshots.js";
import { collectModelRefs } from "@uml-platform/contracts";
import { generateDesignModelsWithRepair } from "./design-pipeline.js";


const provider: ProviderSettings = { modelCapability: strictTestModelCapability("test"), apiBaseUrl: "https://provider.test", apiKey: "test", model: "test" };
const requirementModels = ["usecase", "class", "prototype", "deployment"].map(kind => modelFixture("requirements", kind) as DiagramModelSpec);
function boundSources(kind: DesignDiagramKind) {
  const requirements = (designRequirementSources[kind] ?? []).map(source => modelFixture("requirements", source) as DiagramModelSpec);
  const designs = (designDependencies[kind] ?? []).map(source => modelFixture("design", source) as import("@uml-platform/contracts").DesignDiagramModelSpec);
  const primary = (kind === "sequence" ? requirements.find(model => model.diagramKind === "analysis") : requirements[0]) ?? designs[0]!;
  return { requirements, designs, primary };
}
const baseline = createEmptySnapshot("source", "顾客可以下单。", ["usecase"], [
  { id: "R1", type: "functional" as const, text: "顾客可以下单。",  },
], { models: requirementModels }).requirementBaseline!;
function record(): RunRecord {
  return { snapshot: createEmptyDesignSnapshot("design-progress", {
    selectedDiagrams: designGenerationKinds, requirementBaseline: baseline, requirementModels, requirementModelTraceability: [],
  }), events: [], listeners: new Set(), terminal: false };
}

test("malformed native arguments require complete replacement before validation can succeed", async () => {
  const run = record();
  const model = modelFixture("design", "class");
  const valid = JSON.stringify({ models: [model], designModelTraceability: collectModelRefs([model], true).refs.map(source => ({ source, targets: [collectModelRefs(requirementModels).refs[0]] })) });
  const prompts: string[] = [];
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    prompts.push(String(input.messages.at(-1)?.content ?? ""));
    if (prompts.length === 1) yield valid.slice(0, -1);
    else if (prompts.length === 2) yield JSON.stringify({ models: [{ ...model, diagramKind: "unsupported" }], designModelTraceability: [] });
    else yield valid;
  } };
  const result = await generateDesignModelsWithRepair(run, provider, transport, requirementModels, ["class"], "generate_design_models");
  assert.equal(prompts.length, 3);
  assert.equal(result.models[0].diagramKind, "class");
});

test("parallel design JSON repairs and mapping recovery identify each requested model and use case", async () => {
  const run = record();
  const tasks = [
    ...designGenerationKinds.filter(kind => kind !== "sequence").map(kind => ({ kind, id: kind, label: `${kind}设计任务` })),
    { kind: "sequence" as const, id: "sequence:alarm", label: "用例实现设计：处理报警" },
    { kind: "sequence" as const, id: "sequence:configure", label: "用例实现设计：配置系统" },
  ];
  const counts = new Map<string, number>();
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const task = tasks.find(task => task.id === input.runContext?.subtaskId)!;
    assert.ok(task);
    assert.equal(input.runContext?.diagramKind, task.kind);
    const attempt = (counts.get(task.id) ?? 0) + 1;
    counts.set(task.id, attempt);
    if (attempt === 1) yield "invalid model JSON";
    else {
      const raw = { ...modelFixture("design", task.kind), modelId: `provider-${task.id}` };
      const model = raw.diagramKind === "table" ? deriveTableModel(raw) : raw;
      yield JSON.stringify({ models: [model], designModelTraceability: collectModelRefs([model], true).refs.map(source => ({ source, targets: [collectModelRefs([boundSources(task.kind).primary]).refs[0]] })) });
    }
  } };
  await Promise.all(tasks.map(task => generateDesignModelsWithRepair(run, provider, transport, boundSources(task.kind).requirements,
    [task.kind], task.kind === "sequence" ? "generate_design_sequence" : "generate_design_models",
    { subtaskId: task.id, subtaskLabel: task.label, upstreamDesignModels: boundSources(task.kind).designs })));
  for (const task of tasks) {
    const notices = run.events.filter(event => event.type === "stage_progress" && event.subtaskId === task.id);
    assert.ok(notices.some(event => event.message?.includes("JSON 结构不合法")), task.id);
    assert.equal(counts.get(task.id), 2, "one generation and one structure repair; no independent coverage call");
    for (const event of notices) {
      assert.equal(event.modelId, task.id);
      assert.equal(event.diagramKind, task.kind);
      assert.equal(event.subtaskLabel, task.label);
    }
  }
  assert.ok(run.events.filter(event => event.type === "stage_progress").every(event => event.subtaskId));
});

test("missing sources never open a second repair budget", async () => {
  const run = record(); let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    calls++;
    assert.equal(input.runContext?.subtaskId, "sequence:alarm");
    yield JSON.stringify({ models: [{ ...modelFixture("design", "sequence"), modelId: "provider-sequence" }], designModelTraceability: [] });
  } };
  await assert.rejects(generateDesignModelsWithRepair(run, provider, transport, [], ["sequence"], "generate_design_sequence", { subtaskId: "sequence:alarm", subtaskLabel: "用例实现设计：处理报警", modelRepairAttempts: 0 }), /缺少绑定的用例模型/);
  assert.equal(calls, 0, "A missing binding must fail before any provider request");
});

test("every design kind receives only its bound upstream identities in its repair conversation", async () => {
  await Promise.all(designGenerationKinds.map(async kind => {
    const run = record();
    const binding = boundSources(kind);
    const upstream = binding.primary;
    const rawModel = modelFixture("design", kind);
    const model = rawModel.diagramKind === "table" ? deriveTableModel(rawModel) : rawModel;
    const target = collectModelRefs([upstream], true).refs[0]!;
    const bindings = collectModelRefs([model], true).refs.map(source => ({ source, targets: [target] }));
    const broken = JSON.stringify({ models: [model], designModelTraceability: bindings.map(binding => ({ ...binding, targets: [{ ...target, diagramKind: "sequence" }] })) });
    const corrected = JSON.stringify({ models: [model], designModelTraceability: bindings });
    let calls = 0;
    const result = await generateDesignModelsWithRepair(run, provider, { async *streamChatCompletion(input) {
      calls++;
      if (calls === 1) { yield broken; return; }
      assert.equal(calls, 2);
      assert.ok(String(input.messages[1]!.content).includes(upstream.modelId!));
      assert.equal(input.messages.at(-2)!.content, broken);
      const feedback = String(input.messages.at(-1)?.content ?? "");
      const [issue] = JSON.parse(feedback).errors;
      assert.equal(issue.code, "mapping-diagram-kind-mismatch");
      assert.equal(issue.path, "designModelTraceability.0.targets.0.diagramKind");
      assert.ok(issue.reason.includes(`实际类型为 ${upstream.diagramKind}`));
      assert.doesNotMatch(feedback, /legalSources|candidates|repairHint/);
      yield corrected;
    } }, binding.requirements, [kind], kind === "sequence" ? "generate_design_sequence" : "generate_design_models", { upstreamDesignModels: binding.designs });
    assert.equal(calls, 2, kind);
    assert.deepEqual(result.models, [model]);
    assert.ok(result.designModelTraceability.every(binding => binding.targets[0]?.diagramKind === upstream.diagramKind));
  }));
});

test("mistyped design source declarations are diagnosed before coverage instead of discarded", async () => {
  const model = modelFixture("design", "component");
  const upstream = modelFixture("design", "class") as import("@uml-platform/contracts").DesignDiagramModelSpec;
  const bindings = collectModelRefs([model], true).refs.map(source => ({ source, targets: [collectModelRefs([upstream], true).refs[0]!] }));
  let calls = 0;
  const result = await generateDesignModelsWithRepair(record(), provider, { async *streamChatCompletion(input) {
    calls++;
    if (calls === 2) {
      const [issue] = JSON.parse(String(input.messages.at(-1)?.content ?? "")).errors;
      assert.equal(issue.path, "designModelTraceability.0.source.diagramKind");
      assert.equal(issue.code, "mapping-diagram-kind-mismatch");
      assert.match(issue.reason, /实际类型为 component/);
      assert.equal(issue.expected, undefined);
    }
    yield JSON.stringify({ models: [model], designModelTraceability: calls === 1
      ? bindings.map((binding, index) => index ? binding : { ...binding, source: { ...binding.source, diagramKind: "sequence" } }) : bindings });
  } }, [], ["component"], "generate_design_models", { upstreamDesignModels: [upstream] });
  assert.equal(calls, 2);
  assert.deepEqual(result.models, [model]);
});

test("schema repairs report empty targets without repeating upstream design sources", async () => {
  const model = modelFixture("design", "component");
  const upstream = modelFixture("design", "class");
  const bindings = collectModelRefs([model], true).refs.map(source => ({ source, targets: [collectModelRefs([upstream], true).refs[0]!] }));
  let calls = 0;
  const result = await generateDesignModelsWithRepair(record(), provider, { async *streamChatCompletion(input) {
    calls++;
    if (calls === 2) {
      const [issue] = JSON.parse(String(input.messages.at(-1)?.content ?? "")).errors;
      assert.equal(issue.path, "designModelTraceability.0.targets");
      assert.match(issue.reason, /at least 1 element/);
      assert.equal(issue.expected, undefined);
    }
    yield JSON.stringify({ models: [model], designModelTraceability: calls === 1
      ? bindings.map((binding, index) => index ? binding : { ...binding, targets: [] }) : bindings });
  } }, [], ["component"], "generate_design_models", { upstreamDesignModels: [upstream] });
  assert.equal(calls, 2);
  assert.deepEqual(result.models, [model]);
});
