// Verifies LLM transport request shaping, provider settings handling, and response parsing helpers.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createRealLlmTransport,
  listOpenAiCompatibleModels,
  normalizeStreamTokenUsage,
  parseChatCompletionSse,
  ProviderHttpError,
  resolveChatCompletionsUrl,
  resolveOpenAiBaseUrl,
} from "./llm.js";
import type { ChatMessage, OpenAiCompatibleClientFactory } from "./llm.js";
import type { ProviderRequestRetryEvent } from "./adapters/llm/request-retry.js";

const resolvePublicHostname = async () => ["8.8.8.8"];

const retryTestInput = {
  providerSettings: { apiBaseUrl: "https://provider.test", apiKey: "sk-test", model: "test-model" },
  messages: [{ role: "user" as const, content: "generate model" }],
};
const flushRetries = () => new Promise<void>((resolve) => setImmediate(resolve));

async function drain(stream: AsyncIterable<string>) {
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

test("JSON mode satisfies provider validation for explicit, default and image requests without mutating inputs", async () => {
  for (const variant of ["explicit", "default", "image", "existing-instruction"] as const) {
    const messages: ChatMessage[] = variant === "image"
      ? [{ role: "user", content: [{ type: "text", text: "读取模型" }, { type: "image_url", image_url: { url: "https://images.test/json/model.png" } }] }]
      : [{ role: "system", content: variant === "existing-instruction" ? "只返回 Json。" : "只补齐缺失来源映射。" }, { role: "user", content: "生成结果" }];
    const original = structuredClone(messages);
    let calls = 0;
    const clientFactory: OpenAiCompatibleClientFactory = () => ({
      chat: { completions: { create: async (body) => {
        calls++;
        const request = body as unknown as { messages: ChatMessage[]; response_format: { type: string } };
        assert.equal(request.response_format.type, "json_object");
        const text = request.messages.flatMap(({ content }) => typeof content === "string" ? [content] : content.flatMap(part => part.type === "text" ? [part.text] : [])).join("\n");
        if (!/json/i.test(text)) throw { status: 400, message: "Prompt must contain the word 'json'" };
        assert.deepEqual(variant === "existing-instruction" ? request.messages : request.messages.slice(1), original);
        if (variant !== "existing-instruction") assert.equal(request.messages[0]?.role, "system");
        return (async function* () { yield { choices: [{ delta: { content: '{"ok":true}' } }] }; })() as never;
      } } }, models: { list: async () => ({ data: [] }) },
    });
    const transport = createRealLlmTransport({ clientFactory, resolveHostname: resolvePublicHostname });
    const output = await drain(transport.streamChatCompletion({ ...retryTestInput, messages,
      responseFormat: variant === "default" ? undefined : { type: "json_object" },
    }));
    assert.deepEqual(output, ['{"ok":true}']);
    assert.equal(calls, 1);
    assert.deepEqual(messages, original);
  }
});

test("plain text and strict schema requests retain their original messages", async () => {
  for (const responseFormat of [null, { type: "json_schema", json_schema: { name: "model", strict: true, schema: { type: "object" } } }] as const) {
    const clientFactory: OpenAiCompatibleClientFactory = () => ({
      chat: { completions: { create: async (body) => {
        assert.deepEqual(body.messages, retryTestInput.messages);
        return (async function* () { yield { choices: [{ delta: { content: "ok" } }] }; })() as never;
      } } }, models: { list: async () => ({ data: [] }) },
    });
    const transport = createRealLlmTransport({ clientFactory, resolveHostname: resolvePublicHostname });
    assert.deepEqual(await drain(transport.streamChatCompletion({ ...retryTestInput, responseFormat })), ["ok"]);
  }
});

test("real transport retries a gateway 503 with the same prompt and records recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(Math, "random", () => 0);
  const warnings = t.mock.method(console, "warn", () => {});
  const bodies: string[] = [];
  let resolveCalls = 0;
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body));
    if (bodies.length === 1) return new Response("<h1>503 Service Temporarily Unavailable</h1><hr>nginx", { status: 503 });
    return createResponseFromSse([
      'data: {"choices":[{"delta":{"content":"model"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":20}}\n\n',
      "data: [DONE]\n\n",
    ]);
  });
  const events: ProviderRequestRetryEvent[] = [];
  const usages: unknown[] = [];
  const transport = createRealLlmTransport({ resolveHostname: async () => { resolveCalls++; return ["8.8.8.8"]; } });
  const result = drain(transport.streamChatCompletion({ ...retryTestInput,
    onRequestRetry: (event) => events.push(event), onTokenUsage: (usage) => usages.push(usage),
  }));
  await flushRetries();
  assert.equal(bodies.length, 1);
  t.mock.timers.tick(1_000);
  assert.deepEqual(await result, ["model"]);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(resolveCalls, 2);
  assert.equal(usages.length, 1);
  assert.deepEqual(events, [{ retry: 1, delayMs: 1_000, statusCode: 503, reason: "http" }]);
  assert.doesNotMatch(JSON.stringify(warnings.mock.calls), /sk-test|generate model/);
});

