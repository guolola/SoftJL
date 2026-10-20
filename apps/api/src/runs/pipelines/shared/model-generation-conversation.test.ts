// Covers exact request prefixes, complete model replacement, repair limits and task isolation.
import assert from "node:assert/strict";
import test from "node:test";
import { ModelGenerationConversation } from "./model-generation-conversation.js";
import { createMessages } from "./llm-messages.js";

test("repairs append exact assistant outputs and feedback without rewriting earlier messages", () => {
  const initial = createMessages("生成当前功能图。权威需求：五个模块均可注册资源。");
  const session = new ModelGenerationConversation("function", initial);
  const firstRequest = session.messages;
  const raw = '{ "models": [], "requirementModelTraceability": [] }';
  session.accept(raw);
  session.prepare(new Error("relationships: 子功能存在多个父节点"));
  const secondRequest = session.messages;
  assert.deepEqual(secondRequest.slice(0, firstRequest.length), firstRequest);
  assert.deepEqual(secondRequest.map(message => message.role), ["system", "user", "assistant", "user"]);
  assert.equal(secondRequest[2]!.content, raw);
  assert.match(String(secondRequest[3]!.content), /多个父节点/);
  assert.match(String(secondRequest[3]!.content), /返回修正后的完整 JSON/);
  assert.doesNotMatch(String(secondRequest[3]!.content), /允许修改路径|修复上下文|baseFingerprint|targetId|full-output|"paths"|"round"/);
  const fixed = JSON.stringify({ models: [{ nodes: [{ id: "new" }], relationships: [] }], requirementModelTraceability: [] });
  assert.deepEqual(JSON.parse(session.accept(fixed)).models[0].nodes, [{ id: "new" }]);
  session.prepare(new Error("仍缺少来源映射"));
  assert.deepEqual(session.messages.slice(0, secondRequest.length), secondRequest);
  assert.equal(session.messages.at(-2)!.content, fixed);
  assert.deepEqual(firstRequest, initial);
});

test("invalid JSON and obsolete patches remain in history and do not reset the five-repair limit", () => {
  const session = new ModelGenerationConversation("class", createMessages("生成类图"));
  for (let round = 1; round <= 5; round++) {
    const raw = round === 1 ? '{"models":[' : '{"changes":[]}';
    assert.throws(() => session.accept(raw));
    session.prepare(new Error(`round ${round}`));
    assert.equal(session.messages.at(-2)!.content, raw);
    assert.equal(session.attempts, round);
  }
  assert.throws(() => session.prepare(new Error("one more")), /5 次/);
});

test("model tasks and returned request snapshots cannot mutate each other's history", async () => {
  const initial = createMessages("source");
  const first = new ModelGenerationConversation("first", initial);
  const second = new ModelGenerationConversation("second", initial);
  await Promise.all([first, second].map(async (session) => {
    session.accept(JSON.stringify({ models: [{ modelId: session.targetId }] }));
    session.prepare(new Error("invalid reference"));
  }));
  const snapshot = first.messages;
  snapshot[0]!.content = "overwrite";
  assert.notEqual(first.messages[0]!.content, "overwrite");
  assert.doesNotMatch(JSON.stringify(second.messages), /"modelId":"first"/);
  assert.deepEqual(initial, createMessages("source"));
});

test("artifact branches inherit generation history and spent repairs without sharing later turns", () => {
  const original = new ModelGenerationConversation("batch", createMessages("完整生成依据"), 2);
  original.accept('{"models":[]}');
  original.prepare(new Error("首次生成错误"));
  original.accept('{"models":[{"modelId":"first"},{"modelId":"second"}]}');
  const prefix = original.messages;
  const first = original.fork("first"), second = original.fork("second");
  first.prepare(new Error("只修复第一个模型"));
  assert.deepEqual(first.messages.slice(0, prefix.length), prefix);
  assert.deepEqual(second.messages, prefix);
  assert.deepEqual(original.messages, prefix);
  assert.equal(first.attempts, 2);
  assert.equal(second.attempts, 1);
  assert.throws(() => first.prepare(new Error("预算不能重置")), /共享 2 次/);
});
