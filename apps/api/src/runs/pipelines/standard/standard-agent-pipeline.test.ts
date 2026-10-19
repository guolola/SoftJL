// Exercises real Pi sessions/tools/compaction with a deterministic provider stream and no external model calls.
import { compatibleTestModelCapability } from "../../../test-fixtures/providers/model-capability.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantMessageEventStream, getCurrentSystemPrompt, getCurrentTools, type AssistantMessage, type Context } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { createStandardProjectState, type StandardProjectState } from "@uml-platform/contracts";
import { runStandardAgent } from "./standard-agent-pipeline.js";
import { restoreStandardSession } from "../../records/standard-agent-session.js";
import { applyConversationRevision, resolveConversationRevision } from "../../records/standard-conversation-revision.js";

const settings = { modelCapability: compatibleTestModelCapability("deepseek-v4.1-flash"), apiBaseUrl: "https://example.test", apiKey: "test-only", model: "deepseek-v4.1-flash" };
const usage = { input: 20, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const node = { id: "book", label: "图书", type: "class" as const, fields: ["name: string"], methods: [] };
const model = { nodes: [node], edges: [] };
const outline = { title: "图书管理", summary: "借阅", roles: [{ id: "reader", name: "读者", description: "借阅" }], businesses: [{ id: "borrow", name: "借阅", roleIds: ["reader"], description: "借阅", steps: ["提交"], exceptions: [] }], entities: [{ id: "book", name: "图书", attributes: ["名称"] }], relationships: [], modules: ["借阅"], assumptions: [] };
function reply(content: AssistantMessage["content"], tokens = 30): AssistantMessage {
  return { role: "assistant", content, api: "openai-completions", provider: "uml-managed", model: settings.model, usage: { ...usage, input: tokens - 10, totalTokens: tokens }, stopReason: content.some(part => part.type === "toolCall") ? "toolUse" : "stop", timestamp: Date.now() };
}
function stream(responder: (context: Context, call: number) => AssistantMessage): StreamFn {
  let calls = 0;
  return (_, context) => { const output = createAssistantMessageEventStream(); const systemPrompt = getCurrentSystemPrompt(context.messages);
    const message = systemPrompt.startsWith("Suggest exactly")
    ? reply([{ type: "text", text: "检查借阅规则的异常分支\n完善图书类的字段类型\n为借阅业务生成边界测试" }])
    : responder({ systemPrompt, tools: getCurrentTools(context.messages), messages: context.messages }, calls++);
    output.push({ type: "done", reason: message.stopReason as "stop" | "toolUse", message }); return output; };
}
const call = (name: string, args: Record<string, unknown>) => reply([{ type: "toolCall", id: `call_${name}_${Date.now()}`, name, arguments: args }]);
function memory() {
  let state: StandardProjectState = { ...createStandardProjectState("图书管理系统"), outline, memory: ["仅学生可以借阅"],
    diagrams: { class: { id: "class", kind: "class", title: "图书类图", status: "completed", model, svg: "<svg>old</svg>" }, table: { id: "table", kind: "table", title: "表关系", status: "completed", svg: "<svg>keep</svg>" } } };
  return { get: () => structuredClone(state), save: async (update: (state: StandardProjectState) => void) => { update(state); return structuredClone(state); } };
}
const render = async () => ({ svg: "<svg>updated</svg>", renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: 1, durationMs: 1 } });
const transport = { async *streamChatCompletion() { yield JSON.stringify({ summary: "用户要求图书类增加ISBN，仍仅学生可以借阅。" }); } };

