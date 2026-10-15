// Verifies same-conversation repair, screening isolation, bounded attempts, and interruption handling.
import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderSettings } from "@uml-platform/contracts";
import type { LlmTransport, StreamChatCompletionInput } from "../../../llm.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { RunCancelledError } from "../../records/run-cancellation.js";
import { createContextualLlmTransport } from "../shared/conversation-context.js";
import { extractRequirementRulesWithRepair } from "./extract-requirement-rules.js";

const requirementText = "用户可以录入日程事件。";
const rule = { id: "r1", category: "功能需求", text: requirementText, sourceFragment: requirementText, relatedDiagrams: ["usecase"] };
const validOutput = JSON.stringify({ rules: [rule] });
const wrongRoot = JSON.stringify({ units: [rule] });
const providerSettings: ProviderSettings = { apiBaseUrl: "https://llm.test", apiKey: "test", model: "test-model" };

function setup(respond: (input: StreamChatCompletionInput, call: number, record: RunRecord) => string | Error) {
  const record: RunRecord = { snapshot: createEmptySnapshot("extract-repair-test", requirementText, []), events: [], listeners: new Set(), terminal: false };
  const calls: StreamChatCompletionInput[] = [];
  const base: LlmTransport = {
    async *streamChatCompletion(input) {
      calls.push(input);
      const response = respond(input, calls.length, record);
      if (response instanceof Error) throw response;
      yield response;
    },
  };
  const conversation = createContextualLlmTransport(base);
  record.conversationContext = conversation;
  const extract = (abortSignal?: AbortSignal) => extractRequirementRulesWithRepair({ record, requirementText, providerSettings, llmTransport: conversation.transport, abortSignal });
  return { record, calls, conversation, extract };
}

test("valid first output completes without a repair call", async () => {
  const { calls, record, extract } = setup(() => validOutput);
  const result = await extract();
  assert.equal(result.rules.length, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].messages.map((message) => message.role), ["system", "user"]);
  assert.ok(String(calls[0].messages[1].content).includes('{"rules":[...]}'));
  assert.equal(record.events.filter((event) => event.type === "stage_progress" && event.message.includes("正在修复")).length, 0);
});

test("schema failure appends user feedback after the original request and assistant output", async () => {
  const { calls, record, extract } = setup((_input, call) => call === 1 ? wrongRoot : validOutput);
  const result = await extract();
  assert.equal(result.rules[0].text, rule.text);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].messages.map((message) => message.role), ["system", "user", "assistant", "user"]);
  assert.deepEqual(calls[1].messages[1], calls[0].messages[1]);
  assert.equal(calls[1].messages[2].content, wrongRoot);
  assert.match(String(calls[1].messages[3].content), /"rules"/);
  assert.match(String(calls[1].messages[3].content), /undefined/);
  assert.doesNotMatch(String(calls[1].messages[3].content), /原始需求：/);
  assert.deepEqual(calls[1].responseFormat, calls[0].responseFormat);
  const events = record.events.filter((event) => event.type === "run_activity");
  assert.ok(events.some((event) => event.phase === "failed"));
  assert.ok(events.some((event) => event.phase === "completed" && event.operation === "model_repair" && event.round === 1));
});

test("the second repair retains both assistant drafts and uses the latest validation error", async () => {
  const outputs = [wrongRoot, '{"rules":', validOutput];
  const { calls, extract } = setup((_input, call) => outputs[call - 1]);
  await extract();
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].messages.map((message) => message.role), ["system", "user", "assistant", "user", "assistant", "user"]);
  assert.equal(calls[2].messages[2].content, wrongRoot);
  assert.equal(calls[2].messages[4].content, outputs[1]);
  assert.notEqual(calls[2].messages[5].content, calls[1].messages[3].content);
});

test("screening turns with units never enter the extraction conversation", async () => {
  const { calls, conversation, extract } = setup((_input, call) => call === 1 ? '{"units":[{"id":"u1","category":"requirement"}]}' : call === 2 ? wrongRoot : validOutput);
  for await (const _ of conversation.transport.streamChatCompletion({ providerSettings, messages: [{ role: "system", content: "SCREENING_ONLY" }, { role: "user", content: "CLASSIFY_INPUT" }] })) { /* Drain the screening result. */ }
  await extract();
  assert.deepEqual(calls[1].messages.map((message) => message.role), ["system", "user"]);
  assert.deepEqual(calls[2].messages.map((message) => message.role), ["system", "user", "assistant", "user"]);
  assert.doesNotMatch(JSON.stringify(calls.slice(1).map((call) => call.messages)), /SCREENING_ONLY|CLASSIFY_INPUT/);
});

test("invalid output stops after two repairs without changing the saved rules", async () => {
  const { calls, record, extract } = setup(() => wrongRoot);
  record.snapshot.rules = [rule as typeof record.snapshot.rules[number]];
  await assert.rejects(extract, (error: unknown) => error instanceof Error && error.message.includes('"rules"'));
  assert.equal(calls.length, 3);
  assert.equal(record.events.filter((event) => event.type === "stage_progress" && event.message.includes("正在修复")).length, 2);
  assert.deepEqual(record.snapshot.rules, [rule]);
});

test("provider failure is returned immediately instead of being treated as invalid JSON", async () => {
  const failure = new Error("HTTP 503 provider unavailable");
  const { calls, extract } = setup(() => failure);
  await assert.rejects(extract, (error) => error === failure);
  assert.equal(calls.length, 1);
});

test("provider failure during repair does not start another format repair", async () => {
  const failure = new Error("fetch failed");
  const { calls, extract } = setup((_input, call) => call === 1 ? wrongRoot : failure);
  await assert.rejects(extract, (error) => error === failure);
  assert.equal(calls.length, 2);
});

test("cancellation and an aborted timeout signal stop before the next repair", async () => {
  for (const cancel of [true, false]) {
    const controller = new AbortController();
    const timeout = new Error("extraction timeout");
    const { calls, extract } = setup((_input, _call, record) => {
      if (cancel) record.snapshot.status = "cancelled";
      else controller.abort(timeout);
      return wrongRoot;
    });
    await assert.rejects(() => extract(controller.signal), (error) => cancel ? error instanceof RunCancelledError : error === timeout);
    assert.equal(calls.length, 1);
  }
});
