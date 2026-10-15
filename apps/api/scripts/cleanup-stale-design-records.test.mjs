import assert from "node:assert/strict";
import test from "node:test";
import { cleanupState } from "./cleanup-stale-design-records.mjs";

function stateWithStaleSequence() {
  return {
    models: {
      usecase: {
        diagramKind: "usecase",
        useCases: [
          { id: "uc-1", name: "查看座位" },
          { id: "uc-2", name: "预约座位" },
        ],
      },
    },
    designModels: {
      "sequence:uc_old": {
        diagramKind: "sequence",
        modelId: "sequence:uc_old",
        sourceUseCaseId: "uc_old",
      },
      "sequence:uc-1": {
        diagramKind: "sequence",
        modelId: "sequence:uc-1",
        sourceUseCaseId: "uc-1",
      },
      class: {
        diagramKind: "class",
        modelId: "class",
      },
    },
    designPlantUml: {
      "sequence:uc_old": "@startuml\n' old\n@enduml",
      "sequence:uc-1": "@startuml\n@enduml",
      class: "@startuml\nclass Seat\n@enduml",
    },
    designSvgArtifacts: {
      "sequence:uc_old": {
        diagramKind: "sequence",
        modelId: "sequence:uc_old",
        svg: "<svg data-old />",
      },
      "sequence:uc-1": {
        diagramKind: "sequence",
        modelId: "sequence:uc-1",
        svg: "<svg />",
      },
      class: {
        diagramKind: "class",
        modelId: "class",
        svg: "<svg />",
      },
    },
    designInputFingerprints: {
      "sequence:uc_old": "old-fp",
      "sequence:uc-1": "new-fp",
      class: "class-fp",
    },
    designModelTraceability: [
      {
        source: {
          diagramKind: "usecase",
          elementId: "uc_old",
          elementKind: "useCase",
          label: "旧用例",
        },
        targets: [
          {
            modelId: "sequence:uc_old",
            diagramKind: "sequence",
            elementId: "old-message",
            elementKind: "message",
            label: "旧消息",
          },
        ],
      },
      {
        source: {
          diagramKind: "usecase",
          elementId: "uc-1",
          elementKind: "useCase",
          label: "查看座位",
        },
        targets: [
          {
            modelId: "sequence:uc-1",
            diagramKind: "sequence",
            elementId: "message-1",
            elementKind: "message",
            label: "查看座位",
          },
        ],
      },
    ],
  };
}

test("cleanupState removes stale sequence records and leaves the input state untouched", () => {
  const state = stateWithStaleSequence();
  const cleanup = cleanupState(state);

  assert.equal(cleanup.changed, true);
  assert.deepEqual(cleanup.currentUseCaseIds, ["uc-1", "uc-2"]);
  assert.deepEqual(cleanup.staleSequenceIds, ["sequence:uc_old"]);
  assert.deepEqual(cleanup.counts, {
    designModelsBefore: 3,
    designModelsAfter: 2,
    sequenceBefore: 2,
    sequenceAfter: 1,
    staleSequenceModels: 1,
    staleSvgArtifacts: 1,
    stalePlantUml: 1,
    staleFingerprints: 1,
    staleTraceability: 1,
  });
  assert.deepEqual(Object.keys(cleanup.state.designModels).sort(), [
    "class",
    "sequence:uc-1",
  ]);
  assert.equal(state.designModels["sequence:uc_old"].modelId, "sequence:uc_old");
});

test("cleanupState does not remove sequence records when current use cases are unavailable", () => {
  const state = stateWithStaleSequence();
  state.models = {};
  const cleanup = cleanupState(state);

  assert.equal(cleanup.changed, false);
  assert.deepEqual(cleanup.currentUseCaseIds, []);
  assert.deepEqual(cleanup.staleSequenceIds, []);
  assert.deepEqual(Object.keys(cleanup.state.designModels).sort(), [
    "class",
    "sequence:uc-1",
    "sequence:uc_old",
  ]);
});
