// Verifies one repair protocol protects artifact versions, candidate boundaries and complete validated outputs.
import assert from "node:assert/strict";
import test from "node:test";
import { validateModelInput, diagramModelsResultSchema, feasibilityBusinessFlowSchema, MAX_GENERATION_REPAIR_ATTEMPTS, createRequirementBaselineSnapshot, designDiagramModelsResultSchema, ModelSemanticError, snapshotInputFingerprint } from "@uml-platform/contracts";
import { buildGenerateDesignModelsPrompt, modelTaskSourcePrompt } from "@uml-platform/prompts";
import { modelFixture } from "../../../../../../packages/contracts/src/testing/model-fixtures.js";
import { GenerationRepairSession } from "./generation-repair.js";
import { restoreJsonPunctuation } from "../../../normalizers/structured-output/repair-patch.js";

test("global design repair retains the baseline even after a parseable draft exists", () => {
  const baseline = createRequirementBaselineSnapshot({ runId: "repair", requirementText: "保存失败必须回滚", rules: [
    { id: "r1", type: "business-rule" as const, text: "保存失败必须回滚",  },
  ] });
  const initial = buildGenerateDesignModelsPrompt(baseline, [], [], ["class"]);
  const session = new GenerationRepairSession("class", modelTaskSourcePrompt(initial), ["models"], 5, initial, designDiagramModelsResultSchema);
  session.accept('{"models":[],"designModelTraceability":[]}');
  const repair = session.prepare(new Error("缺少请求的设计模型"));
  assert.equal(session.metadata.mode, "scoped-regeneration");
  assert.match(repair, /保存失败必须回滚/);
  assert.match(repair, /RequirementBaseline/);
});

test("local JSON punctuation recovery preserves complete values and refuses incomplete strings and values", () => {
  assert.equal(restoreJsonPunctuation('{"items":["a","b",],'), '{"items":["a","b",],');
  assert.deepEqual(JSON.parse(restoreJsonPunctuation('{"items":["a","b",]')), { items: ["a", "b"] });
  for (const raw of ['{"name":"unfinished', '{"value":', '{"value":tru', '{"actors":[', '{"implementation":{']) assert.equal(restoreJsonPunctuation(raw), raw);
});

test("model repair uses a local field scope, validates versions and does not resend original upstreams", () => {
  const value = { models: [{ modelId: "generated-class", diagramKind: "class", classes: [{ id: "a", name: "A" }, { id: "b", name: "B" }], relationships: [{ id: "r", sourceId: "a", targetId: "missing" }], notes: ["UNCHANGED_BUSINESS_BOUNDARY"] }] };
  const session = new GenerationRepairSession("class", { source: "LARGE_UPSTREAM".repeat(1000) }, ["models"], 2);
  session.accept(JSON.stringify(value));
  const prompt = session.prepare(new Error("[missing-endpoint] relationships.0: 关系终点不存在"));
  assert.ok(!prompt.includes("LARGE_UPSTREAM"));
  assert.ok(!prompt.includes("UNCHANGED_BUSINESS_BOUNDARY"));
  assert.ok(prompt.includes('"targetId":"missing"'));
  const patch = { targetId: "class", baseFingerprint: snapshotInputFingerprint(value), changes: [{ path: "models.0.relationships.0.targetId", value: "b" }] };
  assert.throws(() => session.accept(JSON.stringify({ ...patch, baseFingerprint: "stale" })), /基础版本/);
  session.prepare(new Error("invalid patch"));
  assert.throws(() => session.accept(JSON.stringify({ ...patch, changes: [{ path: "models.0.notes", value: [] }] })), /允许范围/);
  const accepted = JSON.parse(session.accept(JSON.stringify(patch)));
  assert.equal(accepted.models[0].relationships[0].targetId, "b");
  assert.deepEqual(accepted.models[0].notes, value.models[0].notes);
  assert.throws(() => session.prepare(new Error("third repair")), /2 次/);
});

