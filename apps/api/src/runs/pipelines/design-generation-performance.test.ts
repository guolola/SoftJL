// Measures the actual design pipeline with equally slow generation and full structural/image checks.
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import { designGenerationKinds, type DesignDiagramKind, type DesignDiagramModelSpec, type DiagramModelSpec, type DesignRunSnapshot } from "@uml-platform/contracts";
import { createEmptyDesignSnapshot, createEmptySnapshot } from "../records/snapshots.js";
import type { RunRecord } from "../records/run-record-store.js";
import { runDesignStagePipeline } from "./design-pipeline.js";
import type { LlmTransport } from "../../llm.js";

async function runBatch(failClass = false, cancelDuringClass = false) {
  const requirementModels = ["usecase", "function", "class", "prototype", "deployment"].map((kind) => modelFixture("requirements", kind) as DiagramModelSpec);
  const baseline = createEmptySnapshot("source", "顾客可以下单。", ["usecase"], [{ id: "R1", category: "功能需求", text: "顾客可以下单。", relatedDiagrams: ["usecase"] }], { models: requirementModels }).requirementBaseline!;
  const snapshot = createEmptyDesignSnapshot("performance", { selectedDiagrams: designGenerationKinds, requirementBaseline: baseline, requirementModels, requirementModelTraceability: [] });
  const starts = new Map<string, number>(), ready = new Map<string, number>(), operations = new Map<string, number>();
  const run: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
  run.listeners.add((event) => {
    if (event.type === "artifact_ready" && event.artifactKind === "model" && event.diagramKind) ready.set(event.diagramKind, performance.now());
  });
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const content = input.messages.at(-1)!.content;
    const review = Array.isArray(content) || (typeof content === "string" && content.startsWith("核对 "));
    const kind = input.runContext?.subtaskId?.startsWith("sequence:") ? "sequence" : input.runContext?.subtaskId ?? "";
    if (!review) starts.set(kind, performance.now());
    if (!review && kind === "class" && cancelDuringClass) snapshot.status = "cancelled";
    operations.set(review ? "review" : kind, (operations.get(review ? "review" : kind) ?? 0) + 1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (review) yield '{"passed":true,"issues":[],"findings":[]}';
    else {
      if (failClass && kind === "class") throw new Error("class provider failed");
      const model = modelFixture("design", kind) as DesignDiagramModelSpec;
      yield JSON.stringify({ models: [model], designModelTraceability: [] });
    }
  } };
  const escaped = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const startedAt = performance.now();
  try {
    await runDesignStagePipeline(run, { apiBaseUrl: "https://provider.test", apiKey: "test", model: "test" }, transport, async (artifact) => {
      const aliases = new Map(artifact.renderMapping?.elements.map((node) => [node.elementId, node.alias]));
      const nodes = artifact.renderMapping?.elements.map((node) => `<g id="elem_${node.alias}"><text>${escaped(node.label ?? "")}</text></g>`).join("");
      const links = artifact.renderMapping?.relationships.filter((edge) => edge.statement && !edge.statement.trimStart().startsWith("'")).map((edge) => `<g class="link" data-entity-1="${aliases.get(edge.sourceId)}" data-entity-2="${aliases.get(edge.targetId)}"><text>${escaped(edge.label ?? "")}</text></g>`).join("");
      return { svg: `<svg>${nodes}${links}</svg>`, renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 0 } };
    }, async () => ({ png: Buffer.from("png"), renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: 1, durationMs: 0 } }));
  } catch (error) { if (!failClass && !cancelDuringClass) throw error; }
  return { snapshot: snapshot as DesignRunSnapshot, starts, ready, operations, elapsed: performance.now() - startedAt };
}

test("design DAG reduces simulated batch time by at least 30% while retaining all checks and prerequisite waits", async () => {
  const result = await runBatch();
  assert.equal(result.snapshot.status, "completed");
  for (const kind of designGenerationKinds) assert.ok(result.snapshot.models.some((model) => model.diagramKind === kind), kind);
  assert.ok(result.operations.get("review")! >= 14, "structure and image for every model");
  for (const kind of ["architecture", "class", "navigation"] as DesignDiagramKind[]) assert.ok(result.starts.get(kind)! < result.ready.get("class")!);
  for (const kind of ["table", "component"]) assert.ok(result.starts.get(kind)! >= result.ready.get("class")!);
  assert.ok(result.starts.get("deployment")! >= result.ready.get("component")!);
  const serial = designGenerationKinds.reduce((sum, kind) => sum + result.ready.get(kind)! - result.starts.get(kind)!, 0);
  assert.ok(result.elapsed <= serial * 0.7, `parallel=${result.elapsed.toFixed(0)}ms, serial=${serial.toFixed(0)}ms`);
  console.log(JSON.stringify({ designSimulatedParallelMs: Math.round(result.elapsed), designSimulatedSerialMs: Math.round(serial), reductionPercent: Math.round((1 - result.elapsed / serial) * 100) }));
});

test("failed class blocks only table/component/deployment and preserves independent reviewed branches", async () => {
  const result = await runBatch(true);
  assert.ok(result.ready.has("architecture") && result.ready.has("navigation"));
  for (const kind of ["table", "component", "deployment"]) assert.ok(!result.starts.has(kind));
  assert.ok(result.snapshot.diagramErrors.class);
});

test("cancellation prevents all waiting dependent branches from starting", async () => {
  const result = await runBatch(false, true);
  await new Promise((resolve) => setTimeout(resolve, 200));
  for (const kind of ["table", "component", "deployment"]) assert.ok(!result.starts.has(kind));
  assert.equal(result.snapshot.status, "cancelled");
});
