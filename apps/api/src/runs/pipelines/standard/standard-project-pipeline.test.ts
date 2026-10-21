// Exercises ordinary orchestration and render boundaries without provider traffic or professional review stages.
import { compatibleTestModelCapability } from "../../../test-fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import { z } from "zod";
import { standardJsonCall } from "./standard-project-pipeline.js";
import test from "node:test";
import { createStandardProjectState, standardDiagramTasks, validateStandardModel, type StandardDiagramKind, type StandardModel, type StandardOutline, type StandardProjectState } from "@uml-platform/contracts";
import { runStandardProject } from "./standard-project-pipeline.js";
import { standardDiagramSource } from "../../../normalizers/standard/diagram-source.js";
import { buildStandardContext } from "../../../mcp/context/standard-context.js";
import type { LlmTransport } from "../../../llm.js";

const outline: StandardOutline = { title: "借阅系统", summary: "借阅和归还", roles: [{ id: "reader", name: "读者", description: "借阅图书" }],
  businesses: ["borrow", "return"].map(id => ({ id, name: id, roleIds: ["reader"], description: id, steps: ["提交", "完成"], exceptions: ["无库存"] })),
  entities: [{ id: "book", name: "图书", attributes: ["编号"] }], relationships: [], modules: ["借阅管理"], assumptions: [] };
const node = (id: string, type: StandardModel["nodes"][number]["type"], label = id) => ({ id, type, label, fields: [], methods: [] });
function model(kind: StandardDiagramKind): StandardModel {
  if (kind === "activity") return {
    swimlanes: [{ id: "system", name: "目标系统" }, { id: "role_reader", name: "读者" }],
    nodes: [node("begin", "start"), { ...node("submit", "action"), actorOrLane: "role_reader" }, { ...node("handle", "action"), actorOrLane: "system" }, node("finish", "end")],
    edges: [{ id: "e1", from: "begin", to: "submit", label: "", relation: "association" }, { id: "e2", from: "submit", to: "handle", label: "", relation: "association" }, { id: "e3", from: "handle", to: "finish", label: "完成", relation: "association" }],
  };
  if (kind === "usecase") return { nodes: [node("reader", "actor"), node("borrow", "usecase")], edges: [{ id: "e", from: "reader", to: "borrow", label: "", relation: "association" }] };
  const types = { function: "system", architecture: "component", er: "entity", class: "class", sequence: "participant", table: "table" } as const;
  return { nodes: [node("one", types[kind])], edges: [] };
}
const settings = { modelCapability: compatibleTestModelCapability("test"), apiBaseUrl: "https://example.test", apiKey: "test-only", model: "test" };

test("structured generation uses the persisted strict, JSON or compatible mode", async () => {
  for (const mode of ["strict_json", "json_object", "compatible"] as const) {
    let requested: unknown;
    const transport: LlmTransport = { async *streamChatCompletion(input) {
      requested = input.responseFormat;
      yield mode === "strict_json" ? '{"result":{"value":"ok","optional":null}}' : mode === "compatible" ? '结果如下：```json\n{"value":"ok"}\n```' : '{"value":"ok"}';
    } };
    const result = await standardJsonCall({ settings: { ...settings, modelCapability: { id: "test", category: "text_chat", structuredOutputMode: mode,
      supportsJsonSchema: mode === "strict_json", supportsJsonObject: mode !== "compatible", strictJson: mode === "strict_json", modeLabel: mode, probeStatus: "compatible" } },
      transport, render, save: async () => createStandardProjectState() }, "返回 value", {}, z.object({ value: z.string(), optional: z.string().optional() }));
    assert.deepEqual(result, { value: "ok" });
    assert.equal(requested === null ? null : (requested as { type: string }).type, mode === "strict_json" ? "json_schema" : mode === "json_object" ? "json_object" : null);
  }
});
const render = async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: 1, durationMs: 1 } });
function memory(initial = createStandardProjectState("借阅和归还图书")) {
  let state = structuredClone(initial);
  return { get: () => structuredClone(state), save: async (update: (state: StandardProjectState) => void) => { update(state); return structuredClone(state); } };
}

