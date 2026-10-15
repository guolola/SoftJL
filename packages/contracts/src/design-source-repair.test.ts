// Rejects provenance repairs when sources or any published artifact were changed.
import assert from "node:assert/strict";
import test from "node:test";
import { previewDesignSourceRepair } from "./design-source-repair.js";
import { modelFixture } from "./testing/model-fixtures.js";
import type { DesignRunSnapshot } from "./runs.js";

test("provenance repair preserves artifacts/history/reviews and refuses changed sources or manual edits", () => {
  const usecase = modelFixture("requirements", "usecase");
  const model = modelFixture("design", "class");
  const source = { requirementText: "需求", rules: [], requirementModels: [usecase, { diagramKind: "analysis", modelId: "analysis:retired", sourceUseCaseId: "retired" }], requirementModelTraceability: [], models: [model], plantUml: [{ modelId: "class", source: "@startuml\n@enduml" }], svgArtifacts: [{ modelId: "class", svg: "<svg/>" }] } as unknown as DesignRunSnapshot;
  const state: Record<string, unknown> = { requirementText: "需求", rules: [], models: { usecase }, requirementModelTraceability: [], designModels: { class: model }, designPlantUml: { class: "@startuml\n@enduml" }, designSvgArtifacts: { class: { svg: "<svg/>" } }, designInputFingerprints: { class: "old" }, visualReviews: { class: { status: "pending_review" } } };
  const before = structuredClone(state);
  const preview = previewDesignSourceRepair(state, source, "old");
  assert.deepEqual(preview.changes.map((change) => change.modelId), ["class"]);
  assert.deepEqual(state, before);
  assert.throws(() => previewDesignSourceRepair({ ...state, requirementText: "新需求" }, source, "old"), /来源不一致/);
  assert.deepEqual(previewDesignSourceRepair({ ...state, designModels: { class: { ...model, summary: "人工修改" } } }, source, "old").skipped, ["class"]);
  assert.deepEqual(previewDesignSourceRepair({ ...state, designPlantUml: { class: "人工图源" } }, source, "old").changes, []);
  assert.deepEqual(previewDesignSourceRepair(state, source, "another-run").changes, []);
  const emptyLegacy = { ...source, requirementText: "", rules: [] };
  assert.throws(() => previewDesignSourceRepair(state, emptyLegacy, "old"), /来源不一致/);
  assert.equal(previewDesignSourceRepair(state, emptyLegacy, "old", { requirementText: "需求", rules: [] }).changes.length, 1);
});
