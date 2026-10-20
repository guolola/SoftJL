// Verifies source coverage remains mandatory when complete model responses replace mapping-only retries.
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture } from "../../../../../../packages/contracts/src/testing/model-fixtures.js";
import { collectModelRefs } from "../../../normalizers/traceability/traceability-normalizer.js";
import { assertRequirementMappings, assertDesignMappings } from "./model-mapping-validation.js";

const rule = { id: "r1", type: "functional" as const, text: "系统支持功能" };
test("requirement mappings must cover all current business elements and valid rule sources", () => {
  const model = modelFixture("requirements", "function");
  const bindings = collectModelRefs([model]).refs.map(target => ({ ruleId: rule.id, target }));
  assert.doesNotThrow(() => assertRequirementMappings([model], [rule], bindings));
  assert.throws(() => assertRequirementMappings([model], [rule], bindings.slice(1)), /映射仍缺少/);
  for (const changed of [
    { ...bindings[0]!, ruleId: "missing" },
    { ...bindings[0]!, confidence: "low" as const },
    { ...bindings[0]!, target: { ...bindings[0]!.target, elementId: "missing" } },
  ]) assert.throws(() => assertRequirementMappings([model], [rule], [changed, ...bindings.slice(1)]), /有效来源/);
  assert.throws(() => assertRequirementMappings([model], [{ ...rule, type: "data" }], bindings), /需求类型/);
  assert.doesNotThrow(() => assertRequirementMappings([modelFixture("requirements", "analysis")], [], []));
});

test("design mappings cannot replace real direct dependencies with absent, pending or sibling sources", () => {
  const model = modelFixture("design", "component");
  const upstream = modelFixture("design", "class");
  const target = collectModelRefs([upstream]).refs[0]!;
  const bindings = collectModelRefs([model]).refs.map(source => ({ source, targets: [target] }));
  assert.doesNotThrow(() => assertDesignMappings([model], [upstream], bindings));
  assert.throws(() => assertDesignMappings([model], [upstream], bindings.slice(1)), /映射仍缺少/);
  for (const changed of [
    { ...bindings[0]!, targets: [] },
    { ...bindings[0]!, reviewStatus: "pending" as const },
    { ...bindings[0]!, source: { ...bindings[0]!.source, modelId: "sibling" } },
    { ...bindings[0]!, targets: [{ ...target, elementId: "missing" }] },
    { ...bindings[0]!, upstreamDesignRefs: [{ ...target, modelId: "missing" }] },
  ]) assert.throws(() => assertDesignMappings([model], [upstream], [changed, ...bindings.slice(1)]), /直接上游/);
});
