// Verifies source coverage remains mandatory when complete model responses replace mapping-only retries.
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture } from "@uml-platform/contracts/testing";
import { collectModelRefs } from "@uml-platform/contracts";
import { assertRequirementMappings, assertDesignMappings } from "./model-mapping-validation.js";
import { repairDiagnostics } from "../../../normalizers/structured-output/repair-diagnostics.js";

const rule = { id: "r1", type: "functional" as const, text: "系统支持功能" };
test("requirement mappings must cover all current business elements and valid rule sources", () => {
  const model = modelFixture("requirements", "function");
  const bindings = collectModelRefs([model]).refs.map(target => ({ ruleId: rule.id, target }));
  assert.doesNotThrow(() => assertRequirementMappings([model], [rule], bindings));
  assert.throws(() => assertRequirementMappings([model], [rule], bindings.slice(1)), /映射仍缺少/);
  for (const changed of [
    { ...bindings[0]!, ruleId: "missing" },
    { ...bindings[0]!, target: { ...bindings[0]!.target, elementId: "missing" } },
  ]) assert.throws(() => assertRequirementMappings([model], [rule], [changed, ...bindings.slice(1)]), /有效来源/);
  assert.throws(() => assertRequirementMappings([model], [{ ...rule, type: "data" }], bindings), /需求类型/);
  assert.doesNotThrow(() => assertRequirementMappings([modelFixture("requirements", "analysis")], [], []));
});

test("design mappings cannot replace real direct dependencies with absent or sibling sources", () => {
  const model = modelFixture("design", "component");
  const upstream = modelFixture("design", "class");
  const target = collectModelRefs([upstream]).refs[0]!;
  const bindings = collectModelRefs([model]).refs.map(source => ({ source, targets: [target] }));
  assert.doesNotThrow(() => assertDesignMappings([model], [upstream], bindings));
  assert.throws(() => assertDesignMappings([model], [upstream], bindings.slice(1)), /映射仍缺少/);
  for (const changed of [
    { ...bindings[0]!, targets: [] },
    { ...bindings[0]!, source: { ...bindings[0]!.source, modelId: "sibling" } },
    { ...bindings[0]!, targets: [{ ...target, elementId: "missing" }] },
    { ...bindings[0]!, upstreamDesignRefs: [{ ...target, modelId: "missing" }] },
  ]) assert.throws(() => assertDesignMappings([model], [upstream], [changed, ...bindings.slice(1)]), /当前模型|直接上游/);
});

test("references match IDs throughout the corresponding model without an element-type catalog", () => {
  const model = modelFixture("design", "sequence");
  const upstream = modelFixture("requirements", "usecase");
  if (model.diagramKind !== "sequence" || upstream.diagramKind !== "usecase") throw new Error("fixture");
  upstream.useCases[0]!.eventFlows = [{ id: "flow", name: "下单主流程", flowType: "main", steps: [{ order: 1, actor: "actor", actorAction: "提交订单" }] }];
  model.activations = [{ id: "activation", participantId: "b", startMessageId: "m", endMessageId: "m" }];
  const target = { modelId: upstream.modelId, diagramKind: "usecase" as const, elementId: "flow", elementKind: "eventFlow", label: "下单主流程" };
  const bindings = collectModelRefs([model]).refs.map(source => ({ source, targets: [target] }));
  const before = structuredClone({ model, upstream, bindings });
  for (const elementId of ["flow", "boundary", "discount"]) {
    assert.doesNotThrow(() => assertDesignMappings([model], [upstream], bindings.map(binding => ({ ...binding, targets: [{ ...target, elementId }] }))));
  }
  // Optional structural mappings may be supplied, but do not create new coverage requirements.
  assert.doesNotThrow(() => assertDesignMappings([model], [upstream], [...bindings, {
    source: { modelId: model.modelId, diagramKind: "sequence", elementId: "activation", elementKind: "activation", label: "激活" }, targets: [target],
  }]));
  for (const elementId of ["missing", "1", "提交订单"]) {
    assert.throws(() => assertDesignMappings([model], [upstream], bindings.map(binding => ({ ...binding, targets: [{ ...target, elementId }] }))), /targets\.0:.*无法唯一匹配/);
  }
  assert.deepEqual({ model, upstream, bindings }, before);
});

test("nested references stay scoped to their model and report exact repair locations", () => {
  const model = modelFixture("design", "component");
  const upstream = modelFixture("requirements", "usecase");
  const sibling = { ...upstream, modelId: "sibling" };
  const target = { modelId: upstream.modelId, diagramKind: "usecase" as const, elementId: "discount", elementKind: "extensionPoint", label: "计算优惠" };
  const bindings = collectModelRefs([model]).refs.map(source => ({ source, targets: [target] }));
  assert.doesNotThrow(() => assertDesignMappings([model], [upstream, sibling], bindings));
  assert.doesNotThrow(() => assertDesignMappings([model], [upstream], bindings.map(binding => ({ ...binding, targets: [{ ...target, modelId: undefined }] }))));
  for (const changed of [
    { ...target, modelId: "missing" },
    { ...target, modelId: undefined },
    { ...target, diagramKind: "analysis" as const },
  ]) assert.throws(() => assertDesignMappings([model], [upstream, sibling], [{ ...bindings[0]!, targets: [changed] }, ...bindings.slice(1)]), /designModelTraceability\.0\.targets\.0/);
  assert.throws(() => assertDesignMappings([model], [upstream], [{ ...bindings[0]!, upstreamDesignRefs: [{ ...target, elementId: "missing" }] }, ...bindings.slice(1)]), error => {
    const diagnostics = repairDiagnostics(error);
    assert.equal(diagnostics[0]?.path, "designModelTraceability.0.upstreamDesignRefs.0");
    assert.match(diagnostics[0]!.message, /missing/);
    return true;
  });
});

test("qualified column IDs match the correct parent table even when column IDs repeat", () => {
  const model = modelFixture("design", "component");
  const upstream = modelFixture("design", "table");
  const target = { modelId: upstream.modelId, diagramKind: "table" as const, elementId: "orders.id", elementKind: "table-column", label: "orders.id" };
  const bindings = collectModelRefs([model]).refs.map(source => ({ source, targets: [target] }));
  for (const elementId of ["orders.id", "items.id", "items.fk_order"]) {
    assert.doesNotThrow(() => assertDesignMappings([model], [upstream], bindings.map(binding => ({ ...binding, targets: [{ ...target, elementId }] }))));
  }
  for (const elementId of ["missing.id", "orders.order"]) {
    assert.throws(() => assertDesignMappings([model], [upstream], bindings.map(binding => ({ ...binding, targets: [{ ...target, elementId }] }))), /targets\.0/);
  }
});

test("requirement mappings also accept real nested IDs while retaining business coverage", () => {
  const model = modelFixture("requirements", "usecase");
  const bindings = collectModelRefs([model]).refs.map(target => ({ ruleId: rule.id, target }));
  const nested = { ruleId: rule.id, target: { modelId: model.modelId, diagramKind: "usecase" as const, elementId: "discount", elementKind: "extensionPoint", label: "计算优惠" } };
  assert.doesNotThrow(() => assertRequirementMappings([model], [rule], [...bindings, nested]));
  assert.throws(() => assertRequirementMappings([model], [rule], [nested]), /映射仍缺少/);
});
