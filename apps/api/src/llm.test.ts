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
import type { OpenAiCompatibleClientFactory } from "./llm.js";

const resolvePublicHostname = async () => ["8.8.8.8"];

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
