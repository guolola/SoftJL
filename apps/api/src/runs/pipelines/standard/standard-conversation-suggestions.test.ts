// Verifies bounded, localized follow-ups without external calls or fabricated fallback suggestions.
import { compatibleTestModelCapability } from "../../../../tests/fixtures/providers/model-capability.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantMessageEventStream, getCurrentSystemPrompt, getCurrentTools } from "@earendil-works/pi-ai";
import { createStandardProjectState } from "@uml-platform/contracts";
import { standardPiModel } from "../../../adapters/llm/pi-provider.js";
import { generateConversationSuggestions } from "./standard-conversation-suggestions.js";
import { parseFollowUpSuggestions } from "../../../normalizers/standard/follow-up-suggestions.js";

test("normalizes the homepage protocol, removes duplicates and enforces durable bounds", () => {
  assert.deepEqual(parseFollowUpSuggestions('1. “补充预约时段的校验”\n- 补充预约时段的校验\n2) 为预约规则生成测试\n(3) 检查多级审批流程\n4. 多余建议'), ["补充预约时段的校验", "为预约规则生成测试", "检查多级审批流程"]);
  assert.deepEqual(parseFollowUpSuggestions("```\n" + "x".repeat(121)), []);
});

test("uses recent bounded conversation, UI language, managed model and a bounded output", async () => {
  const state = createStandardProjectState(); state.conversation = [
    { id: "u", role: "user", text: "head" + "a".repeat(30000), status: "completed", createdAt: "now" },
    { id: "a", role: "assistant", text: "Here is the answer", status: "completed", createdAt: "now" },
  ];
  const model = standardPiModel({ modelCapability: compatibleTestModelCapability("test"), model: "test", apiBaseUrl: "https://example.test", apiKey: "test" });
  let calls = 0;
  const suggestions = await generateConversationSuggestions(state, model, (selected, context, options) => {
    calls++; assert.equal(selected.id, "test"); assert.equal(options?.maxTokens, 1024); assert.ok(options?.signal);
    assert.match(getCurrentSystemPrompt(context.messages), /English/); assert.deepEqual(getCurrentTools(context.messages), []);
    const prompt = context.messages.find(message => message.role === "user")!.content as string; assert.ok(prompt.length <= 24000); assert.match(prompt, /head/); assert.match(prompt, /Here is the answer/);
    const output = createAssistantMessageEventStream();
    output.push({ type: "done", reason: "stop", message: { role: "assistant", content: [{ type: "text", text: "Check the approval flow\nAdd boundary tests\nExplain the class model" }], api: model.api, provider: model.provider, model: model.id,
      usage: { input: 10, output: 20, totalTokens: 30, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, total: 0, cacheRead: 0, cacheWrite: 0 } }, stopReason: "stop", timestamp: Date.now() } });
    return output;
  }, new AbortController().signal, "en");
  assert.equal(calls, 1); assert.equal(suggestions.length, 3);
  state.rounds = [{ questions: [{ id: "q", title: "范围？", options: ["A", "B"], recommendation: "A", multiple: false }], answers: [] }];
  assert.deepEqual(await generateConversationSuggestions(state, model, () => { throw new Error("must not call"); }, new AbortController().signal), []);
});

test("cancellation releases follow-ups even when a queued stream produces no events", async () => {
  const state = createStandardProjectState(); state.conversation = [{ id: "a", role: "assistant", text: "Completed reply", status: "completed", createdAt: "now" }];
  const model = standardPiModel({ modelCapability: compatibleTestModelCapability("test"), model: "test", apiBaseUrl: "https://example.test", apiKey: "test" });
  const controller = new AbortController();
  const pending = generateConversationSuggestions(state, model, () => createAssistantMessageEventStream(), controller.signal);
  controller.abort(new Error("cancelled"));
  await assert.rejects(pending, /cancelled/);
});
