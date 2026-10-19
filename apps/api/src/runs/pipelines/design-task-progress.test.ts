// Verifies design repair and traceability progress retain their exact model-task ownership.
import { strictTestModelCapability } from "../../test-fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import { deriveTableModel, designGenerationKinds, type DiagramModelSpec, type ProviderSettings } from "@uml-platform/contracts";
import { modelFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import type { LlmTransport } from "../../llm.js";
import type { RunRecord } from "../records/run-record-store.js";
import { createEmptyDesignSnapshot, createEmptySnapshot } from "../records/snapshots.js";
import { collectModelRefs } from "../../normalizers/traceability/traceability-normalizer.js";
import { generateDesignModelsWithRepair } from "./design-pipeline.js";

const provider: ProviderSettings = { modelCapability: strictTestModelCapability("test"), apiBaseUrl: "https://provider.test", apiKey: "test", model: "test" };
const requirementModels = ["usecase", "class", "prototype", "deployment"].map(kind => modelFixture("requirements", kind) as DiagramModelSpec);
const baseline = createEmptySnapshot("source", "顾客可以下单。", ["usecase"], [
  { id: "R1", type: "functional" as const, text: "顾客可以下单。",  },
], { models: requirementModels }).requirementBaseline!;
function record(): RunRecord {
  return { snapshot: createEmptyDesignSnapshot("design-progress", {
    selectedDiagrams: designGenerationKinds, requirementBaseline: baseline, requirementModels, requirementModelTraceability: [],
  }), events: [], listeners: new Set(), terminal: false };
}

test("complete JSON values with missing root punctuation are repaired locally without another model call", async () => {
  const run = record();
  const model = modelFixture("design", "class");
  const valid = JSON.stringify({ models: [model], designModelTraceability: collectModelRefs([model]).refs.map(source => ({ source, targets: [collectModelRefs(requirementModels).refs[0]] })) });
  const prompts: string[] = [];
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    prompts.push(String(input.messages.at(-1)!.content));
    if (prompts.length === 1) yield valid.slice(0, -1);
    else if (prompts.length === 2) yield JSON.stringify({ models: [{ ...model, diagramKind: "unsupported" }], designModelTraceability: [] });
    else yield valid;
  } };
  const source = "需求阶段来源模型：\n" + "UPSTREAM_FACT".repeat(1000);
  const result = await generateDesignModelsWithRepair(run, provider, transport, baseline, requirementModels, ["class"], source, "generate_design_models");
  assert.equal(prompts.length, 1);
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
      yield JSON.stringify({ models: [model], designModelTraceability: collectModelRefs([model]).refs.map(source => ({ source, targets: [collectModelRefs(requirementModels).refs[0]] })) });
    }
  } };
  await Promise.all(tasks.map(task => generateDesignModelsWithRepair(run, provider, transport, baseline, requirementModels,
    [task.kind], "生成模型", task.kind === "sequence" ? "generate_design_sequence" : "generate_design_models",
    { subtaskId: task.id, subtaskLabel: task.label })));
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
  await assert.rejects(generateDesignModelsWithRepair(run, provider, transport, baseline, [], ["sequence"], "生成模型",
    "generate_design_sequence", { subtaskId: "sequence:alarm", subtaskLabel: "用例实现设计：处理报警", modelRepairAttempts: 0 }), /designModelTraceability.*共享 5 次/);
  assert.equal(calls, 1, "repairAttempts=0 also forbids opening a separate source repair loop");
});
