// Protects long-source repairs and rejects unsupported rules without partial publication.
import assert from "node:assert/strict";
import test from "node:test";
import type { LlmTransport, StreamChatCompletionInput } from "../../../llm.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { extractRequirementRulesWithRepair } from "./extract-requirement-rules.js";
import { createContextualLlmTransport } from "../shared/conversation-context.js";

const providerSettings = { apiBaseUrl: "https://example.test", apiKey: "test", model: "test" };
const rule = (sourceFragment: string) => ({ id: "r1", category: "功能需求", text: "用户提交预约", sourceFragment, relatedDiagrams: ["usecase"] });
function record(text: string): RunRecord {
  return { snapshot: createEmptySnapshot("extract-test", text, [], []), events: [], listeners: new Set(), terminal: false };
}

test("source mismatch repairs with complete long input and draft", async () => {
  const source = "业务背景。".repeat(10000) + "用户提交预约。SOURCE_TAIL";
  const draft = JSON.stringify({ rules: [{ ...rule("不存在的来源"), text: "预约".repeat(18000) + "DRAFT_TAIL" }] });
  const calls: StreamChatCompletionInput[] = [];
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    calls.push(input);
    yield calls.length === 1 ? draft : JSON.stringify({ rules: [rule("用户提交预约。")] });
  } };
  const result = await extractRequirementRulesWithRepair({ record: record(source), requirementText: source, providerSettings, llmTransport: createContextualLlmTransport(transport).transport });
  assert.equal(calls.length, 2);
  assert.ok(String(calls[1]!.messages.at(-1)!.content).includes(source));
  assert.ok(String(calls[1]!.messages.at(-1)!.content).includes(draft));
  assert.equal(result.rules.length, 1);
});

test("persistent invalid source fails the complete extraction after bounded repairs", async () => {
  let calls = 0;
  const source = "用户提交预约。";
  await assert.rejects(extractRequirementRulesWithRepair({ record: record(source), requirementText: source, providerSettings,
    llmTransport: { async *streamChatCompletion() { calls++; yield JSON.stringify({ rules: [rule(source), { ...rule("不存在"), id: "r2" }] }); } },
  }), /sourceFragment/);
  assert.equal(calls, 3);
});

test("labeled source preserves original spacing", async () => {
  const source = "[R-1]   用户提交预约。";
  const result = await extractRequirementRulesWithRepair({ record: record(source), requirementText: source, providerSettings,
    llmTransport: { async *streamChatCompletion() { yield '{"rules":[]}'; } },
  });
  assert.equal(result.rules[0]?.sourceFragment, source);
});
