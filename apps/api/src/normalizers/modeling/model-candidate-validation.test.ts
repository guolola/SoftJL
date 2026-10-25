// Checks unified provenance validation for each artifact family, including derived table views and feasibility estimates.
import assert from "node:assert/strict";
import test from "node:test";
import { collectModelRefs, deriveTableModel, contextDiagramSpecSchema, feasibilityBusinessFlowSchema, completeFeasibilityImplementationPlanSchema, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture, parallelActivityFixture } from "@uml-platform/contracts/testing";
import { assertGeneratedModelCandidate, assertFeasibilityCandidate } from "./model-candidate-validation.js";
import { librarySeatFeasibilityPlan } from "../../runs/demo/fixtures/library-seat-feasibility-fixture.js";
import { repairDiagnostics } from "../structured-output/repair-diagnostics.js";

test("strict table candidates omit derived relationships but must map their real constraint-derived IDs", () => {
  const upstream = modelFixture("design", "class") as DesignDiagramModelSpec;
  const raw = modelFixture("design", "table");
  if (raw.diagramKind !== "table") throw new Error("fixture");
  const derived = deriveTableModel(raw);
  const target = collectModelRefs([upstream], true).refs[0]!;
  const { relationships: _derivedView, ...model } = raw;
  const bindings = collectModelRefs([derived], true).refs.map(source => ({ source, targets: [target] }));
  const validate = (entries: typeof bindings) => assertGeneratedModelCandidate(JSON.stringify({ models: [model], designModelTraceability: entries }), { stage: "design", kinds: ["table"], upstream: [upstream] });
  assert.doesNotThrow(() => validate(bindings));
  assert.throws(() => validate(bindings.filter(binding => binding.source.elementKind !== "relationship")), /mapping-coverage-missing/);
  assert.ok(!("relationships" in model));
});

test("environment sources must belong to the fixed current rules", () => {
  const context = modelFixture("feasibility", "context");
  if (context.diagramKind === "context") context.system.sourceRequirementIds = ["R1"];
  const validate = () => assertFeasibilityCandidate(context, { schema: contextDiagramSpecSchema, kind: "context", rules: [{ id: "R1", type: "functional", text: "用户访问系统" }] });
  assert.doesNotThrow(validate);
  if (context.diagramKind !== "context") throw new Error("fixture");
  context.people[0]!.sourceRequirementIds = ["invented"];
  assert.throws(validate, /mapping-rule-missing.*people.0.sourceRequirementIds.0/);
});

test("implementation validation preserves intangible benefit nulls and rejects nonexistent rule sources", () => {
  const plan = structuredClone(librarySeatFeasibilityPlan);
  const rules = Array.from({ length: 11 }, (_, i) => ({ id: `r${i + 1}`, type: "functional" as const, text: `规则 ${i + 1}` }));
  const validate = () => assertFeasibilityCandidate(plan, { schema: completeFeasibilityImplementationPlanSchema, kind: "implementation", rules });
  assert.doesNotThrow(validate);
  plan.candidates[0]!.sourceRequirementIds = ["absent"];
  assert.throws(validate, /mapping-rule-missing.*candidates.0.sourceRequirementIds.0/);
});

test("source identities are checked while element types and business semantics are unrestricted", () => {
  const model = modelFixture("requirements", "function");
  const rules = [{ id: "R1", type: "functional" as const, text: "用户下单" }];
  const bindings = collectModelRefs([model], true).refs.map(target => ({ ruleId: "R1", target }));
  const validate = () => assertGeneratedModelCandidate(JSON.stringify({ models: [model], requirementModelTraceability: bindings }), { stage: "requirements", kinds: ["function"], rules });
  assert.doesNotThrow(validate);
  bindings[0]!.target.elementKind = "actor";
  assert.doesNotThrow(validate);
  if (model.diagramKind !== "function") throw new Error("fixture");
  model.nodes[1]!.sourceRequirementIds = ["absent"];
  assert.throws(validate, /mapping-rule-missing.*models.0.nodes.1.sourceRequirementIds.0/);
});

test("every identified requirement element needs a mapping, including structural and nested elements", () => {
  const rules = [{ id: "R1", type: "quality" as const, text: "系统质量要求" }];
  for (const kind of ["context", "function", "usecase", "class", "activity", "deployment", "prototype"] as const) {
    const model = modelFixture("requirements", kind);
    const bindings = collectModelRefs([model], true).refs.map(target => ({ ruleId: "R1", target }));
    const validate = (entries: typeof bindings) => assertGeneratedModelCandidate(JSON.stringify({ models: [model], requirementModelTraceability: entries }), { stage: "requirements", kinds: [kind], rules });
    assert.doesNotThrow(() => validate(bindings), kind);
    for (const binding of bindings) assert.throws(() => validate(bindings.filter(entry => entry !== binding)), error => {
      const issue = repairDiagnostics(error).find(issue => issue.code === "mapping-coverage-missing" && issue.elementId === binding.target.elementId);
      assert.ok(issue, `${kind}:${binding.target.elementId}`); assert.ok(issue.name); assert.ok(issue.reason);
      return true;
    });
  }
});