test("transient retry budget is shared across JSON and stream-usage compatibility fallbacks", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(Math, "random", () => 0);
  t.mock.method(console, "warn", () => {});
  const bodies: Array<Record<string, unknown>> = [];
  const clientFactory: OpenAiCompatibleClientFactory = () => ({
    chat: { completions: { create: async (body) => {
      bodies.push(body as unknown as Record<string, unknown>);
      if (bodies.length === 2) throw { status: 400, message: "response_format json_schema unsupported" };
      if (bodies.length === 4) throw { status: 400, message: "stream_options include_usage unsupported" };
      throw { status: 503, message: "gateway unavailable" };
    } } }, models: { list: async () => ({ data: [] }) },
  });
  const transport = createRealLlmTransport({ clientFactory, resolveHostname: resolvePublicHostname });
  const retries: ProviderRequestRetryEvent[] = [];
  const formats: unknown[] = [];
  const unavailable: string[] = [];
  const rejected = assert.rejects(drain(transport.streamChatCompletion({ ...retryTestInput,
    responseFormat: { type: "json_schema", json_schema: { name: "model", strict: true, schema: { type: "object" } } },
    onRequestRetry: (event) => retries.push(event), onResponseFormatFallback: (event) => formats.push(event),
    onUsageUnavailable: (reason) => unavailable.push(reason),
  })), (error) => error instanceof ProviderHttpError && error.status === 503);
  for (const delay of [1_000, 2_000, 4_000]) { await flushRetries(); t.mock.timers.tick(delay); }
  await rejected;
  assert.equal(bodies.length, 6);
  assert.deepEqual(retries.map((event) => event.retry), [1, 2, 3]);
  assert.equal(formats.length, 1);
  assert.deepEqual(unavailable, ["provider_rejected_stream_usage"]);
  assert.equal((bodies[2].response_format as { type: string }).type, "json_object");
  assert.equal(bodies[4].stream_options, undefined);
});

test("transport never replays an established stream, including reasoning-only and partial output failures", async () => {
  for (const delta of [null, { reasoning_content: "thinking" }, { content: "partial model" }]) {
    let calls = 0;
    const clientFactory: OpenAiCompatibleClientFactory = () => ({
      chat: { completions: { create: async () => {
        calls++;
        return (async function* () {
          if (delta) yield { choices: [{ delta }] };
          throw Object.assign(new Error("stream interrupted"), { status: 503 });
        })() as never;
      } } }, models: { list: async () => ({ data: [] }) },
    });
    const retries: ProviderRequestRetryEvent[] = [];
    const output: string[] = [], reasoning: string[] = [];
    const transport = createRealLlmTransport({ clientFactory, resolveHostname: resolvePublicHostname });
    await assert.rejects(async () => {
      for await (const chunk of transport.streamChatCompletion({ ...retryTestInput,
        onRequestRetry: (event) => retries.push(event), onReasoningChunk: (chunk) => reasoning.push(chunk),
      })) output.push(chunk);
    }, /stream interrupted/);
    assert.equal(calls, 1);
    assert.deepEqual(retries, []);
    assert.deepEqual(output, delta && "content" in delta ? ["partial model"] : []);
    assert.deepEqual(reasoning, delta && "reasoning_content" in delta ? ["thinking"] : []);
  }
});

