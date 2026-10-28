// Inspects real Pi/OpenAI request bodies with a local fetch stub; no external model or DNS calls occur.
import test from "node:test";
import assert from "node:assert/strict";
import { createStandardPiStream, standardPiModel } from "./pi-provider.js";
import { createInMemoryLlmScheduler } from "./llm-scheduler.js";

test("DeepSeek reasoning is an enabled/disabled switch without an unverified effort level", async t => {
  const requests: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ?? (url instanceof Request ? await url.text() : "");
    requests.push(JSON.parse(String(body)));
    return new Response([
      'data: {"id":"test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"OK"},"finish_reason":null}]}',
      'data: {"id":"test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}',
      'data: [DONE]', "",
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } });
  });
  for (const [id, enabled] of [["deepseek-v4.1-flash", false], ["deepseek-v4.1-flash", true], ["gpt-reasoning", true]] as const) {
    // Public literal address passes the managed URL policy without DNS; the fetch stub prevents networking.
    const settings = { model: id, apiBaseUrl: "https://8.8.8.8/v1", apiKey: "test-only" };
    const model = standardPiModel(settings, { context: 64000, output: 8192, source: "models.dev", matchedId: id, updatedAt: null,
      capabilities: { reasoning: true, vision: false, toolCall: true } });
    const stream = createStandardPiStream({ settings, scheduler: createInMemoryLlmScheduler(), signal: new AbortController().signal,
      beforeRequest: async () => {}, context: { runId: "test", model: id, taskType: "requirements_to_uml" } });
    const response = await (await stream(model, { messages: [{ role: "user", content: "Explain this project", timestamp: 1 }] }, enabled ? { reasoning: "medium" } : {})).result();
    assert.equal(response.stopReason, "stop", response.errorMessage);
    const request = requests.at(-1)!;
    if (id.startsWith("deepseek")) {
      assert.deepEqual(request.thinking, { type: enabled ? "enabled" : "disabled" });
      assert.equal(Object.hasOwn(request, "reasoning_effort"), false);
    } else assert.equal(request.reasoning_effort, "medium", "other model request shaping remains provider-specific");
  }
  assert.equal(requests.length, 3);
});