test("vertical requirement flows keep complete provenance and reject object-flow fields before rendering", () => {
  const model = parallelActivityFixture();
  const rules = [{ id: "R1", type: "functional" as const, text: "系统协调履约和结算" }];
  const bindings = collectModelRefs([model], true).refs.map(target => ({ ruleId: "R1", target }));
  const validate = (candidate: unknown, entries = bindings) => assertGeneratedModelCandidate(JSON.stringify({ models: [candidate], requirementModelTraceability: entries }), { stage: "requirements", kinds: ["activity"], rules });
  assert.doesNotThrow(() => validate(model));
  for (const binding of bindings) assert.throws(() => validate(model, bindings.filter(entry => entry !== binding)), /mapping-coverage-missing/);
  const invalid = structuredClone(model) as any;
  invalid.nodes.find((node: any) => node.id === "consume").inputPins = [];
  assert.throws(() => validate(invalid), /inputPins/);
  delete invalid.nodes.find((node: any) => node.id === "consume").inputPins;
  invalid.relationships[0].type = "object_flow";
  assert.throws(() => validate(invalid), /relationships.0.type/);
});

test("analysis branches and activations each require their own real upstream IDs", () => {
  const upstream = modelFixture("requirements", "usecase");
  const model = modelFixture("requirements", "analysis") as any;
  for (const element of [...model.participants, ...model.messages]) element.sourceElementIds = ["case"];
  model.fragments = [{ id: "f", type: "opt", label: "条件", messageIds: ["m"], sourceElementIds: ["case"],
    branches: [{ id: "branch", label: "分支", messageIds: ["m"], sourceElementIds: ["case"] }] }];
  model.activations = [{ id: "activation", participantId: "b", startMessageId: "m", endMessageId: "m", sourceElementIds: ["case"] }];
  const validate = () => assertGeneratedModelCandidate(JSON.stringify({ models: [model], requirementModelTraceability: [] }), { stage: "requirements", kinds: ["analysis"], upstream: [upstream] });
  assert.doesNotThrow(validate);
  delete model.fragments[0].branches[0].sourceElementIds;
  model.activations[0].sourceElementIds = ["invented"];
  assert.throws(validate, error => {
    const diagnostics = repairDiagnostics(error);
    assert.ok(diagnostics.some(issue => issue.elementId === "f.branch" && issue.code === "mapping-coverage-missing"));
    assert.ok(diagnostics.some(issue => issue.elementId === "activation" && issue.code === "mapping-element-missing"));
    return true;
  });
});

test("flow coverage includes system lane, start/end and all edges without target type matching", () => {
  const model = modelFixture("feasibility", "activity");
  const rules = [{ id: "R1", type: "data" as const, text: "保存处理记录" }];
  const traceability = collectModelRefs([model], true).refs.map(ref => ({ requirementId: "R1", targetId: ref.elementId, targetKind: "node" }));
  const validate = () => assertFeasibilityCandidate({ model, traceability }, { schema: feasibilityBusinessFlowSchema, kind: "business-flow", rules });
  assert.doesNotThrow(validate);
  traceability.splice(traceability.findIndex(entry => entry.targetId === "r1"), 1);
  assert.throws(validate, error => {
    const issue = repairDiagnostics(error).find(issue => issue.elementId === "r1");
    assert.equal(issue?.code, "mapping-coverage-missing"); assert.ok(issue?.name); assert.ok(issue?.reason);
    return true;
  });
});

test("an extra fabricated source ID fails even when an element also has a valid mapping", () => {
  const model = modelFixture("requirements", "usecase");
  if (model.diagramKind !== "usecase") throw new Error("fixture");
  model.useCases[0]!.eventFlows = [{ id: "flow", name: "提交", flowType: "main", steps: [{ order: 1, actor: "actor", sourceRequirementId: "invented" }] }];
  const rules = [{ id: "R1", type: "data" as const, text: "保存提交记录" }];
  const bindings = collectModelRefs([model], true).refs.map(target => ({ ruleId: "R1", target }));
  assert.throws(() => assertGeneratedModelCandidate(JSON.stringify({ models: [model], requirementModelTraceability: bindings }), { stage: "requirements", kinds: ["usecase"], rules }), error => {
    const issue = repairDiagnostics(error).find(issue => issue.path.endsWith("sourceRequirementId"));
    assert.equal(issue?.code, "mapping-rule-missing"); assert.equal(issue?.elementId, "case.flow"); assert.ok(issue?.name); assert.ok(issue?.reason);
    return true;
  });
});