test("cancelling transport during backoff prevents another provider request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(console, "warn", () => {});
  const controller = new AbortController();
  let calls = 0;
  const clientFactory: OpenAiCompatibleClientFactory = () => ({
    chat: { completions: { create: async () => { calls++; throw { status: 503 }; } } },
    models: { list: async () => ({ data: [] }) },
  });
  const transport = createRealLlmTransport({ clientFactory, resolveHostname: resolvePublicHostname });
  const rejected = assert.rejects(drain(transport.streamChatCompletion({ ...retryTestInput, abortSignal: controller.signal })), /cancelled/);
  await flushRetries();
  controller.abort(new Error("cancelled"));
  await rejected;
  t.mock.timers.tick(60_000);
  assert.equal(calls, 1);
});

test("engineering output reservations reach compatible and reasoning provider requests", async () => {
  for (const model of ["gpt-4o", "gpt-5.5", "deepseek-chat"]) {
    let body: Record<string, unknown> = {};
    const clientFactory: OpenAiCompatibleClientFactory = () => ({
      chat: { completions: { create: async (input) => {
        body = input as unknown as Record<string, unknown>;
        return (async function* () { yield { choices: [{ delta: { content: "{}" } }] }; })() as never;
      } } }, models: { list: async () => ({ data: [] }) },
    });
    const transport = createRealLlmTransport({ clientFactory, resolveHostname: resolvePublicHostname });
    for await (const _ of transport.streamChatCompletion({ providerSettings: { apiBaseUrl: "https://provider.test", apiKey: "test", model }, messages: [{ role: "user", content: "模型" }], maxOutputTokens: 4096 })) {}
    assert.equal(body[model === "gpt-5.5" ? "max_completion_tokens" : "max_tokens"], 4096);
  }
});

test("normalizeStreamTokenUsage supports OpenAI and Responses-compatible fields", () => {
  assert.deepEqual(normalizeStreamTokenUsage({
    prompt_tokens: 120,
    completion_tokens: 30,
    total_tokens: 150,
    prompt_tokens_details: { cached_tokens: 40 },
    completion_tokens_details: { reasoning_tokens: 12 },
  }), {
    inputTokens: 120,
    outputTokens: 30,
    cachedInputTokens: 40,
    reasoningTokens: 12,
    totalTokens: 150,
  });
  assert.deepEqual(normalizeStreamTokenUsage({ input_tokens: 20, output_tokens: 5 }), {
    inputTokens: 20,
    outputTokens: 5,
    cachedInputTokens: null,
    reasoningTokens: null,
    totalTokens: 25,
  });
  assert.equal(normalizeStreamTokenUsage({}), null);
});

function createResponseFromSse(blocks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const block of blocks) {
        controller.enqueue(encoder.encode(block));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
}

test("parseChatCompletionSse aggregates chunks until DONE", async () => {
  const response = createResponseFromSse([
    'data: {"choices":[{"delta":{"content":"{\\"rules\\":"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"[]}"}}]}\n\n',
    "data: [DONE]\n\n",
  ]);

  const chunks: string[] = [];
  for await (const chunk of parseChatCompletionSse(response)) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ['{"rules":', "[]}"]);
});

test("parseChatCompletionSse throws on invalid payload", async () => {
  const response = createResponseFromSse(["data: {not-json}\n\n"]);

  await assert.rejects(async () => {
    for await (const _chunk of parseChatCompletionSse(response)) {
      // noop
    }
  });
});

