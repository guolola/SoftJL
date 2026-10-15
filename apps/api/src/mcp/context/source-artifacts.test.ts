// Exercises saved design-to-requirement traces through source extraction, coding scopes and acceptance tasks.
import assert from "node:assert/strict";
import test from "node:test";
import { designDiagramModelSpecSchema, type AtomicRequirement, type ModelElementRef } from "@uml-platform/contracts";
import { extractSourceArtifacts } from "./source-artifacts.js";
import { buildContext } from "./implementation-context.js";
import { buildImplementationTasks } from "./implementation-tasks.js";

const whole = { requirementIds: [], artifactIds: [] };
const ref = (modelId: string, elementId: string, diagramKind: ModelElementRef["diagramKind"] = "class"): ModelElementRef =>
  ({ modelId, elementId, diagramKind, elementKind: "class", label: elementId });
const classModel = (modelId: string, elementId = "loan") => ({
  modelId, diagramKind: "class", title: modelId, summary: "借阅职责", notes: [],
  classes: [{ id: elementId, name: "Loan", attributes: [], operations: [] }], interfaces: [], enums: [], relationships: [],
});
function savedState() {
  const requirement: AtomicRequirement = {
    id: "REQ-001", sourceRuleId: "r1", sourceFragment: "private-requirement-body", type: "functional",
    actor: "学生", subject: "系统", action: "借阅", object: "图书", condition: null, outcome: "保存记录",
    confidence: 1, status: "accepted", criticality: "high", acceptanceCriteria: ["借阅成功后保存一条记录"], fieldProvenance: {},
  };
  return {
    rules: [{ id: "r1", category: "功能需求", text: "private-rule-body", relatedDiagrams: ["class"] }],
    requirementBaseline: { requirements: [requirement] },
    models: { domain: classModel("domain") },
    requirementModelTraceability: [{ ruleId: "r1", target: ref("domain", "loan"), reviewStatus: "confirmed" }],
  };
}

test("every design kind inherits saved acceptance through canonical traces without embedded requirement IDs", () => {
  const base = { title: "借阅设计", summary: "实现借阅", notes: [], relationships: [] };
  const designs = [
    classModel("classes", "service"),
    { ...base, modelId: "architecture", diagramKind: "architecture", packages: [], components: [{ id: "service", name: "LoanService" }] },
    { ...base, modelId: "navigation", diagramKind: "navigation", nodes: [{ id: "service", name: "借阅页", nodeType: "screen" }] },
    { ...base, modelId: "components", diagramKind: "component", components: [{ id: "service", name: "LoanService" }], interfaces: [] },
    { ...base, modelId: "deployment", diagramKind: "deployment", nodes: [{ id: "service", name: "API", nodeType: "node" }], databases: [], components: [], artifacts: [], externalSystems: [] },
    { ...base, modelId: "sequence:UC-001", diagramKind: "sequence", participants: [{ id: "service", name: "LoanService", participantType: "service" }], messages: [], fragments: [] },
    { ...base, modelId: "tables", diagramKind: "table", tables: [{ id: "loans", name: "loans", columns: [{ id: "id", name: "id", dataType: "uuid" }] }] },
  ].map((model) => designDiagramModelSpecSchema.parse(model));
  const state = {
    ...savedState(), designModels: Object.fromEntries(designs.map((model) => [model.modelId!, model])),
    designModelTraceability: designs.map((model) => ({
      source: ref(model.modelId!, model.diagramKind === "table" ? "loans.id" : "service", model.diagramKind),
      targets: [ref("domain", "loan")], reviewStatus: "confirmed",
    })),
  };
  const before = structuredClone(state);
  const extracted = extractSourceArtifacts(state);
  for (const design of extracted.artifacts.filter((artifact) => artifact.stage === "design")) {
    assert.deepEqual(design.requirementIds, ["REQ-001", "r1"]);
    assert.ok(design.dependencies.includes("analysis:domain"));
    assert.equal((design.payload.traceability as unknown[]).length, 1);
  }
  for (const scope of [whole, { requirementIds: ["REQ-001"], artifactIds: [] }, { requirementIds: [], artifactIds: ["design:tables"] }]) {
    const context = buildContext(state, scope);
    const tasks = buildImplementationTasks(context.artifacts, context.scope);
    assert.deepEqual(tasks.map((task) => task.id), ["implement:requirement:REQ-001"]);
    assert.equal(tasks[0].acceptanceCriteria.length, 1);
    assert.deepEqual(tasks[0].issues.filter((issue) => issue.severity === "blocking"), []);
    assert.equal(tasks[0].sourceArtifactIds.filter((id) => id.startsWith("design:")).length, scope.artifactIds.length ? 1 : designs.length);
    assert.ok(context.artifacts.every((artifact) => artifact.stage !== "analysis"));
    assert.doesNotMatch(JSON.stringify(context), /private-requirement-body|private-rule-body/);
  }
  assert.deepEqual(state, before);
});

test("upstream design references preserve dependency closure and missing refs remain blocking", () => {
  const state = {
    ...savedState(), designModels: { service: classModel("service"), storage: classModel("storage"), other: classModel("other") },
    designModelTraceability: [
      { source: ref("service", "loan"), targets: [ref("domain", "loan")], upstreamDesignRefs: [ref("storage", "loan")], reviewStatus: "confirmed" },
      { source: ref("storage", "loan"), targets: [ref("missing-domain", "loan")], upstreamDesignRefs: [ref("service", "loan")], reviewStatus: "confirmed" },
    ],
  };
  const context = buildContext(state, { requirementIds: ["REQ-001"], artifactIds: [] });
  assert.ok(context.artifacts.some((artifact) => artifact.id === "design:storage"));
  assert.ok(!context.artifacts.some((artifact) => artifact.id === "design:other"));
  assert.deepEqual(buildImplementationTasks(context.artifacts, context.scope).map((task) => task.id), ["implement:requirement:REQ-001"]);
  state.designModelTraceability[0].upstreamDesignRefs.push(ref("deleted-design", "loan"));
  const missing = buildImplementationTasks(buildContext(state, whole).artifacts);
  const requirementTask = missing.find((task) => task.id === "implement:requirement:REQ-001")!;
  assert.ok(requirementTask.issues.some((issue) => issue.code === "trace-reference-missing" && issue.message.includes("deleted-design")));
});

test("model IDs cannot attach traces across diagram kinds or analysis and design stages", () => {
  const state = {
    ...savedState(), designModels: { domain: classModel("domain"), wrong: classModel("wrong") },
    designModelTraceability: [
      { source: ref("domain", "loan"), targets: [ref("domain", "loan")], reviewStatus: "confirmed" },
      { source: ref("wrong", "loan", "sequence"), targets: [ref("domain", "loan")], reviewStatus: "confirmed" },
    ],
  };
  const designs = extractSourceArtifacts(state).artifacts.filter((artifact) => artifact.stage === "design");
  assert.deepEqual(designs.find((artifact) => artifact.id === "design:domain")?.requirementIds, ["REQ-001", "r1"]);
  const wrong = designs.find((artifact) => artifact.id === "design:wrong")!;
  assert.deepEqual(wrong.requirementIds, []);
  assert.deepEqual(wrong.payload.traceability, []);
  const task = buildImplementationTasks(buildContext(state, whole).artifacts).find((entry) => entry.id === "implement:design:wrong")!;
  assert.ok(task.issues.some((issue) => issue.code === "acceptance-criteria-missing"));
});