test("durable memory and business answers reach generation, repair, retry, tests and both documents", async () => {
  const store = memory({ ...createStandardProjectState("借阅系统"), outline,
    memory: ["管理员不能删除借阅记录"],
    rounds: [{ purpose: "business", questions: [{ id: "q1", title: "数据库？", options: ["PostgreSQL", "MySQL"], multiple: false, recommendation: "MySQL" }], answers: [{ questionId: "q1", answer: "PostgreSQL" }] },
      { purpose: "generation_scope", questions: [{ id: "scope", title: "图类型？", options: ["class"], multiple: false, recommendation: "class" }], answers: [{ questionId: "scope", answer: "class" }] }],
  });
  let invalidOnce = true;
  let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const data = JSON.parse(String(input.messages[1]!.content));
    calls++;
    assert.deepEqual(data.memory, ["管理员不能删除借阅记录"]);
    assert.deepEqual(data.clarifications, [{ round: 1, question: "数据库？", answer: "PostgreSQL" }]);
    if (data.task) {
      if (invalidOnce) { invalidOnce = false; yield '{"nodes":[],"edges":[]}'; }
      else yield JSON.stringify(model(data.task.kind));
    } else if (String(input.messages[0]!.content).includes("生成测试用例")) {
      yield JSON.stringify({ tests: outline.businesses.map(business => ({ id: business.id, businessId: business.id, title: "借阅", scenarioType: "normal", priority: "P2", preconditions: [], steps: ["提交"], expected: "成功" })) });
    } else yield JSON.stringify({ markdown: "# 说明书\nPostgreSQL；管理员不能删除借阅记录。" });
  } };
  const deps = { settings, transport, render, save: store.save };
  await runStandardProject({ operation: "generate", targetIds: ["function"] }, store.get(), deps);
  assert.equal(store.get().diagrams.function?.status, "completed");
  await runStandardProject({ operation: "retry", diagramId: "function" }, store.get(), deps);
  for (const operation of ["tests", "requirementsSpec", "softwareDesignSpec"] as const) {
    await runStandardProject({ operation }, store.get(), deps);
  }
  assert.equal(calls, 6);
});

for (const reasoning of [true, false]) test(`ordinary document generation forwards reasoning=${reasoning}`, async () => {
  const done = { ...standardDiagramTasks(outline)[0]!, status: "completed" as const, model: model("function"), svg: "<svg/>" };
  const store = memory({ ...createStandardProjectState("借阅系统"), outline, diagrams: { function: done } });
  let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    calls++;
    assert.equal(input.reasoning, reasoning);
    yield JSON.stringify({ markdown: "# 需求规格说明书\n借阅系统需求。" });
  } };
  await runStandardProject({ operation: "requirementsSpec", reasoning }, store.get(), { settings, transport, render, save: store.save });
  assert.equal(calls, 1);
  assert.ok(store.get().documents?.requirementsSpec?.markdown.includes("借阅系统需求"));
});

test("all businesses generate flow and sequence tasks with one overall usecase model", async () => {
  const store = memory({ ...createStandardProjectState("借阅系统"), outline });
  const calls: string[] = []; let active = 0; let peak = 0;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const request = JSON.parse(String(input.messages[1]!.content));
    calls.push(request.task.id); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    assert.deepEqual(request.outline, outline);
    yield JSON.stringify(model(request.task.kind));
  } };
  await runStandardProject({ operation: "generate" }, store.get(), { settings, transport, render, save: store.save });
  assert.equal(calls.length, 10);
  assert.equal(peak, 3);
  assert.equal(Object.values(store.get().diagrams).filter(diagram => diagram.status === "completed").length, 10);
  assert.ok(store.get().diagrams.activity_return);
  assert.ok(store.get().diagrams.sequence_return);
  assert.ok(store.get().diagrams.usecase);
  assert.equal(store.get().diagrams.usecase_reader, undefined);
  assert.equal(store.get().tests, undefined);
  assert.equal(store.get().documents, undefined);
});

test("generation enforces confirmed kinds and uses a narrowed schema while preserving other saved outputs", async () => {
  const initial = { ...createStandardProjectState("借阅系统"), outline,
    generationScope: { status: "confirmed" as const, kinds: ["function", "usecase"] as ("function" | "usecase")[] },
    diagrams: { architecture: { id: "architecture", kind: "architecture" as const, title: "保留架构", status: "completed" as const, svg: "<svg>keep</svg>" } } };
  const store = memory(initial); const calls: string[] = [];
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const { task } = JSON.parse(String(input.messages[1]!.content)); calls.push(task.id);
    const system = String(input.messages[0]!.content);
    assert.match(system, task.kind === "function" ? /节点 type 只能为：system、module/ : /节点 type 只能为：actor、usecase/);
    yield JSON.stringify(model(task.kind));
  } };
  await runStandardProject({ operation: "generate" }, store.get(), { settings, transport, render, save: store.save });
  assert.deepEqual(calls.sort(), ["function", "usecase"]);
  assert.equal(store.get().diagrams.architecture!.svg, "<svg>keep</svg>");
  await assert.rejects(runStandardProject({ operation: "generate", targetIds: ["er"] }, store.get(), { settings, transport, render, save: store.save }), /超出用户确认/);
  const waiting = { ...initial, generationScope: { ...initial.generationScope, status: "awaiting_selection" as const } };
  await assert.rejects(runStandardProject({ operation: "generate" }, waiting, { settings, transport, render, save: store.save }), /先选择/);
});

