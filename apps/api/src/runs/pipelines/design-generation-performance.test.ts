// Measures the actual design pipeline with equally slow generation and pre-render structural checks.
import { strictTestModelCapability } from "../../../tests/fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture } from "@uml-platform/contracts/testing";
import { deriveTableModel, designDependencies, designRequirementSources, designGenerationKinds, type DesignDiagramKind, type DesignDiagramModelSpec, type DiagramModelSpec, type DesignRunSnapshot } from "@uml-platform/contracts";
import { createEmptyDesignSnapshot, createEmptySnapshot } from "../records/snapshots.js";
import type { RunRecord } from "../records/run-record-store.js";
import { runDesignStagePipeline } from "./design-pipeline.js";
import type { LlmTransport } from "../../adapters/llm/llm-transport.js";
import { collectModelRefs } from "@uml-platform/contracts";
import { createQueuedRunFromSource } from "../records/run-actions.js";


async function runBatch(failClass = false, cancelDuringClass = false, selectedDiagrams = designGenerationKinds, sourceKinds = ["usecase", "function", "class", "prototype", "deployment"], options: { failSequence?: boolean; failSequenceRender?: boolean; sequenceDelayMs?: number; scopedRetry?: boolean } = {}) {
  const requirementModels = sourceKinds.map((kind) => modelFixture("requirements", kind) as DiagramModelSpec);
  const useCase = requirementModels.find(model => model.diagramKind === "usecase");
  if (options.scopedRetry && useCase?.diagramKind === "usecase") {
    useCase.useCases.push({ ...useCase.useCases[0]!, id: "second", name: "第二个用例" });
    useCase.relationships.push({ ...useCase.relationships[0]!, id: "second-association", targetId: "second" });
  }
  const baseline = createEmptySnapshot("source", "顾客可以下单。", ["usecase"], [{ id: "R1", type: "functional" as const, text: "顾客可以下单。",  }], { models: requirementModels }).requirementBaseline!;
  const preservedSequence = { ...modelFixture("design", "sequence"), modelId: "sequence:second", sourceUseCaseId: "second", sourceUseCaseName: "第二个用例" } as DesignDiagramModelSpec;
  const snapshot = createEmptyDesignSnapshot("performance", { selectedDiagrams, requirementBaseline: baseline, requirementModels, requirementModelTraceability: [],
    sequenceTargetUseCaseIds: options.scopedRetry && useCase?.diagramKind === "usecase" ? [useCase.useCases[0]!.id] : undefined,
    existingDesignModels: options.scopedRetry ? [preservedSequence] : [],
  });
  const starts = new Map<string, number>(), ready = new Map<string, number>(), operations = new Map<string, number>();
  const run: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
  run.listeners.add((event) => {
    if (event.type === "artifact_ready" && event.artifactKind === "model" && event.diagramKind) ready.set(event.diagramKind, performance.now());
  });
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const content = String(input.messages.at(-1)?.content ?? "");
    assert.equal(typeof content, "string", "model generation must not send post-render images");
    const review = typeof content === "string" && content.startsWith("核对 ");
    const kind = input.runContext?.subtaskId?.startsWith("sequence:") ? "sequence" : input.runContext?.subtaskId ?? "";
    if (!review) starts.set(kind, performance.now());
    if (!review && kind === "class" && cancelDuringClass) snapshot.status = "cancelled";
    operations.set(review ? "review" : kind, (operations.get(review ? "review" : kind) ?? 0) + 1);
    await new Promise((resolve) => setTimeout(resolve, !review && kind === "sequence" ? options.sequenceDelayMs ?? 150 : 150));
    if (review) yield '{"passed":true,"issues":[],"findings":[]}';
    else {
      if (failClass && kind === "class") throw new Error("class provider failed");
      if (options.failSequence && kind === "sequence") throw new Error("sequence provider failed");
      const raw = modelFixture("design", kind) as DesignDiagramModelSpec;
      const model = raw.diagramKind === "table" ? deriveTableModel(raw) : raw;
      const sourceKindsForModel = designRequirementSources[kind] ?? [];
      const availableSources = [
        ...requirementModels.filter(model => sourceKindsForModel.includes(model.diagramKind)),
        ...snapshot.models.filter(model => (designDependencies[kind] ?? []).includes(model.diagramKind)),
      ];
      yield JSON.stringify({ models: [model], designModelTraceability: collectModelRefs([model], true).refs.map(source => ({ source, targets: [collectModelRefs(availableSources).refs[0]] })) });
    }
  } };
  const escaped = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const startedAt = performance.now();
  try {
    await runDesignStagePipeline(run, { modelCapability: strictTestModelCapability("test"), apiBaseUrl: "https://provider.test", apiKey: "test", model: "test" }, transport, async (artifact) => {
      if (options.failSequenceRender && artifact.diagramKind === "sequence") throw new Error("sequence render failed");
      const aliases = new Map(artifact.renderMapping?.elements.map((node) => [node.elementId, node.alias]));
      const nodes = artifact.renderMapping?.elements.map((node) => `<g id="elem_${node.alias}"><text>${escaped(node.label ?? "")}</text></g>`).join("");
      const links = artifact.renderMapping?.relationships.filter((edge) => edge.statement && !edge.statement.trimStart().startsWith("'")).map((edge) => `<g class="link" data-entity-1="${aliases.get(edge.sourceId)}" data-entity-2="${aliases.get(edge.targetId)}"><text>${escaped(edge.label ?? "")}</text></g>`).join("");
      return { svg: `<svg>${nodes}${links}</svg>`, renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 0 } };
    });
  } catch (error) { if (!failClass && !cancelDuringClass && !options.failSequence && !options.failSequenceRender) throw error; }
  return { snapshot: snapshot as DesignRunSnapshot, starts, ready, operations, events: run.events, elapsed: performance.now() - startedAt };
}

