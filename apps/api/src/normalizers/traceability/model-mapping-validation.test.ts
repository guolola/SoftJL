// Verifies source coverage remains mandatory when complete model responses replace mapping-only retries.
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture } from "@uml-platform/contracts/testing";
import { collectModelRefs, requirementTypeAppliesToModel, requirementRuleTypeSchema, designGenerationKinds, type DiagramModelSpec, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { assertRequirementMappings, assertDesignMappings } from "./model-mapping-validation.js";
import { repairDiagnostics } from "../structured-output/repair-diagnostics.js";

const rule = { id: "r1", type: "functional" as const, text: "系统支持功能" };
test("requirement mappings must cover all current business elements and valid rule sources", () => {
  const model = modelFixture("requirements", "function");
  const bindings = collectModelRefs([model], true).refs.map(target => ({ ruleId: rule.id, target }));
  assert.doesNotThrow(() => assertRequirementMappings([model], [rule], bindings));
  assert.throws(() => assertRequirementMappings([model], [rule], bindings.slice(1)), /mapping-coverage-missing/);
  for (const changed of [
    { ...bindings[0]!, ruleId: "missing" },
    { ...bindings[0]!, target: { ...bindings[0]!.target, elementId: "missing" } },
  ]) assert.throws(() => assertRequirementMappings([model], [rule], [changed, ...bindings.slice(1)]), /有效来源|不存在元素/);
  assert.doesNotThrow(() => assertRequirementMappings([model], [{ ...rule, type: "data" }], bindings));
  assert.throws(() => assertRequirementMappings([modelFixture("requirements", "analysis")], [], []), /mapping-coverage-missing/);
});

test("design mappings cannot replace real direct dependencies with absent or sibling sources", () => {
  const model = modelFixture("design", "component");
  const upstream = modelFixture("design", "class");
  const target = collectModelRefs([upstream], true).refs[0]!;
  const bindings = collectModelRefs([model], true).refs.map(source => ({ source, targets: [target] }));
  assert.doesNotThrow(() => assertDesignMappings([model], [upstream], bindings));
  assert.throws(() => assertDesignMappings([model], [upstream], bindings.slice(1)), /mapping-coverage-missing/);
  for (const changed of [
    { ...bindings[0]!, targets: [] },
    { ...bindings[0]!, source: { ...bindings[0]!.source, modelId: "sibling" } },
    { ...bindings[0]!, targets: [{ ...target, elementId: "missing" }] },
    { ...bindings[0]!, targets: [{ ...target, modelId: "missing" }] },
  ]) assert.throws(() => assertDesignMappings([model], [upstream], [changed, ...bindings.slice(1)]), /当前模型|直接上游/);
});

test("references validate real nested IDs without comparing element types", () => {
  const model = modelFixture("design", "sequence");
  const upstream = modelFixture("requirements", "usecase");
  if (model.diagramKind !== "sequence" || upstream.diagramKind !== "usecase") throw new Error("fixture");
  upstream.useCases[0]!.eventFlows = [{ id: "flow", name: "下单主流程", flowType: "main", steps: [{ order: 1, actor: "actor", actorAction: "提交订单" }] }];
  model.activations = [{ id: "activation", participantId: "b", startMessageId: "m", endMessageId: "m" }];
  const target = { modelId: upstream.modelId, diagramKind: "usecase" as const, elementId: "flow", elementKind: "eventFlow", label: "下单主流程" };
  const bindings = collectModelRefs([model], true).refs.map(source => ({ source, targets: [target] }));
  const before = structuredClone({ model, upstream, bindings });
  for (const [elementId, elementKind] of [["flow", "eventFlow"], ["boundary", "system-boundary"], ["discount", "extensionPoint"]]) {
    assert.doesNotThrow(() => assertDesignMappings([model], [upstream], bindings.map(binding => ({ ...binding, targets: [{ ...target, elementId, elementKind }] }))));
  }
  // Optional structural mappings may be supplied, but do not create new coverage requirements.
  assert.doesNotThrow(() => assertDesignMappings([model], [upstream], [...bindings, {
    source: { modelId: model.modelId, diagramKind: "sequence", elementId: "activation", elementKind: "activation", label: "激活" }, targets: [target],
  }]));
  for (const elementId of ["missing", "1", "提交订单"]) {
    assert.throws(() => assertDesignMappings([model], [upstream], bindings.map(binding => ({ ...binding, targets: [{ ...target, elementId }] }))), /targets\.0\.elementId:.*不存在元素/);
  }
  assert.deepEqual({ model, upstream, bindings }, before);
});

test("nested references stay scoped to their model and report exact repair locations", () => {
  const model = modelFixture("design", "component");
  const upstream = modelFixture("requirements", "usecase");
  const sibling = { ...upstream, modelId: "sibling" };
  const target = { modelId: upstream.modelId, diagramKind: "usecase" as const, elementId: "discount", elementKind: "extensionPoint", label: "计算优惠" };
  const bindings = collectModelRefs([model], true).refs.map(source => ({ source, targets: [target] }));
  assert.doesNotThrow(() => assertDesignMappings([model], [upstream, sibling], bindings));
  assert.doesNotThrow(() => assertDesignMappings([model], [upstream], bindings.map(binding => ({ ...binding, targets: [{ ...target, modelId: undefined }] }))));
  for (const changed of [
    { ...target, modelId: "missing" },
    { ...target, modelId: undefined },
    { ...target, diagramKind: "analysis" as const },
  ]) assert.throws(() => assertDesignMappings([model], [upstream, sibling], [{ ...bindings[0]!, targets: [changed] }, ...bindings.slice(1)]), /designModelTraceability\.0\.targets\.0/);
  assert.throws(() => assertDesignMappings([model], [upstream], [{ ...bindings[0]!, targets: [{ ...target, elementId: "missing" }] }, ...bindings.slice(1)]), error => {
    const diagnostics = repairDiagnostics(error);
    assert.equal(diagnostics[0]?.path, "designModelTraceability.0.targets.0.elementId");
    assert.match(diagnostics[0]!.message, /missing/);
    return true;
  });
});

function diagnostic(action: () => void) {
  try { action(); } catch (error) {
    const entries = repairDiagnostics(error);
    assert.ok(entries.length >= 1);
    return entries[0]!;
  }
  assert.fail("invalid mapping must be rejected");
}

test("all design kinds report actual upstream types and legal IDs without rewriting references", () => {
  const analysis = { ...modelFixture("requirements", "analysis"), modelId: "analysis:uc-renew" } as DiagramModelSpec;
  const target = { ...collectModelRefs([analysis], true).refs[0]!, diagramKind: "sequence" as const };
  for (const kind of designGenerationKinds) {
    const model = modelFixture("design", kind) as DesignDiagramModelSpec;
    const bindings = collectModelRefs([model], true).refs.map(source => ({ source, targets: [target] }));
    const before = structuredClone({ model, analysis, bindings });
    const issue = diagnostic(() => assertDesignMappings([model], [analysis], bindings));
    assert.equal(issue.code, "mapping-diagram-kind-mismatch", kind);
    assert.equal(issue.path, "designModelTraceability.0.targets.0.diagramKind");
    assert.match(issue.message, /引用类型为 sequence.*实际类型为 analysis/);
    assert.deepEqual(issue.actual, { reference: target, models: [{ modelId: analysis.modelId, diagramKind: "analysis", elementExists: true }], outsideModels: [] });
    assert.deepEqual(issue.expected, { scope: "直接上游模型", legalSources: [{ modelId: analysis.modelId, diagramKind: "analysis", elementIds: ["a", "b", "m"] }] });
    assert.deepEqual({ model, analysis, bindings }, before);
    assert.doesNotThrow(() => assertDesignMappings([model], [analysis], bindings.map(binding => ({ ...binding, targets: [{ ...target, diagramKind: "analysis" }] }))));
  }
});

test("all requirement kinds reject absent IDs and accept any real rule type", () => {
  for (const kind of ["context", "function", "usecase", "class", "activity", "deployment", "prototype"] as const) {
    const model = modelFixture("requirements", kind) as DiagramModelSpec;
    const applicable = { ...rule, type: requirementRuleTypeSchema.options.find(type => requirementTypeAppliesToModel(type, kind))! };
    const inapplicable = { ...rule, id: "wrong-type", type: requirementRuleTypeSchema.options.find(type => !requirementTypeAppliesToModel(type, kind))! };
    const bindings = collectModelRefs([model], true).refs.map(target => ({ ruleId: applicable.id, target }));
    const target = bindings[0]!.target;
    const invalidRule = diagnostic(() => assertRequirementMappings([model], [applicable, inapplicable], [{ ruleId: "missing", target }]));
    assert.equal(invalidRule.code, "mapping-rule-missing", kind);
    assert.equal(invalidRule.path, "requirementModelTraceability.0.ruleId");
    assert.deepEqual(invalidRule.expected, { legalSources: [applicable, inapplicable].map(rule => ({ ruleId: rule.id, type: rule.type, text: rule.text })) });
    assert.doesNotThrow(() => assertRequirementMappings([model], [applicable, inapplicable], bindings.map(binding => ({ ...binding, ruleId: inapplicable.id }))));
    const invalidTarget = diagnostic(() => assertRequirementMappings([model], [applicable], [{ ruleId: applicable.id, target: { ...target, elementId: "invented" } }]));
    assert.equal(invalidTarget.code, "mapping-element-missing");
    assert.equal(invalidTarget.path, "requirementModelTraceability.0.target.elementId");
    assert.doesNotThrow(() => assertRequirementMappings([model], [applicable], bindings));
  }
});

test("reference failures distinguish missing models, ambiguous identities and self references", () => {
  const model = modelFixture("design", "component") as DesignDiagramModelSpec;
  const upstream = modelFixture("design", "class") as DesignDiagramModelSpec;
  const target = collectModelRefs([upstream], true).refs[0]!;
  const source = collectModelRefs([model], true).refs[0]!;
  const issueFor = (changed: typeof target, sources: DesignDiagramModelSpec[] = [upstream]) => diagnostic(() => assertDesignMappings([model], sources, [{ source, targets: [changed] }]));
  assert.equal(issueFor({ ...target, modelId: "missing" }).code, "mapping-model-missing");
  const ambiguous = issueFor({ ...target, modelId: undefined }, [upstream, { ...upstream, modelId: "sibling" }]);
  assert.equal(ambiguous.code, "mapping-reference-ambiguous");
  assert.match(JSON.stringify(ambiguous.expected), /sibling/);
  const self = issueFor(source);
  assert.equal(self.code, "mapping-source-out-of-scope");
  assert.deepEqual((self.actual as any).outsideModels, [{ modelId: model.modelId, diagramKind: model.diagramKind }]);
  assert.doesNotMatch(JSON.stringify(self.expected), /"diagramKind":"component"/);
  const empty = diagnostic(() => assertDesignMappings([model], [upstream], [{ source, targets: [] }]));
  assert.equal(empty.code, "mapping-targets-empty");
  assert.match(JSON.stringify(empty.expected), /order/);
  const noUpstream = issueFor(target, []);
  assert.deepEqual(noUpstream.expected, { scope: "直接上游模型", legalSources: [] });
});

test("legal source catalogs include nested event flows and qualified table IDs in the correct model", () => {
  const model = modelFixture("design", "component") as DesignDiagramModelSpec;
  const usecase = modelFixture("requirements", "usecase");
  if (usecase.diagramKind !== "usecase") throw new Error("fixture");
  usecase.useCases[0]!.eventFlows = [{ id: "main-flow", name: "下单", flowType: "main", steps: [{ order: 1, actor: "actor", actorAction: "提交" }] }];
  const table = modelFixture("design", "table") as DesignDiagramModelSpec;
  const source = collectModelRefs([model], true).refs[0]!;
  const target = collectModelRefs([usecase], true).refs[0]!;
  const unknown = diagnostic(() => assertDesignMappings([model], [usecase, table], [{ source, targets: [{ ...target, modelId: "absent" }] }]));
  const catalog = (unknown.expected as any).legalSources;
  assert.ok(catalog.find((item: any) => item.modelId === usecase.modelId).elementIds.includes("main-flow"));
  assert.ok(catalog.find((item: any) => item.modelId === table.modelId).elementIds.includes("items.id"));
  const missing = diagnostic(() => assertDesignMappings([model], [table], []));
  assert.equal(missing.code, "mapping-coverage-missing");
  assert.ok(missing.elementId); assert.ok(missing.name); assert.ok(missing.reason);
  assert.equal((missing.expected as any).legalSources[0].modelId, table.modelId);
});

test("qualified column IDs match the correct parent table even when column IDs repeat", () => {
  const model = modelFixture("design", "component");
  const upstream = modelFixture("design", "table");
  const target = { modelId: upstream.modelId, diagramKind: "table" as const, elementId: "orders.id", elementKind: "table-column", label: "orders.id" };
  const bindings = collectModelRefs([model], true).refs.map(source => ({ source, targets: [target] }));
  for (const [elementId, elementKind] of [["orders.id", "table-column"], ["items.id", "table-column"], ["items.fk_order", "relational-constraint"]]) {
    assert.doesNotThrow(() => assertDesignMappings([model], [upstream], bindings.map(binding => ({ ...binding, targets: [{ ...target, elementId, elementKind }] }))));
  }
  for (const elementId of ["missing.id", "orders.order"]) {
    assert.throws(() => assertDesignMappings([model], [upstream], bindings.map(binding => ({ ...binding, targets: [{ ...target, elementId }] }))), /targets\.0/);
  }
});

test("requirement mappings also accept real nested IDs while retaining business coverage", () => {
  const model = modelFixture("requirements", "usecase");
  const bindings = collectModelRefs([model], true).refs.map(target => ({ ruleId: rule.id, target }));
  const nested = { ruleId: rule.id, target: { modelId: model.modelId, diagramKind: "usecase" as const, elementId: "discount", elementKind: "extensionPoint", label: "计算优惠" } };
  assert.doesNotThrow(() => assertRequirementMappings([model], [rule], [...bindings, nested]));
  assert.throws(() => assertRequirementMappings([model], [rule], [nested]), /mapping-coverage-missing/);
});