test("the LLM asks for model scope through a durable tool question and resumes from structured answers", async () => {
  let state = createStandardProjectState();
  const save = async (update: (value: StandardProjectState) => void) => { update(state); return structuredClone(state); };
  await runStandardAgent("p", { operation: "chat", message: "高校教室管理系统：管理员维护教室，师生预约，扫码报修。" }, state,
    { settings, save, render, transport, signal: new AbortController().signal, stream: stream((context, turn) => {
      assert.equal(turn, 0);
      assert.match(context.systemPrompt!, /必须通过 ask_questions/);
      return call("ask_questions", { purpose: "generation_scope", questions: [{ id: "models", title: "想先生成哪些模型？", multiple: true,
        options: ["功能结构图", "2. 用例图 — 展示哪些角色使用哪些功能", "业务流程图", "总体架构图", "概念 E-R 图", "设计类图", "时序图", "数据库表关系图"], recommendation: "用例图、设计类图" }] });
    }) });
  assert.equal(state.generationScope?.status, "awaiting_selection");
  assert.deepEqual(state.diagrams, {});
  assert.equal(state.outline, undefined);
  assert.equal(state.rounds.at(-1)?.purpose, "generation_scope");
  assert.equal(state.rounds.at(-1)?.questions[0]?.options.length, 8);
  await runStandardAgent("p", { operation: "chat", message: "想先生成哪些模型？：用例图、设计类图", answers: [{ questionId: "models", answer: "2. 用例图 — 展示哪些角色使用哪些功能、设计类图" }] }, state,
    { settings, save, render, transport, signal: new AbortController().signal, stream: stream(context => {
      assert.match(context.systemPrompt!, /已确认的生成范围：用例图、设计类图/);
      assert.match(context.systemPrompt!, /高校教室管理系统/);
      return reply([{ type: "text", text: "按所选范围整理方案。" }]);
    }) });
  assert.deepEqual(state.generationScope, { status: "confirmed", kinds: ["usecase", "class"] });
  assert.equal(state.conversation!.filter(item => item.role === "user").length, 2);
  assert.deepEqual(state.rounds.at(-1)?.answers, [{ questionId: "models", answer: "2. 用例图 — 展示哪些角色使用哪些功能、设计类图" }]);
});

test("Pi resumes the same project context and changes only the requested diagram", async () => {
  const store = memory();
  await runStandardAgent("p", { operation: "chat", message: "记住我只需要学生借阅" }, store.get(), { settings, save: store.save, render, transport, signal: new AbortController().signal,
    stream: stream(context => { assert.ok(context.tools?.some(tool => tool.name === "save_diagram")); assert.ok(!context.tools?.some(tool => ["bash", "read", "write", "edit"].includes(tool.name))); return reply([{ type: "text", text: "已记住学生借阅范围。" }]); }) });
  assert.equal(store.get().conversation?.length, 2);
  assert.equal(store.get().conversation?.at(-1)?.suggestions?.length, 3);
  await runStandardAgent("p", { operation: "chat", message: "在图书类加上ISBN字段" }, store.get(), { settings, save: store.save, render, transport, signal: new AbortController().signal,
    stream: stream((context, turn) => {
      assert.match(JSON.stringify(context.messages), /记住我只需要学生借阅/);
      assert.match(context.systemPrompt!, /仅学生可以借阅/);
      if (turn === 0) return call("read_diagram", { ids: ["class"] });
      if (turn === 1) return call("save_diagram", { id: "class", model: { nodes: [{ ...node, fields: ["name: string", "ISBN: string"] }], edges: [] } });
      return reply([{ type: "text", text: "已在图书类加入ISBN字段。" }]);
    }) });
  assert.deepEqual(store.get().diagrams.class!.model!.nodes[0]!.fields, ["name: string", "ISBN: string"]);
  assert.equal(store.get().diagrams.table!.svg, "<svg>keep</svg>");
  assert.equal(store.get().conversation?.length, 6);
  assert.deepEqual(store.get().conversation?.flatMap(message => message.tools ?? []).map(tool => [tool.name, tool.status]), [["read_diagram", "completed"], ["save_diagram", "completed"]]);
  assert.ok(store.get().piSession!.entries.length > 5);
  assert.equal(store.get().tokenUsage?.cumulative.total, 120);
  assert.equal(store.get().tokenUsage?.cumulative.calls, 4);
});

