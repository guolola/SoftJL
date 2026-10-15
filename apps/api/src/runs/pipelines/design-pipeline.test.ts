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
  assert.deepEqual(coerced.designModelTraceability.map((entry) => entry.source.elementId), ["user", "config-service", "call"]);
  assert.ok(coerced.designModelTraceability.every((entry) => entry.source.modelId === "sequence:UC-001"));
  assert.deepEqual(coerced.designModelTraceability.map((entry) => entry.targets[0].elementId), ["UC-001", "UC-001", "UC-001"]);
  assert.deepEqual(result, before);
});

test("single legacy model without an ID keeps existing element traces while dropping absent elements", () => {
  const result = coerceSequenceModelForUseCase({
    models: [model(undefined, useCase.id, "config-service")],
    designModelTraceability: [trace(undefined, "config-service"), trace(undefined, "missing")],
  }, useCase);
  assert.deepEqual(result.designModelTraceability.map((entry) => entry.source.elementId), ["config-service"]);
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
