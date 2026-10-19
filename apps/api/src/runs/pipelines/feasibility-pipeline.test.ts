// Ensures replayed feasibility inputs cannot reintroduce obsolete baseline facts.
import { strictTestModelCapability } from "../../test-fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import { buildFeasibilityContextFingerprint, feasibilityInputsSchema, snapshotInputFingerprint, type RequirementRule } from "@uml-platform/contracts";
import { createEmptyFeasibilitySnapshot } from "../records/snapshots.js";
import { buildRequirementBaseline } from "../baselines/requirement-baseline.js";
import { librarySeatFeasibilityContext, librarySeatFeasibilityFlow, librarySeatFeasibilityPlan } from "../demo/fixtures/library-seat-feasibility-fixture.js";
import type { RunRecord } from "../records/run-record-store.js";
import { readDiagramReviewCounters } from "../records/diagram-review-record.js";
import { runFeasibilityStagePipeline } from "./feasibility-pipeline.js";
import { modelFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";

test("replayed feasibility rejects mismatched facts before any provider call", async () => {
  const rule = { id: "r1", type: "functional" as const, text: "旧版：管理员可以删除订单",  };
  const baseline = buildRequirementBaseline({ runId: "old", requirementText: rule.text, rules: [rule] });
  const current = { ...rule, text: "新版：管理员禁止删除订单" };
  const snapshot = createEmptyFeasibilitySnapshot("replay", { projectId: "p", selectedArtifacts: ["context"],
    rules: [current], requirementBaseline: baseline, providerSettings: { providerConfigId: "p", model: "test" }, inputs: feasibilityInputsSchema.parse({}) });
  let prompt = "";
  await assert.rejects(runFeasibilityStagePipeline({ snapshot, events: [], listeners: new Set(), terminal: false },
    { modelCapability: strictTestModelCapability("test"), apiBaseUrl: "https://example.test", apiKey: "test", model: "test" },
    { async *streamChatCompletion(input) { prompt = JSON.stringify(input.messages); throw new Error("provider-stop"); } },
    { async render() { throw new Error("must not render"); } }), /baseline does not match/);
  assert.equal(prompt, "");
  assert.deepEqual(snapshot.requirementBaseline, baseline);
});

test("a lane and node ID collision completes after one focused repair", async () => {
  const rules: RequirementRule[] = [{ id: "r1", type: "functional", text: "系统调用外部工具处理业务" }];
  const baseline = buildRequirementBaseline({ runId: "source", requirementText: rules[0]!.text, rules });
  const snapshot = createEmptyFeasibilitySnapshot("duplicate-lane", { projectId: "p", selectedArtifacts: ["business-flow"],
    rules, requirementBaseline: baseline, providerSettings: { providerConfigId: "p", model: "test" }, inputs: feasibilityInputsSchema.parse({}) });
  const run: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
  const model = modelFixture("feasibility", "activity");
  if (model.diagramKind !== "activity") throw new Error("fixture");
  model.swimlanes.push({ id: "work", name: "外部工具" });
  model.nodes.push({ id: "external", type: "activity", name: "工具执行", actorOrLane: "work", input: [], output: [] });
  model.relationships[1]!.targetId = "external";
  model.relationships.push({ id: "r3", type: "control_flow", sourceId: "external", targetId: "end" });
  let calls = 0;
  await runFeasibilityStagePipeline(run,
    { modelCapability: strictTestModelCapability("test"), apiBaseUrl: "https://example.test", apiKey: "test", model: "test" },
    { async *streamChatCompletion(input) {
      calls++;
      if (calls === 1) { yield JSON.stringify({ model, traceability: [{ requirementId: "r1", targetId: "work", targetKind: "node" }] }); return; }
      const prompt = input.messages.at(-1)!.content;
      assert.equal(typeof prompt, "string");
      const metadata = JSON.parse((prompt as string).split("\n").find(line => line.startsWith("修复上下文："))!.slice("修复上下文：".length));
      assert.deepEqual(metadata.paths, ["model.swimlanes.1.id", "model.nodes.3.actorOrLane"]);
      yield JSON.stringify({ targetId: metadata.targetId, baseFingerprint: metadata.baseFingerprint, changes: [
        { path: "model.swimlanes.1.id", value: "lane_tool" }, { path: "model.nodes.3.actorOrLane", value: "lane_tool" },
      ] });
    } },
    async artifact => ({ svg: "<svg/>", renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 0 } }));
  assert.equal(calls, 2);
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.businessFlow!.model.swimlanes[1]!.id, "lane_tool");
  assert.deepEqual(snapshot.businessFlow!.model.relationships, model.relationships);
});