test("a later narrower choice replaces the generation scope while keeping prior diagrams", async () => {
  const store = memory();
  await store.save(state => { state.generationScope = { status: "confirmed", kinds: ["class", "table"] }; });
  await runStandardAgent("p", { operation: "chat", message: "只生成用例图" }, store.get(), { settings, save: store.save, render, transport, signal: new AbortController().signal,
    stream: stream(context => { assert.match(context.systemPrompt!, /已确认的生成范围：用例图。/); return reply([{ type: "text", text: "仅处理用例图。" }]); }) });
  assert.deepEqual(store.get().generationScope?.kinds, ["usecase"]);
  assert.equal(store.get().diagrams.class!.svg, "<svg>old</svg>");
  assert.equal(store.get().diagrams.table!.svg, "<svg>keep</svg>");
});

test("a scoped single-diagram edit rejects sibling writes and preserves the other saved model", async () => {
  const store = memory(); const sibling = store.get().diagrams.table;
  await runStandardAgent("p", { operation: "chat", message: "只修改类图，在图书类增加 ISBN 字段，其他图不变" }, store.get(), {
    settings, save: store.save, render, transport, signal: new AbortController().signal,
    stream: stream((context, turn) => {
      if (turn === 0) return call("save_diagram", { id: "table", model });
      if (turn === 1) {
        assert.match(JSON.stringify(context.messages), /超出用户本轮确认/);
        return call("save_diagram", { id: "class", model: { nodes: [{ ...node, fields: ["name: string", "ISBN: string"] }], edges: [] } });
      }
      return reply([{ type: "text", text: "仅修改了类图。" }]);
    }),
  });
  assert.deepEqual(store.get().diagrams.table, sibling);
  assert.deepEqual(store.get().diagrams.class!.model!.nodes[0]!.fields, ["name: string", "ISBN: string"]);
});

test("records real stream timing, chunks and provider output tokens, and keeps successful replies if suggestions fail", async () => {
  const store = memory();
  const timed: StreamFn = (_, context) => {
    if (getCurrentSystemPrompt(context.messages).startsWith("Suggest exactly")) throw new Error("optional provider unavailable");
    const output = createAssistantMessageEventStream(); const message = reply([{ type: "text", text: "完整回复" }]);
    void (async () => {
      output.push({ type: "start", partial: { ...message, content: [] } });
      await new Promise(resolve => setTimeout(resolve, 5));
      output.push({ type: "text_delta", contentIndex: 0, delta: "完整", partial: { ...message, content: [{ type: "text", text: "完整" }] } });
      await new Promise(resolve => setTimeout(resolve, 5));
      output.push({ type: "text_delta", contentIndex: 0, delta: "回复", partial: message });
      output.push({ type: "done", reason: "stop", message });
    })();
    return output;
  };
  await runStandardAgent("p", { operation: "chat", message: "介绍项目" }, store.get(), { settings, save: store.save, render, transport, signal: new AbortController().signal, stream: timed });
  const response = store.get().conversation!.at(-1)!;
  assert.equal(response.text, "完整回复"); assert.equal(response.status, "completed");
  assert.equal(response.timing?.totalChunks, 2); assert.equal(response.timing?.tokenCount, 10);
  assert.ok(response.timing!.firstTokenTime! >= 0); assert.ok(response.timing!.totalStreamTime >= response.timing!.firstTokenTime!);
  assert.ok(response.timing!.tokensPerSecond! > 0); assert.equal(response.suggestions, undefined);
});