test("parseChatCompletionSse includes JSON error message on non-OK responses", async () => {
  const response = new Response(
    JSON.stringify({
      error: {
        message: "invalid api key",
      },
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  await assert.rejects(
    async () => {
      for await (const _chunk of parseChatCompletionSse(response)) {
        // noop
      }
    },
    /LLM request failed with HTTP 401: invalid api key/,
  );
});

test("parseChatCompletionSse includes text error summary on non-OK responses", async () => {
  const response = new Response("model not permitted for this account", {
    status: 401,
    headers: {
      "Content-Type": "text/plain",
    },
  });

  await assert.rejects(
    async () => {
      for await (const _chunk of parseChatCompletionSse(response)) {
        // noop
      }
    },
    /LLM request failed with HTTP 401: model not permitted for this account/,
  );
});

test("resolveChatCompletionsUrl targets model provider v1 chat completions", () => {
  assert.equal(
    resolveChatCompletionsUrl("https://ai.comfly.org"),
    "https://ai.comfly.org/v1/chat/completions",
  );
  assert.equal(
    resolveChatCompletionsUrl("https://ai.comfly.org/"),
    "https://ai.comfly.org/v1/chat/completions",
  );
  assert.equal(
    resolveChatCompletionsUrl("https://ai.comfly.org/v1"),
    "https://ai.comfly.org/v1/chat/completions",
  );
});

test("resolveOpenAiBaseUrl normalizes provider origins and historical /v1 values", () => {
  assert.equal(
    resolveOpenAiBaseUrl("https://api.nonelinear.com"),
    "https://api.nonelinear.com/v1",
  );
  assert.equal(
    resolveOpenAiBaseUrl("https://api.nonelinear.com/v1"),
    "https://api.nonelinear.com/v1",
  );
  assert.equal(
    resolveOpenAiBaseUrl("https://api.nonelinear.com/v1/"),
    "https://api.nonelinear.com/v1",
  );
});

test("listOpenAiCompatibleModels normalizes model ids and display metadata", async () => {
  const calls: Array<{ apiKey: string; baseURL: string; timeoutMs: number }> = [];
  const clientFactory: OpenAiCompatibleClientFactory = (input) => {
    calls.push(input);
    return {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: "{\"ok\":true}" } }],
          }) as never,
        },
      },
      models: {
        list: async () => ({
          data: [
            {
              id: " deepseek-v4-flash ",
              object: "model",
              created: 0,
              owned_by: "nonelinear",
            },
            {
              id: "gemini-2.5-flash-image",
              object: "model",
              created: 1715558400,
              owned_by: "nonelinear",
            },
            {
              id: "",
              object: "model",
            },
          ],
        }),
      },
    };
  };

  const models = await listOpenAiCompatibleModels({
    apiBaseUrl: "https://api.nonelinear.com/v1/",
    apiKey: "sk-test",
    options: { clientFactory, resolveHostname: resolvePublicHostname },
  });

  assert.equal(calls[0]?.baseURL, "https://api.nonelinear.com/v1");
  assert.deepEqual(models, [
    {
      id: "deepseek-v4-flash",
      object: "model",
      created: 0,
      ownedBy: "nonelinear",
    },
    {
      id: "gemini-2.5-flash-image",
      object: "model",
      created: 1715558400,
      ownedBy: "nonelinear",
    },
  ]);
});

test("listOpenAiCompatibleModels preserves provider HTTP status for admin diagnostics", async () => {
  const clientFactory: OpenAiCompatibleClientFactory = () => ({
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: "{\"ok\":true}" } }],
        }) as never,
      },
    },
    models: {
      list: async () => {
        throw { status: 429, error: { message: "request too frequent" } };
      },
    },
  });

  await assert.rejects(
    () =>
      listOpenAiCompatibleModels({
        apiBaseUrl: "https://api.nonelinear.com",
        apiKey: "sk-test",
        options: { clientFactory, resolveHostname: resolvePublicHostname },
      }),
    (error) =>
      error instanceof ProviderHttpError &&
      error.status === 429 &&
      /Provider model discovery failed with HTTP 429: request too frequent/.test(
        error.message,
      ),
  );
});