test("the default budget allows five repairs and refuses a sixth", () => {
  const session = new GenerationRepairSession("one", {}, ["models"]);
  session.accept('{"models":[{"diagramKind":"sequence"}]}');
  for (let round = 1; round <= MAX_GENERATION_REPAIR_ATTEMPTS; round++) {
    session.prepare(new Error("models.0.title: required"));
    assert.equal(session.metadata.round, round);
  }
  assert.throws(() => session.prepare(new Error("still invalid")), /5 次/);
});

test("missing fields on a second model retain their absolute position and array element contract", () => {
  const value = { models: [{ diagramKind: "sequence", modelId: "sequence:first", messages: [], notes: ["KEEP_FIRST_MODEL"] },
    { diagramKind: "sequence", modelId: "sequence:second", messages: [{ id: "m1", sourceId: "a", targetId: "b", type: "return", name: "返回结果" }] }] };
  const session = new GenerationRepairSession("sequence:second", {}, ["models"], 5, undefined, designDiagramModelsResultSchema);
  session.accept(JSON.stringify(value));
  const prompt = session.prepare(new ModelSemanticError([{ modelId: "sequence:second", diagramKind: "sequence", code: "contract",
    path: "messages.0.parameters", responsePath: "models.1.messages.0.parameters", message: "Required", severity: "error" }]));
  assert.deepEqual(session.metadata.paths, ["models.1.messages.0.parameters"]);
  assert.match(prompt, /"expectedSchema":\{"type":"array","items":\{"type":"string"/);
  assert.match(prompt, /"actualType":"missing"/);
  assert.doesNotMatch(prompt, /KEEP_FIRST_MODEL/);
  const result = JSON.parse(session.accept(JSON.stringify({ targetId: "sequence:second", baseFingerprint: snapshotInputFingerprint(value),
    changes: [{ path: "models.1.messages.0.parameters", value: [] }] })));
  assert.deepEqual(result.models[0], value.models[0]);
  assert.deepEqual(result.models[1].messages[0].parameters, []);
});

test("activation correction receives ordered message identities and branch membership without full business content", () => {
  const session = new GenerationRepairSession("sequence:one", { other: "UNRELATED_SOURCE" });
  session.accept(JSON.stringify({ models: [{ modelId: "sequence:one", diagramKind: "sequence", notes: ["UNRELATED_NOTES"],
    messages: [{ id: "m1", sourceId: "a", targetId: "b", description: "LONG_BUSINESS_MESSAGE" }, { id: "m2", sourceId: "b", targetId: "a" }],
    fragments: [{ id: "f", type: "alt", messageIds: ["m1", "m2"], branches: [{ id: "yes", messageIds: ["m1"] }, { id: "no", messageIds: ["m2"] }] }],
    activations: [{ id: "a1", participantId: "b", startMessageId: "m1", endMessageId: "m2" }] }] }));
  const prompt = session.prepare(new Error("[activation-branch] activations: 激活必须在同一分支中结束"));
  assert.match(prompt, /structuralContext/);
  assert.match(prompt, /"branches":\[\{"id":"yes","messageIds":\["m1"\]/);
  assert.deepEqual(session.metadata.paths, ["models.0.activations"]);
  assert.doesNotMatch(prompt, /UNRELATED_SOURCE|UNRELATED_NOTES|LONG_BUSINESS_MESSAGE/);
});

test("implementation patch cannot edit another candidate and omits that candidate from prompt", () => {
  const plan = { candidates: [{ name: "selected", implementation: { costs: [{ id: "cost", minimum: "bad", maximum: 100 }] } }, { name: "OTHER_CANDIDATE", implementation: { costs: [{ minimum: 10 }] } }] };
  const session = new GenerationRepairSession("implementation", {}, []);
  session.accept(JSON.stringify(plan));
  const prompt = session.prepare(new Error("invalid amount"), { paths: ["candidates.0.implementation.costs.0.minimum"] });
  assert.ok(!prompt.includes("OTHER_CANDIDATE"));
  const patch = { targetId: "implementation", baseFingerprint: snapshotInputFingerprint(plan), changes: [{ path: "candidates.1.name", value: "overwritten" }] };
  assert.throws(() => session.accept(JSON.stringify(patch)), /允许范围/);
  const accepted = JSON.parse(session.accept(JSON.stringify({ ...patch, changes: [{ path: "candidates.0.implementation.costs.0.minimum", value: 50 }] })));
  assert.deepEqual(accepted.candidates[1], plan.candidates[1]);
});

test("document patch keeps directory and unrelated paragraphs immutable", () => {
  const document = { sections: [{ title: "引言", level: 1, body: ["待补充"] }, { title: "边界", level: 1, body: ["不得删除历史记录"] }] };
  const session = new GenerationRepairSession("document:chapter:1", {}, ["sections"]);
  session.accept(JSON.stringify(document));
  session.prepare(new Error("placeholder"), { paths: ["sections.0.body"] });
  const base = { targetId: "document:chapter:1", baseFingerprint: snapshotInputFingerprint(document) };
  for (const path of ["sections.0.title", "sections.1.body", "sections.0.__proto__.polluted"]) assert.throws(() => session.accept(JSON.stringify({ ...base, changes: [{ path, value: "wrong" }] })));
  const result = JSON.parse(session.accept(JSON.stringify({ ...base, changes: [{ path: "sections.0.body", value: ["系统用于处理订单。"] }] })));
  assert.deepEqual(result.sections[1], document.sections[1]);
});


test("prototype endpoint repair receives node kinds and the authoritative legal endpoint matrix", () => {
  const model = modelFixture("requirements", "prototype");
  if (model.diagramKind !== "prototype") throw new Error("fixture");
  model.nodes.push({ id: "module", name: "配置模块", nodeType: "module", sourceUseCaseIds: [], sourceRequirementIds: [] },
    { id: "entry", name: "控制面板入口", nodeType: "entry-point", sourceUseCaseIds: [], sourceRequirementIds: [] });
  model.relationships.unshift({ id: "open-config", type: "opens", sourceId: "entry", targetId: "module" });
  const value = { models: [model], requirementModelTraceability: [] };
  const session = new GenerationRepairSession("prototype", {}, ["models"], 5, undefined, diagramModelsResultSchema);
  session.accept(JSON.stringify(value));
  const prompt = session.prepare(new ModelSemanticError(validateModelInput(model, "requirements").map(issue => ({ ...issue, responsePath: `models.0.${issue.path}` }))));
  assert.match(prompt, /"nodeType":"entry-point"/);
  assert.match(prompt, /"type":"opens","sourceKind":"entry-point","targetKind":"screen"/);
  assert.doesNotMatch(prompt, /"type":"opens","sourceKind":"entry-point","targetKind":"module"/);
  assert.match(prompt, /必须修复端点引用，不能只切换关系类型/);
  const candidate = JSON.parse(session.accept(JSON.stringify({ targetId: "prototype", baseFingerprint: snapshotInputFingerprint(value), changes: [
    { path: "models.0.relationships.0.targetId", value: "a" },
  ] })));
  assert.deepEqual(validateModelInput(candidate.models[0], "requirements"), []);
  assert.deepEqual(candidate.models[0].nodes, model.nodes);
});


test("activity retry convergence repairs nodes and edges together while preserving other fields", async () => {
  const { normalizeFeasibilityBusinessFlow } = await import("../../../normalizers/feasibility/business-flow-normalizer.js");
  const value = { model: { diagramKind: "activity", modelId: "feasibility-business-flow", title: "业务流程图", summary: "电话接通则结束，否则重拨", notes: ["KEEP_BUSINESS_NOTES"],
    swimlanes: [{ id: "system", name: "目标系统" }], nodes: [
      { id: "start", type: "start" }, { id: "dial", type: "activity", name: "首次拨号", actorOrLane: "system", input: [], output: [] },
      { id: "connected", type: "decision", question: "电话是否接通" }, { id: "redial", type: "activity", name: "重拨", actorOrLane: "system", input: [], output: [] }, { id: "end", type: "end" }],
    relationships: [{ id: "start-dial", type: "control_flow", sourceId: "start", targetId: "dial" }, { id: "dial-check", type: "control_flow", sourceId: "dial", targetId: "connected" },
      { id: "yes", type: "control_flow", sourceId: "connected", targetId: "end", guard: "接通" }, { id: "no", type: "control_flow", sourceId: "connected", targetId: "redial", guard: "未接通" }, { id: "retry", type: "control_flow", sourceId: "redial", targetId: "connected" }] },
    traceability: [{ requirementId: "r1", targetId: "dial", targetKind: "node" }] };
  let error: unknown;
  try { normalizeFeasibilityBusinessFlow(value, new Set(["r1"])); } catch (failure) { error = failure; }
  assert.ok(error instanceof ModelSemanticError);
  const session = new GenerationRepairSession("activity", {}, [], 5);
  session.accept(JSON.stringify(value));
  const prompt = session.prepare(error);
  assert.deepEqual(session.metadata.paths, ["model.nodes", "model.relationships"]);
  assert.match(prompt, /先用 merge 汇合/);
  assert.match(prompt, /"incoming":\["dial-check","retry"\]/);
  assert.throws(() => session.accept(JSON.stringify({ targetId: "activity", baseFingerprint: snapshotInputFingerprint(value), changes: [{ path: "model.notes", value: [] }] })), /允许范围/);
  const nodes = [...value.model.nodes, { id: "merge", type: "merge" }];
  const relationships = [...value.model.relationships.map(edge => edge.targetId === "connected" ? { ...edge, targetId: "merge" } : edge), { id: "merge-check", type: "control_flow", sourceId: "merge", targetId: "connected" }];
  const repaired = JSON.parse(session.accept(JSON.stringify({ targetId: "activity", baseFingerprint: snapshotInputFingerprint(value), changes: [{ path: "model.nodes", value: nodes }, { path: "model.relationships", value: relationships }] })));
  assert.doesNotThrow(() => normalizeFeasibilityBusinessFlow(repaired, new Set(["r1"])));
  assert.deepEqual(repaired.model.notes, value.model.notes);
  assert.deepEqual(repaired.traceability, value.traceability);
  assert.deepEqual(repaired.model.relationships.filter((edge: any) => edge.guard).map((edge: any) => edge.guard), ["接通", "未接通"]);
});

test("business flow duplicate IDs repair the real lane and references in one round", async () => {
  const { normalizeFeasibilityBusinessFlow } = await import("../../../normalizers/feasibility/business-flow-normalizer.js");
  const model = modelFixture("feasibility", "activity");
  if (model.diagramKind !== "activity") throw new Error("fixture");
  model.swimlanes.push({ id: "external_tool", name: "第三方工具/API" });
  model.nodes.splice(2, 0, { id: "external_tool", type: "activity", name: "执行外部工具", actorOrLane: "external_tool", input: [], output: [] });
  model.relationships[1]!.targetId = "external_tool";
  model.relationships.push({ id: "r3", type: "control_flow", sourceId: "external_tool", targetId: "end" });
  const value = { model, traceability: [{ requirementId: "r1", targetId: "external_tool", targetKind: "node" }] };
  let error: unknown;
  try { normalizeFeasibilityBusinessFlow(value, new Set(["r1"])); } catch (failure) { error = failure; }
  assert.ok(error instanceof ModelSemanticError);
  const session = new GenerationRepairSession("activity", {}, [], 5, undefined, feasibilityBusinessFlowSchema);
  session.accept(JSON.stringify(value));
  session.prepare(error, { paths: error.diagnostics.map(issue => issue.responsePath!) });
  assert.deepEqual(session.metadata.paths, ["model.swimlanes.1.id", "model.nodes.2.actorOrLane"]);
  const base = { targetId: "activity", baseFingerprint: snapshotInputFingerprint(value) };
  assert.throws(() => session.accept(JSON.stringify({ ...base, changes: [{ path: "model.notes", value: [] }] })), /允许范围/);
  const repaired = JSON.parse(session.accept(JSON.stringify({ ...base, changes: [
    { path: "model.swimlanes.1.id", value: "lane_external_tool" },
    { path: "model.nodes.2.actorOrLane", value: "lane_external_tool" },
  ] })));
  assert.doesNotThrow(() => normalizeFeasibilityBusinessFlow(repaired, new Set(["r1"])));
  assert.deepEqual(repaired.model.relationships, value.model.relationships);
  assert.deepEqual(repaired.traceability, value.traceability);
});

test("unresolvable diagnostic parents widen only to the owning model and stay recoverable", () => {
  const first = { ...modelFixture("design", "class"), modelId: "first", title: "PRIVATE_SIBLING_MODEL" };
  const second = { ...modelFixture("design", "class"), modelId: "second" };
  const value = { models: [first, second], designModelTraceability: [] };
  const session = new GenerationRepairSession("second", {}, ["models"], 5, undefined, designDiagramModelsResultSchema);
  session.accept(JSON.stringify(value));
  const prompt = session.prepare(new ModelSemanticError([{ modelId: "second", diagramKind: "class", code: "contract", path: "unknown.86.id", responsePath: "models.1.unknown.86.id", message: "invalid diagnostic location", severity: "error" }]));
  assert.deepEqual(session.metadata.paths, ["models.1"]);
  assert.doesNotMatch(prompt, /PRIVATE_SIBLING_MODEL/);
  assert.match(session.metadata.reason!, /路径/);
  session.prepare(new Error("修复补丁的父路径不存在"));
  assert.deepEqual(session.metadata.paths, ["models.1"]);
  const base = { targetId: "second", baseFingerprint: snapshotInputFingerprint(value) };
  assert.throws(() => session.accept(JSON.stringify({ ...base, changes: [{ path: "models.0.title", value: "overwrite" }] })), /允许范围/);
  const result = JSON.parse(session.accept(JSON.stringify({ ...base, changes: [{ path: "models.1", value: second }] })));
  assert.deepEqual(result.models[0], first);
});

test("envelope-level schema errors select explicit regeneration instead of an invalid empty path", () => {
  const session = new GenerationRepairSession("class", {}, ["models"]);
  session.accept('{"models":[]}');
  session.prepare({ issues: [{ path: [], message: "invalid envelope" }] });
  assert.equal(session.metadata.mode, "scoped-regeneration");
  assert.deepEqual(session.metadata.paths, ["models"]);
});

test("identifier repairs can update their own design source without changing upstream or sibling mappings", () => {
  const first = modelFixture("design", "component");
  const second = { ...modelFixture("design", "component"), modelId: "second" };
  if (second.diagramKind !== "component") throw new Error("fixture");
  second.interfaces[0]!.id = "c";
  const ref = (modelId: string) => ({ modelId, diagramKind: "component", elementId: "c", elementKind: "interface", label: "接口" });
  const value = { models: [first, second], designModelTraceability: [{ source: ref("component"), targets: [ref("upstream")] }, { source: ref("second"), targets: [ref("upstream")] }] };
  const session = new GenerationRepairSession("second", {}, ["models", "designModelTraceability"], 5, undefined, designDiagramModelsResultSchema);
  session.accept(JSON.stringify(value));
  session.prepare(new ModelSemanticError(validateModelInput(second, "design").map(issue => ({ ...issue, responsePath: `models.1.${issue.path}` }))));
  assert.ok(session.metadata.paths.includes("designModelTraceability.1.source.elementId"));
  const base = { targetId: "second", baseFingerprint: snapshotInputFingerprint(value) };
  for (const path of ["designModelTraceability.0.source.elementId", "designModelTraceability.1.targets.0.elementId", "models.0.interfaces.0.id"]) {
    assert.throws(() => session.accept(JSON.stringify({ ...base, changes: [{ path, value: "wrong" }] })), /允许范围/);
  }
  const malformed = new GenerationRepairSession("second", {}, ["models", "designModelTraceability"]);
  malformed.accept(JSON.stringify({ ...value, designModelTraceability: { invalid: true } }));
  assert.doesNotThrow(() => malformed.prepare(new ModelSemanticError(validateModelInput(second, "design").map(issue => ({ ...issue, responsePath: `models.1.${issue.path}` })))));
});