test("a scoped sequence retry never calls generation for a successful sibling", async () => {
  const result = await runBatch(false, false, ["sequence"], undefined, { scopedRetry: true });
  assert.equal(result.snapshot.status, "completed");
  assert.equal(result.operations.get("sequence"), 1);
  assert.ok(result.snapshot.models.some(model => model.modelId === "sequence:second"));
  assert.ok(!result.events.some(event => event.type === "run_activity" && event.subtaskId === "sequence:second"));
});

test("sequence render failures produce instance retry targets without a kind-wide error", async () => {
  const result = await runBatch(false, false, ["sequence"], undefined, { failSequenceRender: true });
  const useCase = result.snapshot.requirementModels.find(model => model.diagramKind === "usecase");
  assert.ok(useCase?.diagramKind === "usecase");
  const useCaseId = useCase.useCases[0]!.id;
  assert.deepEqual(Object.keys(result.snapshot.diagramErrors), [`sequence:${useCaseId}`]);
  const runs = new Map<string, RunRecord>();
  createQueuedRunFromSource({ runs, source: { snapshot: result.snapshot, events: [], listeners: new Set(), terminal: true }, action: "retry", sourceRunId: result.snapshot.runId, runId: "retry-render" });
  assert.deepEqual((runs.get("retry-render")!.snapshot as DesignRunSnapshot).sequenceTargetUseCaseIds, [useCaseId]);
});

for (const kind of ["class", "navigation", "table"] as const) test(`${kind} generation does not need sequence models`, async () => {
  const result = await runBatch(false, false, kind === "table" ? ["class", "table"] : [kind], kind === "navigation" ? ["prototype"] : ["usecase", "class"]);
  assert.equal(result.snapshot.status, "completed");
  assert.ok(result.snapshot.models.some(model => model.diagramKind === kind));
  assert.equal(result.operations.get("sequence"), undefined);
});

test("class generation still requires its use-case source alongside the domain model", async () => {
  await assert.rejects(runBatch(false, false, ["class"], ["class"]), /用例模型/);
});

