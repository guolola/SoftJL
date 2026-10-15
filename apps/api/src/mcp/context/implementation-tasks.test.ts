// Verifies source-backed task identity, real element references, readiness and scoped implementation evidence.
import assert from "node:assert/strict";
import test from "node:test";
import {
  mcpImplementationTaskSchema,
  type AtomicRequirement,
  type ModelElementRef,
} from "@uml-platform/contracts";
import { buildImplementationTasks } from "./implementation-tasks.js";
import { buildContext } from "./implementation-context.js";
import { contentHash, type SourceArtifact } from "./source-artifacts.js";

function artifact(id: string, stage: SourceArtifact["stage"], payload: Record<string, unknown>, options: Partial<SourceArtifact> = {}): SourceArtifact {
  return {
    id, stage, title: id, requirementIds: [], dependencies: [],
    sourceConsistency: "unknown", issues: [], payload,
    version: { artifactId: id, contentHash: contentHash(payload), inputFingerprint: "fp:v3:fixture", freshness: "current" },
    ...options,
  };
}
function requirement(id = "BORROW", criteria = ["第5本可借，第6本借阅被拒绝"], sourceRuleId?: string) {
  const value: AtomicRequirement = {
    id, sourceFragment: `${id} 功能`, type: "functional", actor: "学生", subject: "系统", action: "借阅",
    object: "书", condition: null, outcome: "保存借阅记录", confidence: 1, status: "accepted",
    criticality: "high", acceptanceCriteria: criteria, fieldProvenance: {}, ...(sourceRuleId ? { sourceRuleId } : {}),
  };
  return artifact(`requirement:${id}`, "requirements", { requirement: value }, { requirementIds: [id, ...(sourceRuleId ? [sourceRuleId] : [])] });
}
function rule(id: string, requirementIds = [id]) {
  return artifact(`rule:${id}`, "requirements", { rule: { id, category: "业务规则", text: `${id} 原始规则正文`, relatedDiagrams: ["class"] } }, { requirementIds });
}
function classModel(id: string, elementId = "loan", modelId: string | undefined = id) {
  return {
    diagramKind: "class", ...(modelId ? { modelId } : {}), title: id, summary: "借阅职责", notes: [],
    classes: [{ id: elementId, name: "Loan", attributes: [], operations: [] }],
    interfaces: [], enums: [], relationships: [],
  };
}
function ref(modelId: string | undefined, elementId: string, diagramKind: ModelElementRef["diagramKind"] = "class"): ModelElementRef {
  return { ...(modelId ? { modelId } : {}), diagramKind, elementId, elementKind: "class", label: elementId };
}
function modelArtifact(id: string, stage: "analysis" | "design", elementId = "loan", requirementIds = ["BORROW"]) {
  return artifact(`${stage}:${id}`, stage, { model: classModel(id, elementId), traceability: [] }, { requirementIds });
}
const blocking = (task: ReturnType<typeof buildImplementationTasks>[number]) => task.issues.filter((issue) => issue.severity === "blocking");

test("atomic tasks replace their linked rules and preserve source-backed, stable acceptance IDs", () => {
  const first = requirement("BORROW", ["允许第5本", "拒绝第6本", "允许第5本"], "RULE");
  const sources = [first, requirement("RETURN", ["释放借阅额度"], "RULE"), rule("RULE", ["RULE", "BORROW", "RETURN"]), rule("OTHER")];
  const tasks = buildImplementationTasks(sources);
  assert.deepEqual(tasks.map((task) => task.id), ["implement:requirement:BORROW", "implement:requirement:RETURN"]);
  assert.equal(tasks[0].acceptanceCriteria.length, 2);
  assert.ok(tasks[0].acceptanceCriteria.every((criterion) => criterion.sourceArtifactId === first.id));
  assert.ok(tasks.every((task) => blocking(task).some((issue) => issue.code === "design-model-missing")));
  const reordered = buildImplementationTasks([requirement("BORROW", ["拒绝第6本", "允许第5本"], "RULE")])[0];
  assert.deepEqual(reordered.acceptanceCriteria, tasks[0].acceptanceCriteria);
  for (const task of tasks) assert.equal(mcpImplementationTaskSchema.safeParse(task).success, true);
});

