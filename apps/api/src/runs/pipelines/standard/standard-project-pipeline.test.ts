// Exercises ordinary orchestration and render boundaries without provider traffic or professional review stages.
import { compatibleTestModelCapability } from "../../../../tests/fixtures/providers/model-capability.js";
import { standardModelFixture } from "@uml-platform/contracts/testing";
import assert from "node:assert/strict";
import { z } from "zod";
import { standardJsonCall } from "./standard-project-pipeline.js";
import test, { type TestContext } from "node:test";
import { createStandardProjectState, standardDiagramTasks, validateStandardModel, type StandardDiagramKind, type StandardOutline, type StandardProjectState } from "@uml-platform/contracts";
import { runStandardProject } from "./standard-project-pipeline.js";
import { buildStandardDiagram } from "../../../normalizers/standard/diagram-source.js";
import { buildStandardContext } from "../../../mcp/context/standard-context.js";
import type { LlmTransport } from "../../../adapters/llm/llm-transport.js";
import { createInMemoryLlmScheduler, createScheduledLlmTransport } from "../../../adapters/llm/llm-scheduler.js";
import { readStandardModelingResource } from "./standard-modeling-knowledge.js";

const outline: StandardOutline = { title: "借阅系统", summary: "借阅和归还", roles: [{ id: "reader", name: "读者", description: "借阅图书" }],
  businesses: ["borrow", "return"].map(id => ({ id, name: id, roleIds: ["reader"], description: id, steps: ["提交", "完成"], exceptions: ["无库存"] })),
  entities: [{ id: "book", name: "图书", attributes: ["编号"] }], relationships: [], modules: ["借阅管理"], assumptions: [] };
const model = standardModelFixture;
const settings = { modelCapability: compatibleTestModelCapability("test"), apiBaseUrl: "https://example.test", apiKey: "test-only", model: "test" };

test("removed preparation commands cannot fall through into generation or rewrite saved state", async () => {
  const state = { ...createStandardProjectState("当前需求"), outline };
  const before = structuredClone(state);
  const deps = { settings, transport: { async *streamChatCompletion() { throw new Error("unexpected provider call"); } },
    render: async () => { throw new Error("unexpected render"); }, save: async () => { throw new Error("unexpected save"); } };
  await assert.rejects(runStandardProject({ operation: "prepare" } as never, state, deps), /不支持的生成操作/);
  assert.deepEqual(state, before);
});

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

function setRunConcurrency(t: TestContext, value: string | undefined) {
  const previous = process.env.UML_LLM_RUN_CONCURRENCY;
  if (value === undefined) delete process.env.UML_LLM_RUN_CONCURRENCY;
  else process.env.UML_LLM_RUN_CONCURRENCY = value;
  t.after(() => {
    if (previous === undefined) delete process.env.UML_LLM_RUN_CONCURRENCY;
    else process.env.UML_LLM_RUN_CONCURRENCY = previous;
  });
}

test("durable memory and business answers reach generation, repair, retry, tests and both documents", async () => {
  const [diagramReference, deliverables] = await Promise.all([
    "skills/uml-graduation-modeling/references/views.md", "skills/graduation-deliverables/SKILL.md",
  ].map(async path => (await readStandardModelingResource(path)).toString("utf8")));
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
      assert.ok(String(input.messages[0]!.content).includes(diagramReference), "generation, repair and retry all receive the maintained diagram guidance");
      if (invalidOnce) { invalidOnce = false; yield '{"nodes":[],"edges":[]}'; }
      else yield JSON.stringify(model(data.task.kind));
    } else if (String(input.messages[0]!.content).includes("生成测试用例")) {
      assert.ok(String(input.messages[0]!.content).includes(deliverables));
      yield JSON.stringify({ tests: outline.businesses.map(business => ({ id: business.id, businessId: business.id, title: "借阅", scenarioType: "normal", priority: "P2", preconditions: [], steps: ["提交"], expected: "成功" })) });
    } else {
      assert.ok(String(input.messages[0]!.content).includes(deliverables));
      yield JSON.stringify({ markdown: "# 说明书\nPostgreSQL；管理员不能删除借阅记录。" });
    }
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

for (const [configured, expected] of [[undefined, 2], ["1", 1], ["5", 5], ["20", 10], ["0", 2], ["invalid", 2], ["1.5", 2]] as const)
test(`all businesses generate complete diagrams using the shared run concurrency (${configured ?? "default"})`, async t => {
  setRunConcurrency(t, configured);
  const store = memory({ ...createStandardProjectState("借阅系统"), outline });
  const references = Object.fromEntries(await Promise.all(["usecase", "activity", "class", "sequence", "views", "data-modeling"]
    .map(async name => [name, (await readStandardModelingResource(`skills/uml-graduation-modeling/references/${name}.md`)).toString("utf8")])));
  const expectedReference: Record<StandardDiagramKind, string> = { function: "views", usecase: "usecase", activity: "activity", architecture: "views", er: "data-modeling", class: "class", sequence: "sequence", table: "data-modeling" };
  const calls: string[] = []; let active = 0; let peak = 0;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const request = JSON.parse(String(input.messages[1]!.content));
    const system = String(input.messages[0]!.content);
    const selected = expectedReference[request.task.kind as StandardDiagramKind];
    assert.ok(system.includes(references[selected]!), "each provider request receives its relevant maintained semantic rules");
    for (const [name, content] of Object.entries(references)) if (name !== selected) assert.ok(!system.includes(content), "unrelated reference bodies stay out of context");
    calls.push(request.task.id); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 25)); active--;
    assert.deepEqual(request.outline, outline);
    yield JSON.stringify(model(request.task.kind));
  } };
  await runStandardProject({ operation: "generate" }, store.get(), { settings, transport, render, save: store.save });
  assert.equal(calls.length, 10);
  assert.equal(peak, expected);
  assert.equal(Object.values(store.get().diagrams).filter(diagram => diagram.status === "completed").length, 10);
  assert.ok(store.get().diagrams.activity_return);
  assert.ok(store.get().diagrams.sequence_return);
  assert.ok(store.get().diagrams.usecase);
  assert.equal(store.get().diagrams.usecase_reader, undefined);
  assert.equal(store.get().tests, undefined);
  assert.equal(store.get().documents, undefined);
});