test("design DAG reduces simulated batch time by at least 30% with local validation and prerequisite waits", async () => {
  const result = await runBatch();
  assert.equal(result.snapshot.status, "completed");
  for (const kind of designGenerationKinds) assert.ok(result.snapshot.models.some((model) => model.diagramKind === kind), kind);
  assert.equal(result.operations.get("review") ?? 0, 0, "valid models need no independent LLM reviewer");
  for (const review of Object.values(result.snapshot.visualReviews)) {
    assert.equal(review.attempts, 0); assert.equal(review.imageStatus, "skipped"); assert.equal(review.renderStatus, "passed");
  }
  for (const kind of ["architecture", "class", "navigation"] as DesignDiagramKind[]) assert.ok(result.starts.get(kind)! < result.ready.get("class")!);
  for (const kind of ["architecture", "class", "navigation"]) assert.ok(result.starts.get(kind)! < result.ready.get("sequence")!, `${kind} starts before sequences finish`);
  for (const kind of ["table", "component"]) assert.ok(result.starts.get(kind)! >= result.ready.get("class")!);
  assert.ok(result.starts.get("deployment")! >= result.ready.get("component")!);
  const serial = designGenerationKinds.reduce((sum, kind) => sum + result.ready.get(kind)! - result.starts.get(kind)!, 0);
  assert.ok(result.elapsed <= serial * 0.7, `parallel=${result.elapsed.toFixed(0)}ms, serial=${serial.toFixed(0)}ms`);
  console.log(JSON.stringify({ designSimulatedParallelMs: Math.round(result.elapsed), designSimulatedSerialMs: Math.round(serial), reductionPercent: Math.round((1 - result.elapsed / serial) * 100) }));
});

test("slow sequences do not block the structural dependency chain or close either stage early", async () => {
  const result = await runBatch(false, false, designGenerationKinds, undefined, { sequenceDelayMs: 1500 });
  assert.equal(result.snapshot.status, "completed");
  assert.ok(result.ready.get("deployment")! < result.ready.get("sequence")!);
  for (const stage of ["generate_design_sequence", "generate_design_models"] as const) {
    const finished = result.events.flatMap((event, index) => event.type === "stage_finished" && event.stage === stage ? [index] : []);
    assert.equal(finished.length, 1, `${stage} finishes once`);
    const lastModelReady = result.events.findLastIndex((event) => event.type === "artifact_ready" && event.stage === stage && event.artifactKind === "model");
    assert.ok(finished[0]! > lastModelReady, `${stage} finishes after its models`);
    const finishEvent = result.events[finished[0]!]!;
    assert.equal(finishEvent.type === "stage_finished" && finishEvent.status, "completed");
  }
});

test("failed sequences still allow every independent design branch to settle", async () => {
  const result = await runBatch(false, false, designGenerationKinds, undefined, { failSequence: true });
  assert.ok(!result.snapshot.models.some((model) => model.diagramKind === "sequence"));
  for (const kind of designGenerationKinds.filter((kind) => kind !== "sequence")) {
    assert.ok(result.ready.has(kind), `${kind} completes despite failed sequences`);
    assert.ok(result.snapshot.models.some((model) => model.diagramKind === kind), `${kind} remains in the snapshot`);
  }
  assert.ok(result.events.some((event) => event.type === "stage_finished" && event.stage === "generate_design_sequence" && event.status === "failed"));
  assert.ok(!result.events.some((event) => event.type === "completed"));
});

test("failed class blocks only table/component/deployment and preserves independent reviewed branches", async () => {
  const result = await runBatch(true);
  assert.ok(result.ready.has("architecture") && result.ready.has("navigation"));
  for (const kind of ["table", "component", "deployment"]) assert.ok(!result.starts.has(kind));
  assert.ok(result.snapshot.diagramErrors.class);
});

test("cancellation prevents all waiting dependent branches from starting", async () => {
  const result = await runBatch(false, true);
  const eventCount = result.events.length;
  const models = JSON.stringify(result.snapshot.models);
  await new Promise((resolve) => setTimeout(resolve, 200));
  for (const kind of ["table", "component", "deployment"]) assert.ok(!result.starts.has(kind));
  assert.equal(result.snapshot.status, "cancelled");
  assert.equal(result.events.length, eventCount, "no branch publishes after the pipeline returns");
  assert.equal(JSON.stringify(result.snapshot.models), models);
  for (const stage of ["generate_design_sequence", "generate_design_models"] as const) {
    assert.ok(result.events.some((event) => event.type === "stage_finished" && event.stage === stage && event.status === "cancelled"), stage);
  }
});
