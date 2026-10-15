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