test("multiple models of one diagram kind keep real artifact and element identity", () => {
  const loan = modelArtifact("loan-design", "design", "loan-service");
  const other = modelArtifact("other-design", "design", "same-kind-other-element", ["OTHER"]);
  const legacy = modelArtifact("legacy", "design", "legacy-loan");
  legacy.payload.model = classModel("legacy", "legacy-loan", "");
  const tasks = buildImplementationTasks([requirement(), requirement("OTHER"), loan, other, legacy]);
  const task = tasks.find((entry) => entry.id === "implement:requirement:BORROW")!;
  assert.deepEqual(task.designRefs.map((entry) => [entry.artifactId, entry.elementId]), [["design:loan-design", "loan-service"], ["design:legacy", "legacy-loan"]]);
  assert.equal(task.designRefs[1].modelId, undefined);
  assert.ok(!task.sourceArtifactIds.includes(other.id));
  assert.ok(!task.designRefs.some((entry) => entry.elementId === "invented"));
  assert.match(task.guidance.join(" "), /候选设计元素不要求逐个生成代码/);
  assert.match(task.guidance.join(" "), /完整关系边、时序消息/);
  assert.deepEqual(task.dependsOnTaskIds, []);
});

test("linked sources follow a dependency closure while missing sources never become fake references", () => {
  const unrelated = modelArtifact("unrelated", "design", "other", ["OTHER"]);
  const design = modelArtifact("loan", "design");
  design.dependencies = ["analysis:business", "design:shared", "design:deleted"];
  const analysis = modelArtifact("business", "analysis");
  analysis.dependencies = ["requirement:BORROW"];
  const shared = modelArtifact("shared", "design", "shared", []);
  shared.dependencies = [design.id];
  const globals = [
    artifact("requirements:source", "requirements", { text: "明确使用 Java" }),
    artifact("requirements:review", "requirements", {}),
    artifact("feasibility:inputs", "feasibility", { targetEnvironment: "Java" }),
    artifact("feasibility:implementation", "feasibility", {}),
  ];
  const testCase = artifact("test:limit", "tests", { testCase: { id: "limit" } }, { requirementIds: ["BORROW"] });
  const sources = [requirement(), analysis, design, shared, unrelated, testCase, ...globals];
  const task = buildImplementationTasks(sources).find((entry) => entry.id === "implement:requirement:BORROW")!;
  assert.ok(task.sourceArtifactIds.includes(shared.id));
  assert.ok(task.sourceArtifactIds.includes(testCase.id));
  assert.ok(task.sourceArtifactIds.includes("feasibility:inputs"));
  assert.ok(!task.sourceArtifactIds.includes("analysis:business"));
  for (const source of globals.filter((entry) => entry.id !== "feasibility:inputs")) assert.ok(!task.sourceArtifactIds.includes(source.id));
  assert.ok(!task.sourceArtifactIds.includes(unrelated.id));
  assert.ok(!task.sourceArtifactIds.includes("design:deleted"));
  assert.ok(blocking(task).some((issue) => issue.code === "source-dependency-missing"));
});

test("historical acceptance and trace reviews do not block while stale and conflicting saved sources do", () => {
  const accepted = requirement();
  const pending = modelArtifact("pending", "design");
  const value = accepted.payload.requirement as AtomicRequirement;
  value.status = "rejected";
  value.fieldProvenance = { acceptanceCriteria: { source: "ai-suggested", status: "rejected" } };
  pending.payload.traceability = [{ source: ref("pending", "loan"), targets: [ref("business", "borrow-case")], reviewStatus: "pending", rationale: "待确认" }];
  pending.version.freshness = "unknown";
  assert.equal(blocking(buildImplementationTasks([accepted, pending])[0]).length, 0);
  assert.ok(!buildImplementationTasks([accepted, pending])[0].issues.some((issue) => /review|unconfirmed/.test(issue.code)));
  const blockedSources: SourceArtifact[] = [{ ...pending, sourceConsistency: "conflict" }, { ...pending, version: { ...pending.version, freshness: "stale" } }];
  for (const source of blockedSources) assert.ok(blocking(buildImplementationTasks([accepted, source])[0]).length);
});

test("broken design trace sources block without fabricating design references", () => {
  const analysis = modelArtifact("business", "analysis", "borrow-case");
  const design = modelArtifact("loan", "design", "loan-service");
  design.dependencies = [analysis.id];
  design.payload.traceability = [{ source: ref("loan", "missing-service"), targets: [ref("business", "borrow-case")], reviewStatus: "confirmed" }];
  const task = buildImplementationTasks([requirement(), analysis, design])[0];
  assert.ok(blocking(task).some((issue) => issue.code === "trace-reference-missing"));
  assert.deepEqual(task.designRefs.map((entry) => entry.elementId), ["loan-service"]);
  design.payload.traceability = [{ source: ref("loan", "loan-service"), targets: [ref("business", "borrow-case")], reviewStatus: "confirmed" }];
  assert.equal(blocking(buildImplementationTasks([requirement(), analysis, design])[0]).length, 0);
});