test("Pi pauses at clarification and accepts a later answer without losing the original turn", async () => {
  const store = memory();
  await runStandardAgent("p", { operation: "chat", message: "我想增加预约" }, store.get(), { settings, save: store.save, render, transport, signal: new AbortController().signal,
    stream: stream((_, turn) => { assert.equal(turn, 0); return call("ask_questions", { questions: [{ id: "approval", title: "预约是否审批？", options: ["需要", "不需要"], recommendation: "需要" }] }); }) });
  assert.equal(store.get().rounds.length, 1);
  await runStandardAgent("p", { operation: "chat", useRecommendations: true }, store.get(), { settings, save: store.save, render, transport, signal: new AbortController().signal,
    stream: stream(context => {
      assert.match(JSON.stringify(context.messages), /我想增加预约/);
      assert.match(JSON.stringify(context.messages), /预约是否审批？/);
      const answer = context.messages.filter(message => message.role === "user").at(-1)!;
      assert.equal(typeof answer.content === "string" ? answer.content : answer.content.filter(part => part.type === "text").map(part => part.text).join(""), "需要");
      return reply([{ type: "text", text: "采用需要审批。" }]);
    }) });
  assert.equal(store.get().rounds[0]!.answers[0]!.answer, "需要");
});

test("Pi compacts older context and preserves full history plus durable project memory", async () => {
  const store = memory();
  // Report high provider token usage so the SDK runs its actual automatic compaction boundary selection.
  await runStandardAgent("p", { operation: "chat", message: "介绍一下当前项目" }, store.get(), { settings, save: store.save, render, transport, signal: new AbortController().signal,
    stream: stream(() => reply([{ type: "text", text: "旧对话内容。".repeat(13000) }], 45000)) });
  assert.ok((store.get().compactionCount ?? 0) >= 1);
  assert.ok(store.get().piSession!.entries.some((entry: any) => entry.type === "compaction"));
  assert.ok(store.get().piSession!.entries.some((entry: any) => entry.type === "message" && entry.message.role === "user"));
  assert.deepEqual(store.get().memory, ["仅学生可以借阅"]);
  assert.equal(store.get().tokenUsage?.cumulative.total, 45000);
  assert.equal(store.get().tokenUsage?.contextTokens, null, "post-compaction estimate must wait for a new reply");
  const restored = restoreStandardSession("p", store.get().piSession);
  assert.ok(restored.getEntries().some(entry => entry.type === "compaction"));
  const revision = { operation: "edit" as const, messageId: store.get().conversation![0]!.id, expectedHeadId: store.get().conversation!.at(-1)!.id, message: "改为介绍预约项目" };
  const revised = await store.save(state => applyConversationRevision(state, revision));
  await runStandardAgent("p", revision, revised, { settings, save: store.save, render, transport, signal: new AbortController().signal,
    stream: stream(context => { assert.doesNotMatch(JSON.stringify(context.messages), /旧对话内容|ISBN|介绍一下当前项目/); assert.match(JSON.stringify(context.messages), /改为介绍预约项目/); return reply([{ type: "text", text: "预约项目的新介绍。" }]); }) });
  assert.equal(store.get().conversation!.length, 2); assert.equal(store.get().tokenUsage!.cumulative.total, 45030);
  const regenerate = { operation: "regenerate" as const, messageId: store.get().conversation!.at(-1)!.id, expectedHeadId: store.get().conversation!.at(-1)!.id };
  const resolved = resolveConversationRevision(store.get(), regenerate);
  await store.save(state => applyConversationRevision(state, regenerate));
  await runStandardAgent("p", resolved, store.get(), { settings, save: store.save, render, transport, signal: new AbortController().signal,
    stream: stream(context => { assert.doesNotMatch(JSON.stringify(context.messages), /预约项目的新介绍/); assert.match(JSON.stringify(context.messages), /改为介绍预约项目/); return reply([{ type: "text", text: "重新生成后的介绍。" }]); }) });
  assert.equal(store.get().conversation!.length, 2); assert.equal(store.get().conversation!.at(-1)!.text, "重新生成后的介绍。");
});
