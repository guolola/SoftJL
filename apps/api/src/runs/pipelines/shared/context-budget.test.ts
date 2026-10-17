// Checks admission against actual assembled messages, schemas and reserved output.
import assert from "node:assert/strict";
import test from "node:test";
import type { StreamChatCompletionInput } from "../../../llm.js";
import { engineeringContextBudget, withEngineeringContextBudget } from "./context-budget.js";
import { getRunError } from "./errors.js";
const request: StreamChatCompletionInput = { providerSettings: { apiBaseUrl: "https://example.test", apiKey: "test", model: "test" }, messages: [{ role: "user", content: "需求" }] };
const capacity = { context: 64000, output: 8192, source: "admin" as const, matchedId: null, updatedAt: null };
test("full CJK input and schema are budgeted before a provider call", async () => {
  let calls = 0;
  const transport = withEngineeringContextBudget({ async *streamChatCompletion() { calls++; yield "{}"; } }, capacity);
  const known = { ...request, providerSettings: { ...request.providerSettings, model: "gpt-4o" } };
  const input = { ...known, messages: [{ role: "user" as const, content: "约束 ".repeat(70000) }] };
  await assert.rejects(async () => { for await (const _ of transport.streamChatCompletion(input)) {} }, error => getRunError(error)?.code === "RUN_CONTEXT_LIMIT_EXCEEDED" && !getRunError(error)?.retryable);
  assert.equal(calls, 0);
  const schema = { ...known, responseFormat: { type: "json_schema" as const, json_schema: { name: "test", strict: true as const, schema: { description: "字段 ".repeat(70000) } } } };
  await assert.rejects(async () => { for await (const _ of transport.streamChatCompletion(schema)) {} });
  assert.equal(calls, 0);
});
test("admitted calls get explicit provider output cap without fabricating unknown capacity", async () => {
  let sent: StreamChatCompletionInput | undefined;
  for await (const _ of withEngineeringContextBudget({ async *streamChatCompletion(input) { sent = input; yield "{}"; } }, capacity).streamChatCompletion(request)) {}
  assert.equal(sent?.maxOutputTokens, 8192);
  assert.equal(engineeringContextBudget(request).context, null);
  assert.equal(engineeringContextBudget(request).capacitySource, "unknown");
});

test("DeepSeek and Qwen Chinese estimates do not become admission limits", async () => {
  for (const model of ["deepseek-v4.1-flash", "qwen3.7-plus"]) {
    const input = { ...request, providerSettings: { ...request.providerSettings, model }, messages: [{ role: "user" as const, content: "系统应确保用户只能查看自己的预约记录。".repeat(1800) }] };
    const budget = engineeringContextBudget(input, capacity);
    assert.equal(budget.tokenMethod, "character-estimate");
    assert.ok(budget.estimatedInput + budget.output < capacity.context);
    let called = false;
    // Even an estimate above a known small window is not proof for an unknown tokenizer.
    for await (const _ of withEngineeringContextBudget({ async *streamChatCompletion() { called = true; yield "{}"; } }, { ...capacity, context: 16000 }).streamChatCompletion(input)) {}
    assert.equal(called, true);
  }
});

test("unknown capacity delegates overflow to the provider even for a known tokenizer", async () => {
  let called = false;
  const input = { ...request, providerSettings: { ...request.providerSettings, model: "gpt-4o" }, messages: [{ role: "user" as const, content: "字段 ".repeat(70000) }] };
  for await (const _ of withEngineeringContextBudget({ async *streamChatCompletion() { called = true; yield "{}"; } }).streamChatCompletion(input)) {}
  assert.equal(called, true);
  const transport = withEngineeringContextBudget({ async *streamChatCompletion() { throw new Error("context_length_exceeded"); } });
  await assert.rejects(async () => { for await (const _ of transport.streamChatCompletion(request)) {} }, /模型容量未知/);
});
test("image payload bytes are not counted as text tokens", () => {
  const image = (data: string): StreamChatCompletionInput => ({ ...request, messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${data}` } }] }] });
  assert.equal(engineeringContextBudget(image("A")).estimatedInput, engineeringContextBudget(image("A".repeat(1000000))).estimatedInput);
});
test("known models use their tokenizer so Chinese bytes are not mistaken for tokens", () => {
  const content = "系统应确保用户只能查看自己的预约记录。".repeat(1800);
  const input = { ...request, providerSettings: { ...request.providerSettings, model: "gpt-4o" }, messages: [{ role: "user" as const, content }] };
  const budget = engineeringContextBudget(input, capacity);
  assert.equal(budget.tokenMethod, "o200k_base");
  assert.ok(Buffer.byteLength(content) > capacity.context);
  assert.ok(budget.estimatedInput + budget.output < capacity.context);
});
test("provider overflow remains actionable and non-retryable when image/token accounting differs", async () => {
  const transport = withEngineeringContextBudget({ async *streamChatCompletion() { throw new Error("context_length_exceeded"); } }, capacity);
  await assert.rejects(async () => { for await (const _ of transport.streamChatCompletion(request)) {} }, error => getRunError(error)?.code === "RUN_CONTEXT_LIMIT_EXCEEDED" && !getRunError(error)?.retryable);
});