for (const artifact of ["context", "business-flow", "implementation"] as const) {
  for (const missingSource of [false, true]) {
    test(`feasibility ${artifact}: ${missingSource ? "missing sources fail after five repairs" : "sources included on the first call need no LLM coverage review"}`, async () => {
      const rules: RequirementRule[] = Array.from({ length: 11 }, (_, index) => ({ id: `r${index + 1}`, type: "functional", text: `座位预约规则 ${index + 1}` }));
      const baseline = buildRequirementBaseline({ runId: "source", requirementText: rules.map(rule => rule.text).join("\n"), rules });
      const snapshot = createEmptyFeasibilitySnapshot("source-enforcement", { projectId: "p", selectedArtifacts: [artifact],
        rules, requirementBaseline: baseline, providerSettings: { providerConfigId: "p", model: "test" }, inputs: feasibilityInputsSchema.parse({}) });
      if (artifact === "implementation") {
        snapshot.contextModel = structuredClone(librarySeatFeasibilityContext);
        const plantUml = { diagramKind: "context" as const, modelId: "context", title: "环境图", source: "@startuml\n@enduml" };
        const svg = { diagramKind: "context" as const, modelId: "context", title: "环境图", svg: "<svg/>", renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: 17, durationMs: 0 } };
        snapshot.contextPlantUml = plantUml; snapshot.contextSvg = svg;
        snapshot.contextFingerprint = buildFeasibilityContextFingerprint(snapshot);
        snapshot.businessFlow = { ...structuredClone(librarySeatFeasibilityFlow), plantUml: { ...plantUml, diagramKind: "activity", modelId: librarySeatFeasibilityFlow.model.modelId }, svg: { ...svg, diagramKind: "activity", modelId: librarySeatFeasibilityFlow.model.modelId }, fingerprint: snapshotInputFingerprint({ rules, requirementBaseline: baseline }) };
      }
      const run: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
      let calls = 0;
      const response = artifact === "context" ? structuredClone(librarySeatFeasibilityContext) : artifact === "business-flow" ? structuredClone(librarySeatFeasibilityFlow) : structuredClone(librarySeatFeasibilityPlan);
      if (missingSource) {
        if ("people" in response) response.people[0]!.sourceRequirementIds = [];
        else if ("traceability" in response) response.traceability = [];
        else response.candidates[0]!.sourceRequirementIds = [];
      }
      const generation = runFeasibilityStagePipeline(run,
        { modelCapability: strictTestModelCapability("test"), apiBaseUrl: "https://example.test", apiKey: "test", model: "test" },
        { async *streamChatCompletion() { calls++; yield JSON.stringify(response); } },
        async artifact => ({ svg: "<svg/>", renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 0 } }));
      if (missingSource) {
        await assert.rejects(generation, /结构化输出.*共享 5 次修复/);
        assert.equal(calls, 6);
        const identity = artifact === "business-flow" ? "activity" : artifact;
        assert.equal(readDiagramReviewCounters(run, identity, identity).repairAttempts, 5);
        assert.notEqual(snapshot.status, "completed");
      } else {
        await generation;
        assert.equal(calls, 1, "no additional semantic coverage request");
        assert.equal(snapshot.status, "completed");
      }
    });
  }
}
