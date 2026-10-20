// Verifies dependent model batches are rejected in either selection order and bulk choices remain independent.
import assert from "node:assert/strict";
import test from "node:test";
import { conflictingModelGenerationTarget, independentModelGenerationTargets } from "./generation-policy.js";

test("upstream and downstream selections conflict in both orders, including transitive design dependencies", () => {
  for (const [stage, upstream, downstream] of [
    ["requirements", "usecase", "analysis"], ["design", "class", "table"],
    ["design", "class", "component"], ["design", "component", "deployment"], ["design", "class", "deployment"],
  ] as const) {
    assert.equal(conflictingModelGenerationTarget(stage, upstream, [downstream]), downstream);
    assert.equal(conflictingModelGenerationTarget(stage, downstream, [upstream]), upstream);
  }
  assert.equal(conflictingModelGenerationTarget("design", "component", ["table"]), undefined);
  assert.equal(conflictingModelGenerationTarget("design", "deployment", ["table"]), undefined);
});

test("bulk selection keeps the first chosen targets and skips only conflicting additions", () => {
  assert.deepEqual(independentModelGenerationTargets("requirements", ["usecase", "analysis", "function"]), ["usecase", "function"]);
  assert.deepEqual(independentModelGenerationTargets("requirements", ["analysis", "usecase", "analysis", "function"]), ["analysis", "function"]);
  assert.deepEqual(independentModelGenerationTargets("design", ["class", "table", "component", "deployment", "navigation"]), ["class", "navigation"]);
  assert.deepEqual(independentModelGenerationTargets("design", ["component", "table", "class", "deployment"]), ["component", "table"]);
});
