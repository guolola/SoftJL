// Verifies that selecting one generated use-case design preserves only its own traceability.
import assert from "node:assert/strict";
import test from "node:test";
import { type DesignModelTraceabilityEntry, type SequenceDiagramSpec, type UseCaseSpec } from "@uml-platform/contracts";
import { coerceSequenceModelForUseCase } from "./design-pipeline.js";

const useCase: UseCaseSpec = {
  id: "UC-001", name: "配置系统", goal: "保存配置", preconditions: [], postconditions: [], supportingActorIds: [], eventFlows: [],
};
function model(modelId: string | undefined, sourceUseCaseId: string, extraParticipant: string): SequenceDiagramSpec {
  return {
    diagramKind: "sequence", modelId, sourceUseCaseId, title: sourceUseCaseId, summary: "实现用例", notes: [],
    participants: [{ id: "user", name: "User", participantType: "actor" }, { id: extraParticipant, name: extraParticipant, participantType: "service" }],
    messages: [{ id: "call", type: "sync", sourceId: "user", targetId: extraParticipant, name: "call", parameters: [] }], fragments: [],
  };
}
function trace(modelId: string | undefined, elementId: string, useCaseId = "UC-001"): DesignModelTraceabilityEntry {
  return {
    source: { modelId, diagramKind: "sequence", elementId, elementKind: "participant", label: elementId },
    targets: [{ modelId: "requirements", diagramKind: "usecase", elementId: useCaseId, elementKind: "usecase", label: useCaseId }],
    reviewStatus: "confirmed",
  };
}

test("selecting a use case excludes sibling traces even when element IDs are shared", () => {
  const selected = model("generated-config", useCase.id, "config-service");
  const sibling = model("generated-monitor", "UC-006", "sensor-service");
  const result = {
    models: [sibling, selected],
    designModelTraceability: [trace(sibling.modelId, "user", "UC-006"), trace(sibling.modelId, "sensor-service", "UC-006"),
      trace(selected.modelId, "user"), trace(selected.modelId, "config-service"), trace(selected.modelId, "call"), trace(selected.modelId, "deleted")],
  };
  const before = structuredClone(result);
  const coerced = coerceSequenceModelForUseCase(result, useCase);
  assert.equal(coerced.models[0].modelId, "sequence:UC-001");
  assert.deepEqual(coerced.designModelTraceability.map((entry) => entry.source.elementId), ["user", "config-service", "call", "deleted"]);
  assert.ok(coerced.designModelTraceability.every((entry) => entry.source.modelId === "sequence:UC-001"));
  assert.deepEqual(coerced.designModelTraceability.map((entry) => entry.targets[0].elementId), ["UC-001", "UC-001", "UC-001", "UC-001"]);
  assert.deepEqual(result, before);
});

test("single legacy model without an ID keeps existing element traces while dropping absent elements", () => {
  const result = coerceSequenceModelForUseCase({
    models: [model(undefined, useCase.id, "config-service")],
    designModelTraceability: [trace(undefined, "config-service"), trace(undefined, "missing")],
  }, useCase);
  assert.deepEqual(result.designModelTraceability.map((entry) => entry.source.elementId), ["config-service", "missing"]);
  assert.equal(result.designModelTraceability[0].source.modelId, "sequence:UC-001");
  assert.throws(() => coerceSequenceModelForUseCase({ models: [], designModelTraceability: [] }, useCase), /生成结果为空/);
});

test("ID-free traces shared by sibling models cannot be assigned to the selected use case", () => {
  const result = coerceSequenceModelForUseCase({
    models: [model("config", useCase.id, "config-service"), model("monitor", "UC-006", "sensor-service")],
    designModelTraceability: [trace(undefined, "user"), trace(undefined, "call"), trace(undefined, "config-service")],
  }, useCase);
  assert.deepEqual(result.designModelTraceability.map((entry) => entry.source.elementId), ["config-service"]);
});


test("design generation completes only missing mappings against its direct design dependency", async () => {
  const { createEmptyDesignSnapshot, createEmptySnapshot } = await import("../records/snapshots.js");
  const { generateDesignModelsWithRepair } = await import("./design-pipeline.js");
  const { strictTestModelCapability } = await import("../../test-fixtures/providers/model-capability.js");
  const { modelFixture } = await import("../../../../../packages/contracts/src/testing/model-fixtures.js");
  const baseline = createEmptySnapshot("source", "生成订单", ["usecase"], [{ id: "r1", type: "functional", text: "生成订单" }]).requirementBaseline!;
  const snapshot = createEmptyDesignSnapshot("trust", { selectedDiagrams: ["component"], requirementBaseline: baseline, requirementModels: [], requirementModelTraceability: [] });
  const run = { snapshot, events: [], listeners: new Set(), terminal: false } as import("../records/run-record-store.js").RunRecord;
  let calls = 0;
  const generated = modelFixture("design", "component");
  const upstream = { ...modelFixture("design", "class"), modelId: "design-class" };
  const { collectModelRefs } = await import("../../normalizers/traceability/traceability-normalizer.js");
  const declaration = { source: { modelId: "component", diagramKind: "component", elementId: "c", elementKind: "component", label: "组件" }, targets: [{ modelId: "design-class", diagramKind: "class", elementId: "upstream-class", elementKind: "class", label: "上游设计类" }] };
  declaration.targets[0]!.elementId = "order";
  const result = await generateDesignModelsWithRepair(run, { apiBaseUrl: "https://llm.test", apiKey: "test", model: "test", modelCapability: strictTestModelCapability("test") }, { async *streamChatCompletion() {
    calls++;
    yield calls === 1 ? JSON.stringify({ models: [generated], designModelTraceability: [declaration] }) : JSON.stringify({ designModelTraceability: collectModelRefs([generated]).refs.filter(ref => ref.elementId !== "c").map(source => ({ source, targets: declaration.targets })) });
  } }, baseline, [], ["component"], "只读取上游设计类图", "generate_design_models", { upstreamDesignModels: [upstream] });
  assert.equal(calls, 2);
  assert.equal(result.designModelTraceability.length, 3);
  assert.equal(result.designModelTraceability[0]!.targets[0]!.elementId, "order");
  assert.deepEqual(result.models, [generated]);
});