test("structural repair is bounded and failure preserves sibling diagrams; retry targets only one", async () => {
  const store = memory({ ...createStandardProjectState("系统"), outline });
  const calls: string[] = [];
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const { task } = JSON.parse(String(input.messages[1]!.content)); calls.push(task.id);
    yield task.kind === "er" ? JSON.stringify({ nodes: [], edges: [] }) : JSON.stringify(model(task.kind));
  } };
  await runStandardProject({ operation: "generate" }, store.get(), { settings, transport, render, save: store.save });
  assert.equal(calls.filter(id => id === "er").length, 2);
  assert.equal(store.get().diagrams.er?.status, "failed");
  const before = store.get().diagrams;
  calls.length = 0;
  await runStandardProject({ operation: "retry", diagramId: "class" }, store.get(), { settings, transport, render, save: store.save });
  assert.deepEqual(calls, ["class"]);
  assert.deepEqual(store.get().diagrams.function, before.function);
});

test("continuation generates only unfinished tasks and preserves completed diagrams and revision intent", async () => {
  const done = { ...standardDiagramTasks(outline)[0]!, status: "completed" as const, model: model("function"), svg: "<svg>saved</svg>" };
  const task = { id: "class", kind: "class" as const, title: "类图", status: "failed" as const };
  const store = memory({ ...createStandardProjectState("系统"), outline, diagrams: { function: done, class: task } });
  const calls: string[] = [];
  const transport: LlmTransport = { async *streamChatCompletion(input) { const payload = JSON.parse(String(input.messages[1]!.content)); calls.push(payload.task.id); assert.equal(payload.revisionInstruction, "增加ISBN"); yield JSON.stringify(model(payload.task.kind)); } };
  await runStandardProject({ operation: "resume", targetIds: ["function", "class"], instruction: "增加ISBN" }, store.get(), { settings, transport, render, save: store.save });
  assert.deepEqual(calls, ["class"]); assert.deepEqual(store.get().diagrams.function, done);
  calls.length = 0;
  await runStandardProject({ operation: "resume", targetIds: ["function", "class"] }, store.get(), { settings, transport, render, save: store.save });
  assert.equal(calls.length, 0, "continuing an already finished scope must not call a model");
});

test("clarification supports further rounds and explicit recommendations proceeds directly to diagrams", async () => {
  const store = memory();
  let prepareCalls = 0;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const payload = JSON.parse(String(input.messages[1]!.content));
    if (payload.task) { yield JSON.stringify(model(payload.task.kind)); return; }
    prepareCalls++;
    if (payload.useRecommendations) {
      assert.equal(payload.rounds.length, 2);
      assert.equal(payload.rounds[0].answers[0].answer, "读者与管理员");
      assert.equal(payload.rounds[1].answers[0].answer, "需要审批");
      yield JSON.stringify({ kind: "ready", outline });
    } else yield JSON.stringify({ kind: "questions", questions: [{ id: `q${prepareCalls}`, title: "需要哪些角色和审批？", options: ["需要审批", "无需审批"], recommendation: "需要审批" }] });
  } };
  const deps = { settings, transport, render, save: store.save };
  await runStandardProject({ operation: "prepare" }, store.get(), deps);
  assert.equal(Object.keys(store.get().diagrams).length, 0);
  await runStandardProject({ operation: "prepare", answers: [{ questionId: "q1", answer: "读者与管理员" }] }, store.get(), deps);
  assert.equal(store.get().rounds.length, 2);
  await runStandardProject({ operation: "prepare", useRecommendations: true }, store.get(), deps);
  assert.ok(store.get().outline);
  assert.equal(Object.keys(store.get().diagrams).length, 10);
  assert.ok(store.get().rounds.at(-1)!.answers.length);
});

