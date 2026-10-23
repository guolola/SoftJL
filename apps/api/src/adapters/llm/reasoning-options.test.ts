// Verifies engineering reasoning switches reach the actual provider request using native family options.
import assert from "node:assert/strict";
import test from "node:test";
import { createRealLlmTransport, type OpenAiCompatibleClientFactory } from "./llm-transport.js";

test("real transport sends enabled and disabled reasoning using the same families as quick modeling", async () => {
  let body: Record<string, unknown> = {};
  const clientFactory: OpenAiCompatibleClientFactory = () => ({
    chat: { completions: { async create(request) {
      body = request as unknown as Record<string, unknown>;
      return { async *[Symbol.asyncIterator]() { yield { choices: [{ delta: { content: "ok" } }] }; } };
    } } },
    models: { async list() { return { data: [] }; } },
  });
  const transport = createRealLlmTransport({ clientFactory, resolveHostname: async () => ["8.8.8.8"] });
  for (const model of ["deepseek-v4.1-flash", "glm-5", "qwen3", "gpt-reasoning"]) {
    for (const reasoning of [false, true, undefined]) {
      for await (const _ of transport.streamChatCompletion({
        providerSettings: { apiBaseUrl: "https://llm.test", apiKey: "test", model },
        messages: [{ role: "user", content: "需求" }], reasoning,
      })) { /* Drain the mocked provider stream. */ }
      if (reasoning === undefined) {
        assert.equal(body.thinking, undefined);
        assert.equal(body.enable_thinking, undefined);
        assert.equal(body.reasoning_effort, undefined);
      } else if (/^(deepseek|glm)/.test(model)) {
        assert.deepEqual(body.thinking, { type: reasoning ? "enabled" : "disabled" });
        assert.equal(body.reasoning_effort, undefined);
      } else if (model.startsWith("qwen")) assert.equal(body.enable_thinking, reasoning);
      else assert.equal(body.reasoning_effort, reasoning ? "medium" : "none");
    }
  }
});