test("createRealLlmTransport forwards json_schema response_format when provided", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  globalThis.fetch = (async (_input, init) => {
    requestBody = String(init?.body ?? "");
    return createResponseFromSse([
      'data: {"choices":[{"delta":{"content":"{\\"models\\":[]}"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
  }) as typeof fetch;

  try {
    const transport = createRealLlmTransport({
      resolveHostname: resolvePublicHostname,
    });
    const chunks: string[] = [];
    for await (const chunk of transport.streamChatCompletion({
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-test",
        model: "gpt-5.5",
      },
      messages: [{ role: "user", content: "test" }],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "diagram_models_result",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              models: {
                type: "array",
                items: { type: "object" },
              },
            },
            required: ["models"],
          },
        },
      },
    })) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, ['{"models":[]}']);
    const parsedBody = JSON.parse(requestBody) as {
      response_format?: { type?: string };
    };
    assert.equal(parsedBody.response_format?.type, "json_schema");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createRealLlmTransport forwards provider reasoning fragments separately from answer and summary", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => createResponseFromSse([
    'data: {"choices":[{"delta":{"reasoning_content":"先判断"}}]}\n\n',
    'data: {"choices":[{"delta":{"reasoning":"条件。","reasoning_summary":"正在分析。"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"最终答案"}}]}\n\n',
    "data: [DONE]\n\n",
  ])) as typeof fetch;
  try {
    const reasoning: string[] = [];
    const summaries: string[] = [];
    const output: string[] = [];
    const transport = createRealLlmTransport({ resolveHostname: resolvePublicHostname });
    for await (const chunk of transport.streamChatCompletion({
      providerSettings: { apiBaseUrl: "https://ai.comfly.org", apiKey: "sk-test", model: "reasoning-model" },
      messages: [{ role: "user", content: "test" }],
      onReasoningChunk: (chunk) => reasoning.push(chunk),
      onReasoningSummary: (chunk) => summaries.push(chunk),
    })) output.push(chunk);
    assert.deepEqual(reasoning, ["先判断", "条件。"]);
    assert.deepEqual(summaries, ["正在分析。"]);
    assert.deepEqual(output, ["最终答案"]);
  } finally { globalThis.fetch = originalFetch; }
});

test("createRealLlmTransport keeps a reasoning-only stream alive across the idle window", async () => {
  const reasoning: string[] = [];
  const output: string[] = [];
  const clientFactory: OpenAiCompatibleClientFactory = () => ({
    chat: { completions: { create: async () => (async function* () {
      yield { choices: [{ delta: { reasoning_content: "第一步" } }] };
      await new Promise((resolve) => setTimeout(resolve, 65));
      yield { choices: [{ delta: { reasoning_content: "第二步" } }] };
      await new Promise((resolve) => setTimeout(resolve, 65));
      yield { choices: [{ delta: { content: "结论" } }] };
    })() as never } },
    models: { list: async () => ({ data: [] }) },
  });
  const transport = createRealLlmTransport({ clientFactory, responseTimeoutMs: 110, resolveHostname: resolvePublicHostname });
  for await (const chunk of transport.streamChatCompletion({
    providerSettings: { apiBaseUrl: "https://ai.comfly.org", apiKey: "sk-test", model: "reasoning-model" },
    messages: [{ role: "user", content: "test" }],
    onReasoningChunk: (chunk) => reasoning.push(chunk),
  })) output.push(chunk);
  assert.deepEqual(reasoning, ["第一步", "第二步"]);
  assert.deepEqual(output, ["结论"]);
});

