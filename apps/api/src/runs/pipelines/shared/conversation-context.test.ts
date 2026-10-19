// Verifies run-local chat history and independent concurrent branch context.
import { strictTestModelCapability } from "../../../test-fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage, LlmTransport } from "../../../llm.js";
import { createContextualLlmTransport, systemNameFromProjectName, withConversationBranch, withIsolatedConversationBranch } from "./conversation-context.js";

async function request(transport: LlmTransport, prompt: string) {
  let output = "";
  for await (const chunk of transport.streamChatCompletion({
    providerSettings: { modelCapability: strictTestModelCapability("test"), apiBaseUrl: "https://example.test", apiKey: "test", model: "test" },
    messages: [{ role: "system", content: "JSON only" }, { role: "user", content: prompt }],
  })) output += chunk;
  return output;
}

test("every stage carries the project's canonical system name", async () => {
  const calls: ChatMessage[][] = [];
  const context = createContextualLlmTransport(
    { async *streamChatCompletion(input) { calls.push(input.messages); yield "{}"; } },
    { systemName: "高校教室管理系统" },
  );
  await request(context.transport, "Generate use cases");
  await request(context.transport, "Generate activity");
  for (const messages of calls) {
    const system = messages.find((message) => message.role === "system");
    assert.match(String(system?.content), /^JSON only/u);
    assert.equal(String(system?.content).split("系统名称约束：").length, 2);
    assert.match(String(system?.content), /高校教室管理系统/u);
  }
  assert.equal(systemNameFromProjectName("高校教室管理系统"), "高校教室管理系统");
  assert.equal(systemNameFromProjectName("课程 UML 实验项目"), undefined);
});

test("subsequent calls use only their explicit inputs", async () => {
  const calls: ChatMessage[][] = [];
  const base: LlmTransport = {
    async *streamChatCompletion(input) {
      calls.push(input.messages);
      yield calls.length === 1 ? '{"draft":true}' : '{"draft":false}';
    },
  };
  const context = createContextualLlmTransport(base);
  await request(context.transport, "Generate model");
  await request(context.transport, "Fix invalid relationship");
  assert.deepEqual(calls[1]?.map((message) => message.role), ["system", "user"]);
  assert.doesNotMatch(JSON.stringify(calls[1]), /Generate model|draft/);
});

test("all current input stays complete when zero, one or two prior turns exceed the history budget", async () => {
  for (const prior of [0, 1, 2]) {
    const calls: ChatMessage[][] = [];
    const context = createContextualLlmTransport({ async *streamChatCompletion(input) { calls.push(input.messages); yield "{}"; } });
    for (let index = 0; index < prior; index++) await request(context.transport, "Earlier turn");
    const text = "完整权威输入".repeat(14000) + "END_OF_CURRENT_MODEL";
    await request(context.transport, text);
    assert.equal(calls.at(-1)?.at(-1)?.content, text);
    assert.equal(calls.at(-1)?.filter((message) => message.content === text).length, 1);
  }
});

test("parallel diagram branches never inherit screening or validated sibling output", async () => {
  const calls: Array<{ branch: string; messages: ChatMessage[] }> = [];
  const base: LlmTransport = {
    async *streamChatCompletion(input) {
      const prompt = String(input.messages.at(-1)?.content);
      calls.push({ branch: prompt, messages: input.messages });
      yield prompt;
    },
  };
  const context = createContextualLlmTransport(base);
  await request(context.transport, "Shared rules");
  await Promise.all([
    withConversationBranch("usecase", () => request(context.transport, "Use case")),
    withConversationBranch("class", () => request(context.transport, "Class")),
  ]);
  assert.equal(JSON.stringify(calls[1]?.messages).includes("Class"), false);
  assert.equal(JSON.stringify(calls[2]?.messages).includes("Use case"), false);
  context.commitValidatedBranch("usecase", "Validated use case model");
  await request(context.transport, "Next stage");
  assert.doesNotMatch(JSON.stringify(calls.at(-1)?.messages), /Validated use case model|Shared rules/);
  assert.doesNotMatch(JSON.stringify(calls.at(-1)?.messages), /已验证子任务 class/);
});

test("queued and lazy branches are independent of sibling completion order", async () => {
  const calls: ChatMessage[][] = [];
  const context = createContextualLlmTransport({ async *streamChatCompletion(input) {
    calls.push(input.messages);
    yield "validated output";
  } });
  await request(context.transport, "Shared rules");
  context.forkBranches(["first", "queued"]);
  await withConversationBranch("first", () => request(context.transport, "First diagram"));
  context.commitValidatedBranch("first", "First validated diagram");
  await withConversationBranch("queued", () => request(context.transport, "Queued diagram"));
  assert.doesNotMatch(JSON.stringify(calls.at(-1)), /First validated diagram/);
  assert.doesNotMatch(JSON.stringify(calls.at(-1)), /Shared rules/);
  await withConversationBranch("lazy", () => request(context.transport, "Lazy diagram"));
  assert.doesNotMatch(JSON.stringify(calls.at(-1)), /Shared rules|First validated diagram/);
});

test("current stage system constraints supersede earlier response contracts", async () => {
  const calls: ChatMessage[][] = [];
  const context = createContextualLlmTransport({ async *streamChatCompletion(input) {
    calls.push(input.messages); yield "{}";
  } });
  for (const instruction of ["Classify input", "Generate UML model"]) {
    for await (const _ of context.transport.streamChatCompletion({
      providerSettings: { modelCapability: strictTestModelCapability("test"), apiBaseUrl: "https://example.test", apiKey: "test", model: "test" },
      messages: [{ role: "system", content: instruction }, { role: "user", content: "input" }],
    })) { /* Drain the stream to retain the completed turn. */ }
  }
  assert.deepEqual(calls[1]?.filter((message) => message.role === "system"), [{ role: "system", content: "Generate UML model" }]);
});

test("isolated review turns do not inherit stale drafts and retain the complete current model", async () => {
  const calls: ChatMessage[][] = [];
  const context = createContextualLlmTransport({ async *streamChatCompletion(input) { calls.push(input.messages); yield "STALE_GENERATED_DRAFT"; } });
  await request(context.transport, "Generate old model");
  await withIsolatedConversationBranch("current-review", () => request(context.transport, "COMPLETE_CURRENT_MODEL"));
  assert.deepEqual(calls[1].map((item) => item.role), ["system", "user"]);
  assert.doesNotMatch(JSON.stringify(calls[1]), /STALE_GENERATED_DRAFT|Generate old model/);
});
