// Protects manual edits without blocking accepted partial previews or independent concurrent results.
import assert from "node:assert/strict";
import test from "node:test";
import { designGenerationBaseFingerprints, protectedDesignGenerationKinds } from "./design-generation-merge.js";
test("accepted partial sequences remain mergeable while edits and deletions stay protected", () => {
  const a = { diagramKind: "sequence", modelId: "sequence:a", summary: "旧 A" };
  const b = { diagramKind: "sequence", modelId: "sequence:b", summary: "旧 B" };
  const initial = { "sequence:a": a, "sequence:b": b };
  const generated = { "sequence:a": { ...a, summary: "新 A" }, "sequence:b": { ...b, summary: "新 B" } };
  const base = designGenerationBaseFingerprints(initial);
  assert.deepEqual(protectedDesignGenerationKinds({ ...initial, "sequence:a": generated["sequence:a"] }, generated, base), []);
  assert.deepEqual(protectedDesignGenerationKinds(generated, generated, base), []);
  assert.deepEqual(protectedDesignGenerationKinds({ ...initial, "sequence:b": { ...b, summary: "人工修改" } }, generated, base), ["sequence"]);
  assert.deepEqual(protectedDesignGenerationKinds({ "sequence:a": a }, generated, base), ["sequence"]);
  assert.deepEqual(protectedDesignGenerationKinds(initial, generated, base), []);
  const artifactBase = designGenerationBaseFingerprints(initial, { "sequence:a": "original" }, { "sequence:a": { svg: "original-svg" } });
  assert.deepEqual(protectedDesignGenerationKinds(initial, generated, artifactBase, {}, { currentSources: { "sequence:a": "manual source" }, currentSvgs: { "sequence:a": { svg: "original-svg" } }, generatedSources: { "sequence:a": "generated" }, generatedSvgs: {} }), ["sequence"]);
});

test("manual edits to newly previewed artifact IDs remain protected", () => {
  const original = { "class:old": { diagramKind: "class", modelId: "class:old" } };
  const generated = { "generated-class": { diagramKind: "class", modelId: "generated-class" } };
  const preview = { ...original, ...generated };
  const base = designGenerationBaseFingerprints(original);
  const applied = designGenerationBaseFingerprints(preview, { "generated-class": "accepted" }, { "generated-class": { svg: "accepted-svg" } });
  const artifacts = { currentSources: { "generated-class": "accepted" }, currentSvgs: { "generated-class": { svg: "accepted-svg" } }, generatedSources: { "generated-class": "accepted" }, generatedSvgs: { "generated-class": { svg: "accepted-svg" } } };
  assert.deepEqual(protectedDesignGenerationKinds(preview, generated, base, applied, artifacts), []);
  assert.deepEqual(protectedDesignGenerationKinds(preview, generated, base, applied, { ...artifacts, currentSources: { "generated-class": "manual" } }), ["class"]);
  assert.deepEqual(protectedDesignGenerationKinds(preview, generated, base, applied, { ...artifacts, currentSvgs: { "generated-class": { svg: "manual-svg" } } }), ["class"]);
});