test("createRealLlmTransport retries unsupported json_schema requests with JSON mode", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const requestBodies: string[] = [];
  const warnings: string[] = [];
  let resolveCalls = 0;
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(String(init?.body ?? ""));
    if (requestBodies.length === 1) {
      return new Response(
        JSON.stringify({
          error: {
            message:
              "response_format json_schema is not supported by this provider",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return createResponseFromSse([
      'data: {"choices":[{"delta":{"content":"{\\"ok\\":true}"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
  }) as typeof fetch;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((item) => String(item)).join(" "));
  };

  try {
    const transport = createRealLlmTransport({
      resolveHostname: async () => {
        resolveCalls += 1;
        return ["8.8.8.8"];
      },
    });
    const chunks: string[] = [];
    const fallbacks: Array<{
      from: string;
      to: string;
      status: number;
      reason: string;
    }> = [];
    for await (const chunk of transport.streamChatCompletion({
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-test",
        model: "provider-json-only",
      },
      messages: [{ role: "user", content: "test" }],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "healthcheck",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
          },
        },
      },
      onResponseFormatFallback: (event) => fallbacks.push(event),
    })) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, ['{"ok":true}']);
    assert.equal(requestBodies.length, 2);
    assert.equal(resolveCalls, 2);
    assert.equal(JSON.parse(requestBodies[0]).response_format.type, "json_schema");
    assert.equal(JSON.parse(requestBodies[1]).response_format.type, "json_object");
    // The downgrade must add JSON instructions even when the original schema request had none.
    const originalMessages = JSON.parse(requestBodies[0]).messages;
    const fallbackMessages = JSON.parse(requestBodies[1]).messages;
    assert.deepEqual(fallbackMessages.slice(1), originalMessages);
    assert.equal(fallbackMessages[0].role, "system");
    assert.match(fallbackMessages[0].content, /JSON/);
    assert.deepEqual(fallbacks, [{
      from: "strict_json",
      to: "json_object",
      status: 400,
      reason: "response_format json_schema is not supported by this provider",
    }]);
    assert.match(warnings.join("\n"), /\[llm-json-schema-fallback\]/);
    assert.doesNotMatch(warnings.join("\n"), /sk-test/);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("createRealLlmTransport does not downgrade auth failures", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        error: {
          message: "invalid api key",
        },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const transport = createRealLlmTransport({
      resolveHostname: resolvePublicHostname,
    });
    await assert.rejects(
      async () => {
        for await (const _chunk of transport.streamChatCompletion({
          providerSettings: {
            apiBaseUrl: "https://ai.comfly.org",
            apiKey: "sk-test",
            model: "gpt-5.5",
          },
          messages: [{ role: "user", content: "test" }],
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "healthcheck",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: { ok: { type: "boolean" } },
                required: ["ok"],
              },
            },
          },
        })) {
          // noop
        }
      },
      /LLM request failed with HTTP 401: invalid api key/,
    );
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createRealLlmTransport times out a stalled streaming response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        start() {
          // Keep the provider stream open without yielding chunks to simulate a stalled SSE response.
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
        },
      },
    )) as typeof fetch;

  try {
    const transport = createRealLlmTransport({
      responseTimeoutMs: 10,
      resolveHostname: resolvePublicHostname,
    });

    await assert.rejects(
      async () => {
        for await (const _chunk of transport.streamChatCompletion({
          providerSettings: {
            apiBaseUrl: "https://ai.comfly.org",
            apiKey: "sk-test",
            model: "gpt-5.5",
          },
          messages: [{ role: "user", content: "test" }],
        })) {
          // noop
        }
      },
      /LLM request timed out after 10ms/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createRealLlmTransport rejects unsafe provider URLs before network access", async () => {
  const transport = createRealLlmTransport();

  await assert.rejects(
    async () => {
      for await (const _chunk of transport.streamChatCompletion({
        providerSettings: {
          apiBaseUrl: "http://127.0.0.1:9000",
          apiKey: "sk-test",
          model: "gpt-5.5",
        },
        messages: [{ role: "user", content: "test" }],
      })) {
        // noop
      }
    },
    /must use HTTPS/,
  );
});

test("createRealLlmTransport allows arbitrary public HTTPS provider origins", async () => {
  let requestedBaseUrl = "";
  const transport = createRealLlmTransport({
    resolveHostname: resolvePublicHostname,
    clientFactory: ({ baseURL }) => {
      requestedBaseUrl = baseURL;
      return {
        chat: {
          completions: {
            create: async () => (async function* () {
              yield { choices: [{ delta: { content: "ok" } }] };
            })() as never,
          },
        },
        models: { list: async () => ({ data: [] }) },
      };
    },
  });

  const chunks: string[] = [];
  for await (const chunk of transport.streamChatCompletion({
    providerSettings: {
      apiBaseUrl: "https://custom-provider.example/api",
      apiKey: "sk-test",
      model: "custom-model",
    },
    messages: [{ role: "user", content: "test" }],
  })) {
    chunks.push(chunk);
  }

  assert.equal(requestedBaseUrl, "https://custom-provider.example/v1");
  assert.deepEqual(chunks, ["ok"]);
});

test("createRealLlmTransport rejects hostnames that resolve to private addresses", async () => {
  const transport = createRealLlmTransport({
    resolveHostname: async () => ["10.0.0.8"],
  });

  await assert.rejects(
    async () => {
      for await (const _chunk of transport.streamChatCompletion({
        providerSettings: {
          apiBaseUrl: "https://rebound.example",
          apiKey: "sk-test",
          model: "custom-model",
        },
        messages: [{ role: "user", content: "test" }],
      })) {
        // noop
      }
    },
    /must use a public HTTPS host/,
  );
});
