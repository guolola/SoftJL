// Verifies local patches remain subject to whole-model structural and business-scope guards.
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import { structuralRepairCandidate } from "./structural-repair-patch.js";
import { acceptStructuralRepairCandidate } from "./diagram-review.js";

test("a local multiplicity repair preserves all business content and the original model", () => {
  const model = modelFixture("design", "class"); if (model.diagramKind !== "class") throw new Error("fixture");
  model.relationships[0].targetMultiplicity = "0...*";
  const candidate = structuralRepairCandidate({ changes: [{ path: "relationships.0.targetMultiplicity", value: "0..*" }] }, model);
  const accepted = acceptStructuralRepairCandidate(candidate, model, { stage: "design" });
  assert.equal(model.relationships[0].targetMultiplicity, "0...*");
  assert.equal((accepted as typeof model).relationships[0].targetMultiplicity, "0..*");
  const renamed = structuralRepairCandidate({ changes: [{ path: "relationships.0.targetMultiplicity", value: "0..*" }, { path: "title", value: "改写业务" }] }, model);
  assert.throws(() => acceptStructuralRepairCandidate(renamed, model, { stage: "design" }), /业务内容|无关字段/);
});

test("patches reject prototype paths and collection growth before candidate acceptance", () => {
  const model = modelFixture("design", "class");
  for (const path of ["__proto__.polluted", "constructor.prototype.polluted", "relationships.999.targetId"]) {
    assert.throws(() => structuralRepairCandidate({ changes: [{ path, value: "bad" }] }, model), /不合法|不存在|扩展集合/);
  }
  assert.equal(({} as any).polluted, undefined);
});

test("structural repairs reject the retired complete-model envelope", () => {
  const model = modelFixture("design", "class");
  assert.throws(() => structuralRepairCandidate({ model }, model), /非空字段补丁/);
});
