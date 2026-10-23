// Protects long-source repairs and rejects unsupported rules without partial publication.
import { strictTestModelCapability } from "../../../../tests/fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { LlmTransport, StreamChatCompletionInput } from "../../../adapters/llm/llm-transport.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { extractRequirementRulesWithRepair } from "./extract-requirement-rules.js";
import { createContextualLlmTransport } from "../shared/conversation-context.js";

const providerSettings = { modelCapability: strictTestModelCapability("test"), apiBaseUrl: "https://example.test", apiKey: "test", model: "test" };
const rule = (sourceFragment: string) => ({ id: "r1", type: "functional" as const, text: "用户提交预约", sourceFragment,  });
function record(text: string): RunRecord {
  return { snapshot: createEmptySnapshot("extract-test", text, [], []), events: [], listeners: new Set(), terminal: false };
}

test("successful extraction stores semantic metadata without LLM model associations", async () => {
  const source = "用户提交预约。";
  let calls = 0;
  const result = await extractRequirementRulesWithRepair({ record: record(source), requirementText: source, providerSettings,
    llmTransport: { async *streamChatCompletion() {
      calls++;
      yield JSON.stringify({ rules: [{ id: "r1", type: "functional" as const, text: "用户提交预约", sourceFragment: source }] });
    } },
  });
  assert.equal(calls, 1);
  assert.equal("relatedDiagrams" in result.rules[0]!, false);
  assert.equal("category" in result.rules[0]!, false);
});

test("source mismatch repairs with complete long input and draft", async () => {
  const source = "业务背景。".repeat(10000) + "用户提交预约。SOURCE_TAIL";
  const draft = JSON.stringify({ rules: [{ ...rule("不存在的来源"), text: "预约".repeat(18000) + "DRAFT_TAIL" }] });
  const calls: StreamChatCompletionInput[] = [];
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    calls.push(input);
    yield calls.length === 1 ? draft : JSON.stringify({ rules: [rule("用户提交预约。")] });
  } };
  const result = await extractRequirementRulesWithRepair({ record: record(source), requirementText: source, providerSettings, llmTransport: createContextualLlmTransport(transport) });
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
  assert.equal(calls, 6);
});

test("labeled source preserves original spacing", async () => {
  const source = "[R-1]   用户提交预约。";
  let calls = 0;
  const result = await extractRequirementRulesWithRepair({ record: record(source), requirementText: source, providerSettings,
    llmTransport: { async *streamChatCompletion() { yield JSON.stringify({ rules: ++calls === 1 ? [] : [rule(source)] }); } },
  });
  assert.equal(calls, 2);
  assert.equal(result.rules[0]?.sourceFragment, source);
});

test("obsolete metadata triggers repair instead of being silently converted", async () => {
  const source = "用户提交预约。";
  let calls = 0;
  const result = await extractRequirementRulesWithRepair({ record: record(source), requirementText: source, providerSettings,
    llmTransport: { async *streamChatCompletion() {
      calls++;
      yield JSON.stringify(calls === 1 ? { rules: [{ ...rule(source), classification: { kind: "functional" } }] } : { rules: [rule(source)] });
    } },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.rules[0], rule(source));
});