test("structure validation rejects dangling and duplicate references; conceptual ER uses diamonds and attributes", () => {
  assert.throws(() => validateStandardModel("activity", { ...model("activity"), edges: [{ id: "e", from: "missing", to: "finish" }] }), /不存在/);
  assert.throws(() => validateStandardModel("class", { nodes: [node("x", "class"), node("x", "class")], edges: [] }), /重复/);
  assert.throws(() => validateStandardModel("class", { nodes: [node("x", "class"), node("y", "class")], edges: [{ id: "e", from: "x", to: "y", relation: "include" }] }), /关系类型/);
  assert.throws(() => validateStandardModel("activity", { nodes: [...model("activity").nodes, { ...node("orphan", "action"), actorOrLane: "role_reader" }], edges: [...model("activity").edges, { id: "dead", from: "begin", to: "orphan" }] }), /结束的分支/);
  const source = standardDiagramSource("er", { nodes: [{ ...node("book", "entity", '图书"<&'), fields: ["编号"] }, node("reader", "entity")], edges: [{ id: "e", from: "book", to: "reader", label: "借阅", relation: "association", fromCardinality: "*", toCardinality: "1" }] });
  assert.ok(source.startsWith("@startuml")); assert.match(source, /diamond/); assert.match(source, /usecase/);
  assert.match(source, /&#34;/);
});

test("ordinary MCP exposes saved outline and models, and never adds professional tracking requirements", () => {
  const state = { ...createStandardProjectState("需求修改后"), outline, diagrams: { class: { ...standardDiagramTasks(outline).find(item => item.kind === "class")!, model: model("class"), status: "completed" } } };
  const context = buildStandardContext({ standardProject: state }, { requirementIds: [], artifactIds: [] });
  assert.ok(context.artifacts.some(item => item.id === "standard:description"));
  assert.ok(context.artifacts.some(item => item.id === "standard:diagram:class"));
  assert.equal(context.implementation, null);
  assert.equal(context.artifacts.some(item => item.id.startsWith("implementation:")), false);
  assert.equal(context.manifest.some(item => item.freshness === "stale"), false);
});


test("provider failures retain submitted descriptions and answers without structural retries", async () => {
  const store = memory();
  let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() { calls++; throw new Error("provider unavailable"); } };
  const deps = { settings, transport, render, save: store.save };
  await assert.rejects(runStandardProject({ operation: "prepare", description: "新的需求描述" }, store.get(), deps), /provider unavailable/);
  assert.equal(store.get().description, "新的需求描述");
  await store.save(state => { state.outline = outline; state.rounds = [{ questions: [{ id: "q", title: "角色？", multiple: false, options: ["读者", "管理员"], recommendation: "读者" }], answers: [] }]; });
  await assert.rejects(runStandardProject({ operation: "prepare", answers: [{ questionId: "q", answer: "管理员" }] }, store.get(), deps), /provider unavailable/);
  assert.equal(store.get().rounds[0]!.answers[0]!.answer, "管理员");
  calls = 0;
  await runStandardProject({ operation: "generate" }, store.get(), deps);
  assert.equal(calls, standardDiagramTasks(outline).length);
});

test("source labels preserve generic types while preventing preprocessor injection", () => {
  const source = standardDiagramSource("class", { nodes: [{ ...node("start", "class"), fields: ["List<Book>", "!include secret", "$variable", "%load_json()"] }], edges: [] });
  assert.match(source, /List&#60;Book&#62;/);
  assert.doesNotMatch(source, /!include|\$variable|%load_json/);
  assert.match(source, /as node_start/);
});

test("direct generate, retry and resume cannot bypass pending unsupported-model confirmation", async () => {
  const initial: StandardProjectState = { ...createStandardProjectState("借阅系统"), outline,
    generationScope: { status: "confirmed", kinds: ["class"] },
    unsupportedDiagramRequest: { models: ["UML 状态图"], messageId: "user:r" },
    diagrams: { class: { id: "class", kind: "class", title: "类图", status: "failed", model: model("class") } } };
  const store = memory(initial); let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() { calls++; throw new Error("unexpected provider call"); } };
  for (const operation of ["generate", "retry", "resume"] as const) {
    await assert.rejects(runStandardProject({ operation, targetIds: ["class"], diagramId: "class" }, store.get(), { settings, transport, render, save: store.save }), /询问组件确认/);
  }
  assert.equal(calls, 0); assert.deepEqual(store.get(), initial);
});