test("global scheduling still limits real requests when quick-modeling concurrency is increased", async t => {
  setRunConcurrency(t, "5");
  const store = memory({ ...createStandardProjectState("借阅系统"), outline });
  let active = 0; let peak = 0; let calls = 0;
  const transport = createScheduledLlmTransport({
    scheduler: createInMemoryLlmScheduler({ globalConcurrency: 1, providerConcurrency: 5, projectConcurrency: 5, userConcurrency: 5, runConcurrency: 5 }),
    context: { runId: "quick", projectId: "project", userId: "user", providerConfigId: "provider", model: settings.model, taskType: "quick_modeling" },
    transport: { async *streamChatCompletion(input) {
      active++; calls++; peak = Math.max(peak, active);
      try {
        await new Promise(resolve => setTimeout(resolve, 5));
        const { task } = JSON.parse(String(input.messages[1]!.content));
        yield JSON.stringify(model(task.kind));
      } finally { active--; }
    } },
  });
  await runStandardProject({ operation: "generate" }, store.get(), { settings, transport, render, save: store.save });
  assert.equal(calls, 10);
  assert.equal(peak, 1);
  assert.equal(Object.values(store.get().diagrams).filter(diagram => diagram.status === "completed").length, 10);
});

test("generation enforces confirmed kinds and uses a narrowed schema while preserving other saved outputs", async () => {
  const initial = { ...createStandardProjectState("借阅系统"), outline,
    generationScope: { status: "confirmed" as const, kinds: ["function", "usecase"] as ("function" | "usecase")[] },
    diagrams: { architecture: { id: "architecture", kind: "architecture" as const, title: "保留架构", status: "completed" as const, svg: "<svg>keep</svg>" } } };
  const store = memory(initial); const calls: string[] = [];
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const { task } = JSON.parse(String(input.messages[1]!.content)); calls.push(task.id);
    const system = String(input.messages[0]!.content);
    assert.match(system, /diagramKind/);
    assert.match(system, task.kind === "function" ? /decomposition/ : /systemBoundaries/);
    yield JSON.stringify(model(task.kind));
  } };
  await runStandardProject({ operation: "generate" }, store.get(), { settings, transport, render, save: store.save });
  assert.deepEqual(calls.sort(), ["function", "usecase"]);
  assert.equal(store.get().diagrams.architecture!.svg, "<svg>keep</svg>");
  await assert.rejects(runStandardProject({ operation: "generate", targetIds: ["er"] }, store.get(), { settings, transport, render, save: store.save }), /超出用户确认/);
  const waiting = { ...initial, generationScope: { ...initial.generationScope, status: "awaiting_selection" as const } };
  await assert.rejects(runStandardProject({ operation: "generate" }, waiting, { settings, transport, render, save: store.save }), /先选择/);
});

test("generation rejects obsolete null fields before protocol normalization and repairs only to the current contract", async () => {
  const store = memory({ ...createStandardProjectState(), outline });
  let calls = 0;
  const current = model("class");
  const transport: LlmTransport = { async *streamChatCompletion() {
    calls++;
    yield JSON.stringify(calls === 1 ? { ...current, edges: null } : { ...current, classes: [{ ...current.classes[0], isAbstract: null }, current.classes[1]] });
  } };
  await runStandardProject({ operation: "generate", targetIds: ["class"] }, store.get(), { settings, transport, render, save: store.save });
  assert.equal(calls, 2);
  assert.equal(store.get().diagrams.class.status, "completed");
  assert.deepEqual(store.get().diagrams.class.model, current);
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

test("structure validation rejects dangling and duplicate references; conceptual ER uses diamonds and attributes", () => {
  assert.throws(() => validateStandardModel("activity", { ...model("activity"), relationships: [{ id: "e", type: "control_flow", sourceId: "missing", targetId: "end" }] }));
  const classes = model("class");
  assert.throws(() => validateStandardModel("class", { ...classes, classes: [classes.classes[0], classes.classes[0]] }));
  assert.throws(() => validateStandardModel("class", { ...classes, relationships: [{ id: "e", sourceId: "order", targetId: "item", type: "include" }] }));
  const er = model("er"); er.entities[0].name = '图书"<&';
  const source = buildStandardDiagram("er", er).source;
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


test("native source preserves typed class members and stable aliases", () => {
  const classes = model("class");
  classes.classes[0].attributes = [{ name: "books", type: "List<Book>", visibility: "private" }];
  const source = buildStandardDiagram("class", classes).source;
  assert.match(source, /List&#60;Book&#62;/);
  assert.match(source, /n_6f72646572/);
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
