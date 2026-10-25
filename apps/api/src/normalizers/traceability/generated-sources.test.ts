// Covers scoped repair evidence for mapping envelopes rejected before reference validation.
import assert from "node:assert/strict";
import test from "node:test";
import { collectModelRefs, type DiagramModelSpec, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import { repairDiagnostics } from "../structured-output/repair-diagnostics.js";
import { readGeneratedDesignSources, readGeneratedRequirementSources } from "./generated-sources.js";

function diagnostics(action: () => unknown) {
  try { action(); } catch (error) { return repairDiagnostics(error); }
  assert.fail("invalid source declarations must be rejected");
}

test("source readers reject retired mapping annotations without rewriting or merging them", () => {
  const model = modelFixture("design", "component");
  const upstream = modelFixture("design", "class");
  const source = collectModelRefs([model]).refs[0]!;
  const target = collectModelRefs([upstream]).refs[0]!;
  for (const annotation of [{ mappingSource: "llm" }, { rationale: "说明" }, { upstreamDesignRefs: [target] }]) {
    const design = [{ source, targets: [target], ...annotation }];
    const requirement = [{ ruleId: "r1", target, ...annotation }];
    const before = structuredClone({ design, requirement });
    assert.throws(() => readGeneratedDesignSources(design, [model], [upstream]), /Unrecognized key/);
    assert.throws(() => readGeneratedRequirementSources(requirement, [], []), /Unrecognized key/);
    assert.deepEqual({ design, requirement }, before);
  }
});

test("empty and missing design targets include the real upstream design model rather than the output", () => {
  const model = modelFixture("design", "component") as DesignDiagramModelSpec;
  const upstream = modelFixture("design", "class") as DesignDiagramModelSpec;
  const source = collectModelRefs([model]).refs[0]!;
  for (const targets of [undefined, []]) {
    const [issue] = diagnostics(() => readGeneratedDesignSources([{ source, targets }], [model], [upstream]));
    assert.equal(issue!.path, "designModelTraceability.0.targets");
    assert.deepEqual((issue!.expected as any).legalSources, [{ modelId: upstream.modelId, diagramKind: "class", elementIds: ["order", "item", "r"] }]);
    assert.doesNotMatch(JSON.stringify(issue!.expected), /"diagramKind":"component"/);
  }
  const [envelope] = diagnostics(() => readGeneratedDesignSources(undefined, [model], [upstream]));
  assert.equal(envelope!.path, "designModelTraceability");
  assert.equal((envelope!.expected as any).currentModels[0].diagramKind, "component");
  assert.equal((envelope!.expected as any).legalSources[0].diagramKind, "class");
});

test("invalid reference schema keeps the received type and actual matching model identity", () => {
  const model = modelFixture("design", "sequence") as DesignDiagramModelSpec;
  const upstream = { ...modelFixture("requirements", "analysis"), modelId: "analysis:renew" } as DiagramModelSpec;
  const target = { ...collectModelRefs([upstream]).refs[0]!, diagramKind: "sequence-diagram" };
  const entries = [{ source: collectModelRefs([model]).refs[0]!, targets: [target] }];
  const before = structuredClone(entries);
  const [issue] = diagnostics(() => readGeneratedDesignSources(entries, [model], [upstream]));
  assert.equal(issue!.path, "designModelTraceability.0.targets.0.diagramKind");
  assert.equal((issue!.actual as any).value, "sequence-diagram");
  assert.deepEqual((issue!.actual as any).models, [{ modelId: upstream.modelId, diagramKind: "analysis" }]);
  assert.deepEqual((issue!.expected as any).legalSources[0].elementIds, ["a", "b", "m"]);
  assert.deepEqual(entries, before);
});

test("missing requirement declarations and rule IDs receive all real input rules", () => {
  const model = modelFixture("requirements", "function") as DiagramModelSpec;
  const rules = [{ id: "valid", type: "functional" as const, text: "用户可以下单" }, { id: "not-for-function", type: "data" as const, text: "订单数据约束" }];
  for (const entries of [undefined, [{ target: collectModelRefs([model]).refs[0]! }]]) {
    const [issue] = diagnostics(() => readGeneratedRequirementSources(entries, [model], rules));
    assert.equal(issue!.path, entries ? "requirementModelTraceability.0.ruleId" : "requirementModelTraceability");
    assert.deepEqual((issue!.expected as any).legalRuleSources, [{ modelId: model.modelId, diagramKind: "function", rules: rules.map(rule => ({ ruleId: rule.id, type: rule.type, text: rule.text })) }]);
    assert.match(JSON.stringify(issue!.expected), /not-for-function/);
  }
});