test("valid relationship trace refs remain legal and absent sibling models do not poison scoped tasks", () => {
  const analysis = modelArtifact("business", "analysis", "borrow-case");
  const model = classModel("business", "borrow-case");
  analysis.payload.model = { ...model, classes: [...model.classes, { id: "book", name: "Book" }], relationships: [{ id: "borrows", type: "association", sourceId: "borrow-case", targetId: "book" }] };
  const design = modelArtifact("loan", "design", "loan-service");
  design.payload.model = { ...classModel("loan", "loan-service"), classes: [{ id: "loan-service", name: "Loan" }, { id: "book", name: "Book" }], relationships: [{ id: "borrows", type: "association", sourceId: "loan-service", targetId: "book" }] };
  design.payload.traceability = [{ source: { ...ref("loan", "borrows"), elementKind: "relationship" }, targets: [ref("business", "borrows"), ref("outside-scope", "other")], reviewStatus: "confirmed" }];
  const task = buildImplementationTasks([requirement(), analysis, design])[0];
  assert.equal(blocking(task).length, 0);
  assert.deepEqual(task.dependsOnTaskIds, []);
});

test("same-kind requirement provenance does not become a design reference", () => {
  const first = modelArtifact("first", "analysis", "borrow-case");
  const second = modelArtifact("second", "analysis", "borrow-case");
  const design = modelArtifact("loan", "design", "loan-service");
  design.payload.traceability = [{ source: ref("loan", "loan-service"), targets: [ref(undefined, "borrow-case")], reviewStatus: "confirmed" }];
  const task = buildImplementationTasks([requirement(), first, second, design])[0];
  assert.ok(!task.sourceArtifactIds.some((id) => id.startsWith("analysis:")));
  assert.equal(blocking(task).length, 0);
});

test("design trace sources must exist in their owning model even when a sibling has the element", () => {
  const design = modelArtifact("loan", "design", "loan-service");
  const sibling = modelArtifact("sibling", "design", "other-service");
  for (const source of [ref("sibling", "other-service"), ref(undefined, "other-service"), {}, undefined]) {
    design.payload.traceability = [{ source, targets: [ref("business", "borrow-case")], reviewStatus: "confirmed" }];
    const task = buildImplementationTasks([requirement(), design, sibling])[0];
    assert.ok(blocking(task).some((issue) => ["trace-reference-missing", "trace-reference-invalid"].includes(issue.code)));
  }
  design.payload.traceability = [{ source: ref(undefined, "loan-service"), targets: [ref("business", "borrow-case")], reviewStatus: "confirmed" }];
  assert.equal(blocking(buildImplementationTasks([requirement(), design, sibling])[0]).length, 0);
});

test("sequence messages, fragments and activations are legal design trace sources", () => {
  const design = modelArtifact("sequence", "design");
  design.payload.model = {
    diagramKind: "sequence", modelId: "sequence", title: "借阅", summary: "借阅调用", notes: [],
    participants: [{ id: "user", name: "User", participantType: "actor" }, { id: "service", name: "Service", participantType: "service" }],
    messages: [{ id: "request", type: "sync", sourceId: "user", targetId: "service", name: "borrow", parameters: [] }, { id: "result", type: "return", sourceId: "service", targetId: "user", name: "result", parameters: [] }],
    fragments: [{ id: "optional", type: "opt", label: "borrow", messageIds: ["request"] }],
    activations: [{ id: "active", participantId: "service", startMessageId: "request", endMessageId: "result" }],
  };
  design.payload.traceability = ["request", "optional", "active"].map((id) => ({ source: ref("sequence", id, "sequence"), targets: [ref("business", "borrow-case")], reviewStatus: "confirmed" }));
  assert.equal(blocking(buildImplementationTasks([requirement(), design])[0]).length, 0);
});

test("upstream requirement quality stays on the platform while coding validates design and acceptance", () => {
  const quality = artifact("requirements:review", "requirements", {
    qualityReport: {
      status: "blocked", summary: "需要澄清", blockingIssueIds: ["borrow-limit"],
      issues: [{ id: "borrow-limit", requirementId: "BORROW", code: "ambiguity", message: "次数不明确", blocksDownstream: false }],
    },
  });
  const design = modelArtifact("loan", "design", "loan-service", ["BORROW", "RETURN"]);
  const tasks = buildImplementationTasks([requirement(), requirement("RETURN"), quality, design]);
  assert.ok(!tasks[0].issues.some((issue) => issue.code.startsWith("requirement-quality")));
  assert.equal(blocking(tasks[1]).length, 0);
  const global = structuredClone(quality);
  global.payload.qualityReport = { blockingIssueIds: ["unknown-blocker"], issues: [] };
  assert.equal(blocking(buildImplementationTasks([requirement(), global, design])[0]).length, 0);
});

