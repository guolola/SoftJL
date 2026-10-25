// Checks admission against actual assembled messages, schemas and reserved output.
import { strictTestModelCapability } from "../../../../tests/fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { StreamChatCompletionInput } from "../../../adapters/llm/llm-transport.js";
import { engineeringContextBudget, withEngineeringContextBudget } from "./context-budget.js";
import { getRunError } from "./errors.js";
const request: StreamChatCompletionInput = { providerSettings: { modelCapability: strictTestModelCapability("test"), apiBaseUrl: "https://example.test", apiKey: "test", model: "test" }, messages: [{ role: "user", content: "需求" }] };
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
  assert.equal(engineeringContextBudget(request).output, null);
  for await (const _ of withEngineeringContextBudget({ async *streamChatCompletion(input) { sent = input; yield "{}"; } }).streamChatCompletion(request)) {}
  assert.equal(sent?.maxOutputTokens, undefined, "Unknown capacity must not introduce a fixed output limit");
});

test("catalog output above 16k and one third of context reaches the provider unchanged", async () => {
  const model = { ...request, providerSettings: { ...request.providerSettings, model: "deepseek-flash" } };
  const large = { ...capacity, context: 1_000_000, output: 384_000 };
  const limits: Array<number | undefined> = [];
  const transport = withEngineeringContextBudget({ async *streamChatCompletion(input) { limits.push(input.maxOutputTokens); yield "{}"; } }, large);
  for (const input of [model, { ...model, maxOutputTokens: 800_000 }, { ...model, maxOutputTokens: 4096 }]) {
    for await (const _ of transport.streamChatCompletion(input)) {}
  }
  assert.deepEqual(limits, [384_000, 384_000, 4096]);
});

test("reliable input counts leave the remaining context available for output on every turn", async () => {
  const known = { ...request, providerSettings: { ...request.providerSettings, model: "gpt-4o" } };
  const fullWindow = { ...capacity, output: capacity.context };
  const sent: number[] = [];
  const transport = withEngineeringContextBudget({ async *streamChatCompletion(input) { sent.push(input.maxOutputTokens!); yield "{}"; } }, fullWindow);
  for (const input of [known, { ...known, messages: [...known.messages, { role: "assistant" as const, content: "业务条件 ".repeat(3000) }] }]) {
    for await (const _ of transport.streamChatCompletion(input)) {}
    const budget = engineeringContextBudget(input, fullWindow);
    assert.equal(budget.estimatedInput + sent.at(-1)!, fullWindow.context);
  }
  assert.ok(sent[0]! > fullWindow.context / 3);
  assert.ok(sent[1]! < sent[0]!, "Growing tool history must reduce the available output space");
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
    assert.equal(engineeringContextBudget(input, { ...capacity, context: 16000 }).output, capacity.output);
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
