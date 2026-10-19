// Ensures persisted reasoning applies to ordinary generation, repair and explicit-off requests without losing callbacks.
import { strictTestModelCapability } from "../../../test-fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { LlmTransport, StreamChatCompletionInput } from "../../../llm.js";
import { withRunReasoning } from "./run-reasoning.js";

for (const reasoning of [true, false, undefined]) test(`run reasoning preserves ${reasoning} on every call`, async () => {
  const calls: StreamChatCompletionInput[] = [];
  const transport: LlmTransport = { async *streamChatCompletion(input) { calls.push(input); yield "{}"; } };
  const wrapped = withRunReasoning(transport, reasoning);
  const onTokenUsage = () => {};
  for (const prompt of ["generate", "repair", "review"]) {
    for await (const _chunk of wrapped.streamChatCompletion({
      providerSettings: { modelCapability: strictTestModelCapability("test"), apiBaseUrl: "https://example.test", apiKey: "test", model: "test" },
      messages: [{ role: "user", content: prompt }], onTokenUsage,
    })) { /* Drain the stream to exercise deferred transport calls. */ }
  }
  assert.equal(calls.length, 3);
  for (const call of calls) { assert.equal(call.reasoning, reasoning); assert.equal(call.onTokenUsage, onTokenUsage); }
  if (reasoning === undefined) assert.equal(wrapped, transport);
});