test("raw requirements do not create coding tasks and unlinked designs retain explicit acceptance gaps", () => {
  const raw = artifact("requirements:source", "requirements", { text: "实现图书借阅" });
  raw.version.freshness = "unknown";
  assert.deepEqual(buildImplementationTasks([raw]), []);
  const task = buildImplementationTasks([modelArtifact("orphan", "design")])[0];
  assert.equal(task.id, "implement:design:orphan");
  assert.deepEqual(task.acceptanceCriteria, []);
  assert.deepEqual(task.requirementIds, ["BORROW"]);
  assert.deepEqual(blocking(task).map((issue) => issue.code), ["acceptance-criteria-missing"]);
  assert.deepEqual(buildImplementationTasks([]), []);
  assert.match(task.guidance.join(" "), /不从原始需求自行设计/);
});

test("context functional scopes generate only their requirements and never mutate saved inputs", () => {
  const borrow = requirement();
  const returnRequirement = requirement("RETURN");
  const state = {
    requirementText: "借阅与归还", requirementBaseline: { requirements: [borrow.payload.requirement, returnRequirement.payload.requirement] },
    designModels: {
      borrow: { diagramKind: "architecture", modelId: "borrow", title: "借阅", summary: "借阅模块", notes: [], packages: [], components: [{ id: "loan-service", name: "Loan", sourceRequirementIds: ["BORROW"] }], relationships: [] },
      return: { diagramKind: "architecture", modelId: "return", title: "归还", summary: "归还模块", notes: [], packages: [], components: [{ id: "return-service", name: "Return", sourceRequirementIds: ["RETURN"] }], relationships: [] },
    },
  };
  const before = structuredClone(state);
  const context = buildContext(state, { requirementIds: ["BORROW"], artifactIds: [] });
  const tasks = buildImplementationTasks(context.artifacts);
  assert.deepEqual(tasks.map((task) => task.id), ["implement:requirement:BORROW"]);
  assert.deepEqual(tasks[0].designRefs.map((entry) => entry.elementId), ["loan-service"]);
  assert.deepEqual(state, before);
});


test("duplicate design identities block verification without emitting duplicate mapping candidates", () => {
  const design = modelArtifact("loan", "design");
  design.payload.model = { ...classModel("loan"), classes: [{ id: "loan", name: "Loan" }, { id: "loan", name: "AnotherLoan" }] };
  const task = buildImplementationTasks([requirement(), design])[0];
  assert.ok(blocking(task).some((issue) => issue.code === "design-element-ambiguous"));
  assert.equal(task.designRefs.length, 1);
  assert.equal(mcpImplementationTaskSchema.safeParse(task).success, true);
});

test("derived implementation artifacts never become original task sources", () => {
  const derived = artifact("implementation:borrow", "implementation", {}, { requirementIds: ["BORROW"] });
  const task = buildImplementationTasks([requirement(), derived])[0];
  assert.deepEqual(task.sourceArtifactIds, ["requirement:BORROW"]);
});

test("explicit requirement scope does not authorize requirements discovered through dependency closure", () => {
  const first = requirement("FIRST", ["完成首个功能"], "SHARED");
  const second = requirement("SECOND", ["完成第二个功能"], "SHARED");
  const shared = rule("SHARED", ["SHARED", "FIRST", "SECOND"]);
  shared.dependencies = [first.id, second.id];
  const design = modelArtifact("first", "design", "first-service", ["FIRST"]);
  design.dependencies = [first.id, second.id];
  const task = buildImplementationTasks([first, second, shared, design], { requirementIds: ["FIRST"], artifactIds: [] });
  assert.deepEqual(task.map((entry) => entry.id), ["implement:requirement:FIRST"]);
  assert.ok(task[0].sourceArtifactIds.includes(second.id));
  assert.deepEqual(task[0].acceptanceCriteria.map((criterion) => criterion.text), ["完成首个功能"]);
});

test("artifact and requirement scopes combine explicitly while derived task ids do not expand source identity", () => {
  const first = requirement("FIRST");
  const second = requirement("SECOND");
  const design = modelArtifact("first", "design", "first-service", ["FIRST"]);
  const sources = [first, second, design];
  assert.deepEqual(buildImplementationTasks(sources, { requirementIds: [], artifactIds: [design.id] }).map((task) => task.id), ["implement:requirement:FIRST"]);
  assert.equal(buildImplementationTasks(sources, { requirementIds: ["SECOND"], artifactIds: [design.id] }).length, 2);
  assert.equal(buildImplementationTasks(sources, { requirementIds: [], artifactIds: ["implementation:tasks"] }).length, 2);
});
