// Exercises saved design-to-requirement traces through source extraction, coding scopes and acceptance tasks.
import assert from "node:assert/strict";
import test from "node:test";
import { designDiagramModelSpecSchema, type ModelElementRef } from "@uml-platform/contracts";
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
  const state = {
    rules: [{ id: "r1", type: "functional" as const, text: "private-rule-body",  }],
    requirementBaseline: {
          schemaVersion: 3, id: "baseline-test", version: 1, sourceInputFingerprint: "test-source-input",
          runId: "test", createdAt: "2026-01-01T00:00:00Z",
          rules: [{ id: "r1", requirementId: "REQ-001",
            text: "借阅成功后保存一条记录", sourceFragment: "private-requirement-body",
            type: "functional" as const,
          }],
        },
    models: { domain: classModel("domain") },
    requirementModelTraceability: [{ ruleId: "r1", target: ref("domain", "loan") }],
  };
  state.rules = state.requirementBaseline.rules.map(({ requirementId, origin, ...rule }) => rule);
  return state;
}

test("every design kind inherits saved acceptance through canonical traces without embedded requirement IDs", () => {
  const base = { title: "借阅设计", summary: "实现借阅", notes: [], relationships: [] };
  const designs = [
    classModel("classes", "service"),
    { ...base, modelId: "architecture", diagramKind: "architecture", packages: [], components: [{ id: "service", name: "LoanService" }] },
    { ...base, modelId: "navigation", diagramKind: "navigation", nodes: [{ id: "service", name: "借阅页", nodeType: "screen" }] },
    { ...base, modelId: "components", diagramKind: "component", components: [{ id: "service", name: "LoanService" }], interfaces: [] },
    { ...base, modelId: "deployment", diagramKind: "deployment", nodes: [{ id: "service", name: "API", nodeType: "node" }], databases: [], components: [], artifacts: [], externalSystems: [] },
    { ...base, modelId: "sequence:UC-001", diagramKind: "sequence", sourceUseCaseId: "UC-001", participants: [{ id: "service", name: "LoanService", participantType: "service" }], messages: [], fragments: [] },
    { ...base, modelId: "tables", diagramKind: "table", tables: [{ id: "loans", name: "loans", columns: [{ id: "id", name: "id", dataType: "uuid" }] }] },
  ].map((model) => designDiagramModelSpecSchema.parse(model));
  const state = {
    ...savedState(), designModels: Object.fromEntries(designs.map((model) => [model.modelId!, model])),
    designModelTraceability: designs.map((model) => ({
      source: ref(model.modelId!, model.diagramKind === "table" ? "loans.id" : "service", model.diagramKind),
      targets: [ref("domain", "loan")],
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
      { source: ref("service", "loan"), targets: [ref("domain", "loan"), ref("storage", "loan")],  },
      { source: ref("storage", "loan"), targets: [ref("missing-domain", "loan"), ref("service", "loan")],  },
    ],
  };
  const context = buildContext(state, { requirementIds: ["REQ-001"], artifactIds: [] });
  assert.ok(context.artifacts.some((artifact) => artifact.id === "design:storage"));
  assert.ok(!context.artifacts.some((artifact) => artifact.id === "design:other"));
  assert.deepEqual(buildImplementationTasks(context.artifacts, context.scope).map((task) => task.id), ["implement:requirement:REQ-001"]);
  state.designModelTraceability[0].targets.push(ref("deleted-design", "loan"));
  const missing = buildImplementationTasks(buildContext(state, whole).artifacts);
  const requirementTask = missing.find((task) => task.id === "implement:requirement:REQ-001")!;
  assert.ok(requirementTask.issues.some((issue) => issue.code === "trace-reference-missing" && issue.message.includes("deleted-design")));
});

test("model IDs cannot attach traces across diagram kinds or analysis and design stages", () => {
  const state = {
    ...savedState(), designModels: { domain: classModel("domain"), wrong: classModel("wrong") },
    designModelTraceability: [
      { source: ref("domain", "loan"), targets: [ref("domain", "loan")] },
      { source: ref("wrong", "loan", "sequence"), targets: [ref("domain", "loan")] },
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

test("singleton references remain valid while ambiguous kinds cannot infer requirement provenance", () => {
  const original = savedState();
  const target = { diagramKind: "class", elementId: "loan", elementKind: "class", label: "Loan" };
  const state = { ...original, requirementModelTraceability: [{ ruleId: "r1", target }] };
  const singleton = extractSourceArtifacts(state);
  assert.ok(singleton.artifacts.find((artifact) => artifact.id === "analysis:domain")!.requirementIds.includes("r1"));
  const ambiguous = extractSourceArtifacts({ ...state, models: { ...state.models, sibling: classModel("sibling") } });
  assert.ok(ambiguous.artifacts.filter((artifact) => artifact.stage === "analysis").every((artifact) => artifact.requirementIds.length === 0));
  assert.ok(ambiguous.issues.some((issue) => issue.includes("未指定唯一模型")));
});

test("obsolete trace metadata and source fingerprints are rejected without mutation", () => {
  const state = savedState();
  const invalidTrace = { ...state, requirementModelTraceability: [{ ...state.requirementModelTraceability[0], confidence: "retired" }] };
  const before = structuredClone(invalidTrace);
  assert.throws(() => extractSourceArtifacts(invalidTrace));
  assert.deepEqual(invalidTrace, before);
  assert.throws(() => extractSourceArtifacts({ ...state, requirementInputFingerprint: "fp:v1:old" }), /Unsupported source fingerprint/);
});
