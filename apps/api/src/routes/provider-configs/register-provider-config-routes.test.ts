// Verifies user/project-visible provider config routes never expose provider secrets.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { createProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import { hashPassword } from "../../security/password-hashing.js";
import {
  registerProviderConfigRoutes,
  type ProviderConfigRiskEventRecorder,
} from "./register-provider-config-routes.js";

function createChatProbeStream(content: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
        ),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function createSessionCookie(authStore: AuthStore, userId: string) {
  const session = await authStore.createSession({
    userId,
    ipAddress: "127.0.0.1",
    userAgent: "provider-config-route-test",
  });
  return `uml_session=${encodeURIComponent(session.id)}`;
}

async function createProviderRouteTestApp() {
  const app = Fastify({ logger: false });
  const authStore = createInMemoryAuthStore();
  const owner = authStore.createUser({
    email: "owner@example.com",
    displayName: "Owner User",
    passwordHash: hashPassword("password-123"),
  });
  const outsider = authStore.createUser({
    email: "outsider@example.com",
    displayName: "Outside User",
    passwordHash: hashPassword("password-123"),
  });
  assert.ok(owner);
  assert.ok(outsider);
  const { project } = authStore.createProject({
    ownerUserId: owner.id,
    name: "Provider Project",
    description: null,
    visibility: "private",
  });
  const providerConfigs = createProviderConfigStore({
    secret: "route-test-secret",
  });
  const riskEvents: Array<Parameters<ProviderConfigRiskEventRecorder>[0]> = [];
  const systemProvider = providerConfigs.create({
    name: "System OpenAI",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: "sk-system-secret-a91f",
    defaultModel: "gpt-4.1",
    allowedModels: ["gpt-4.1"],
    createdBy: "admin",
    scopeType: "system",
  });
  const userProvider = providerConfigs.create({
    name: "Owner Personal OpenAI",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: "sk-owner-secret-b52c",
    defaultModel: "gpt-4.1-mini",
    allowedModels: ["gpt-4.1-mini"],
    createdBy: owner.id,
    scopeType: "user",
    scopeId: owner.id,
  });
  const projectProvider = providerConfigs.create({
    name: "Project OpenAI",
    provider: "openai",
    baseUrl: "https://api.openai.com",
    apiKey: "sk-project-secret-c83d",
    defaultModel: "gpt-4.1",
    allowedModels: ["gpt-4.1"],
    createdBy: owner.id,
    scopeType: "project",
    scopeId: project.id,
  });

  registerProviderConfigRoutes({
    app,
    authStore,
    providerConfigs,
    recordRiskEvent: (event) => {
      riskEvents.push(event);
    },
    resolveProviderHostname: async (hostname) =>
      hostname === "private.example.test" ? ["10.12.0.8"] : ["8.8.8.8"],
  });

  return {
    app,
    owner,
    outsider,
    project,
    providerConfigs,
    riskEvents,
    systemProvider,
    userProvider,
    projectProvider,
    ownerCookie: await createSessionCookie(authStore, owner.id),
    outsiderCookie: await createSessionCookie(authStore, outsider.id),
  };
}

test("regular users can read system and user-scoped provider configs without secrets", async () => {
  const { app, ownerCookie } = await createProviderRouteTestApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/provider-configs",
    headers: { cookie: ownerCookie },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json().providerConfigs.map((item: { scopeType: string }) => item.scopeType),
    ["user", "system"],
  );
  assert.doesNotMatch(response.body, /sk-system-secret-a91f/);
  assert.doesNotMatch(response.body, /sk-owner-secret-b52c/);
  assert.doesNotMatch(response.body, /sk-project-secret-c83d/);
  assert.doesNotMatch(response.body, /apiKey|secret/i);

  await app.close();
});

test("project provider config route requires project membership", async () => {
  const { app, outsiderCookie, project } = await createProviderRouteTestApp();

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${project.id}/provider-configs`,
    headers: { cookie: outsiderCookie },
  });

  assert.equal(response.statusCode, 403);

  await app.close();
});

test("project provider config route includes system, user, and project scopes for members", async () => {
  const { app, ownerCookie, project } = await createProviderRouteTestApp();

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${project.id}/provider-configs`,
    headers: { cookie: ownerCookie },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json().providerConfigs.map((item: { scopeType: string }) => item.scopeType),
    ["project", "user", "system"],
  );
  assert.doesNotMatch(response.body, /sk-system-secret-a91f|sk-owner-secret-b52c|sk-project-secret-c83d/);

  await app.close();
});

test("provider config test requests reject apiKey and apiBaseUrl overrides", async () => {
  const {
    app,
    ownerCookie,
    owner,
    project,
    systemProvider,
    projectProvider,
  } = await createProviderRouteTestApp();

  const userTest = await app.inject({
    method: "POST",
    url: `/api/provider-configs/${systemProvider.id}/test`,
    headers: { cookie: ownerCookie },
    payload: {
      model: "gpt-4.1",
      apiKey: "sk-frontend-secret",
    },
  });
  const projectTest = await app.inject({
    method: "POST",
    url: `/api/projects/${project.id}/provider-configs/${projectProvider.id}/test`,
    headers: { cookie: ownerCookie },
    payload: {
      apiBaseUrl: "https://api.openai.com",
    },
  });

  assert.equal(owner.status, "active");
  assert.equal(userTest.statusCode, 400);
  assert.match(userTest.body, /apiKey|unrecognized|request/i);
  assert.equal(projectTest.statusCode, 400);
  assert.match(projectTest.body, /apiBaseUrl|unrecognized|request/i);

  await app.close();
});

test("regular users create private provider configs only after a successful healthcheck", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const { app, owner, ownerCookie, providerConfigs } = await createProviderRouteTestApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/provider-configs",
      headers: { cookie: ownerCookie },
      payload: {
        name: "Owner Kimi",
        provider: "openai-compatible",
        baseUrl: "https://api.moonshot.cn",
        apiKey: "sk-owner-private-9999",
        defaultModel: "moonshot-v1-8k",
        allowedModels: ["moonshot-v1-8k"],
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().scopeType, "user");
    assert.equal(response.json().scopeId, owner.id);
    assert.equal(response.json().maskedKey, "sk-...9999");
    assert.doesNotMatch(response.body, /sk-owner-private-9999|apiKey/i);
    assert.equal(calls[0], "https://api.moonshot.cn/v1/chat/completions");

    const listed = await app.inject({
      method: "GET",
      url: "/api/provider-configs",
      headers: { cookie: ownerCookie },
    });
    assert.match(listed.body, /Owner Kimi/);
    assert.doesNotMatch(listed.body, /sk-owner-private-9999|apiKey/i);
    assert.ok((await providerConfigs.list()).some((config) => config.scopeId === owner.id && config.name === "Owner Kimi"));
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test("temporary provider model discovery returns models without saving provider secrets", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = (async (url, init) => {
    const testedUrl = String(url);
    const headers = new Headers(init?.headers);
    calls.push({
      url: testedUrl,
      authorization: headers.get("authorization"),
    });
    if (testedUrl.endsWith("/v1/chat/completions")) {
      return createChatProbeStream('{"probe":"strict-json-ok","n":1}');
    }
    return new Response(
      JSON.stringify({
        object: "list",
        data: [
          { id: "deepseek-v4-flash", object: "model", created: 0, owned_by: "nonelinear" },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;
  const { app, ownerCookie, providerConfigs } = await createProviderRouteTestApp();
  const initialCount = (await providerConfigs.list()).length;

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/provider-configs/discover-models",
      headers: { cookie: ownerCookie },
      payload: {
        baseUrl: "https://api.nonelinear.com/v1",
        apiKey: "sk-temporary-discovery-9999",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(calls[0]?.url, "https://api.nonelinear.com/v1/models");
    assert.equal(calls[0]?.authorization, "Bearer sk-temporary-discovery-9999");
    assert.equal(calls[1]?.url, "https://api.nonelinear.com/v1/chat/completions");
    assert.equal(response.json().sourceBaseUrl, "https://api.nonelinear.com");
    assert.deepEqual(response.json().models.map((model: { id: string }) => model.id), [
      "deepseek-v4-flash",
    ]);
    assert.equal(response.json().models[0].structuredOutputMode, "strict_json");
    assert.equal((await providerConfigs.list()).length, initialCount);
    assert.doesNotMatch(response.body, /sk-temporary-discovery-9999|apiKey/i);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test("temporary provider model discovery stream emits progress without leaking secrets", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    const testedUrl = String(url);
    if (testedUrl.endsWith("/v1/chat/completions")) {
      return createChatProbeStream('{"probe":"strict-json-ok","n":1}');
    }
    return new Response(
      JSON.stringify({
        object: "list",
        data: [
          { id: "deepseek-v4-flash", object: "model", created: 0, owned_by: "nonelinear" },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;
  const { app, ownerCookie } = await createProviderRouteTestApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/provider-configs/discover-models/stream",
      headers: { cookie: ownerCookie },
      payload: {
        baseUrl: "https://api.nonelinear.com/v1",
        apiKey: "sk-temporary-stream-9999",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] as string, /text\/event-stream/);
    const events = response.body
      .split(/\r?\n\r?\n/u)
      .flatMap((block) => {
        const data = block
          .split(/\r?\n/u)
          .find((line) => line.startsWith("data:"))
          ?.slice(5)
          .trim();
        return data ? [JSON.parse(data) as { type: string }] : [];
      });
    assert.deepEqual(events.map((event) => event.type), [
      "started",
      "models_listed",
      "name_filtered",
      "probe_started",
      "probe_completed",
      "completed",
    ]);
    assert.doesNotMatch(response.body, /sk-temporary-stream-9999|apiKey/i);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test("temporary provider tests run healthcheck without saving provider secrets", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const { app, ownerCookie, providerConfigs } = await createProviderRouteTestApp();
  const initialCount = (await providerConfigs.list()).length;

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/provider-configs/test-temporary",
      headers: { cookie: ownerCookie },
      payload: {
        baseUrl: "https://api.moonshot.cn",
        apiKey: "sk-temporary-test-8888",
        model: "moonshot-v1-8k",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().ok, true);
    assert.equal(calls[0], "https://api.moonshot.cn/v1/chat/completions");
    assert.equal((await providerConfigs.list()).length, initialCount);
    assert.doesNotMatch(response.body, /sk-temporary-test-8888|apiKey/i);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test("temporary provider endpoints reject unsafe base urls before saving or leaking secrets", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ message: "should not be called" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const { app, ownerCookie, providerConfigs } = await createProviderRouteTestApp();
  const initialCount = (await providerConfigs.list()).length;

  try {
    const privateDiscovery = await app.inject({
      method: "POST",
      url: "/api/provider-configs/discover-models",
      headers: { cookie: ownerCookie },
      payload: {
        baseUrl: "https://private.example.test",
        apiKey: "sk-private-discovery-7777",
      },
    });
    const unsafeTest = await app.inject({
      method: "POST",
      url: "/api/provider-configs/test-temporary",
      headers: { cookie: ownerCookie },
      payload: {
        baseUrl: "http://169.254.169.254",
        apiKey: "sk-unsafe-test-6666",
        model: "gpt-4.1",
      },
    });

    assert.equal(privateDiscovery.statusCode, 400);
    assert.equal(unsafeTest.statusCode, 400);
    assert.equal(fetchCount, 0);
    assert.equal((await providerConfigs.list()).length, initialCount);
    assert.doesNotMatch(
      privateDiscovery.body + unsafeTest.body,
      /sk-private-discovery-7777|sk-unsafe-test-6666/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test("self-service provider creation rejects unsafe or failing endpoints without saving secrets", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async (input) => {
    fetchCount += 1;
    const requestUrl =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : String(input);
    if (requestUrl.includes("redirect.example.test")) {
      return new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      });
    }
    return new Response(JSON.stringify({ message: "bad gateway" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const { app, ownerCookie, providerConfigs, riskEvents } = await createProviderRouteTestApp();
  const initialCount = (await providerConfigs.list()).length;

  try {
    const unsafe = await app.inject({
      method: "POST",
      url: "/api/provider-configs",
      headers: { cookie: ownerCookie },
      payload: {
        name: "Private metadata",
        baseUrl: "http://169.254.169.254",
        apiKey: "sk-unsafe-1111",
        defaultModel: "gpt-4.1",
        allowedModels: ["gpt-4.1"],
      },
    });
    const privateDns = await app.inject({
      method: "POST",
      url: "/api/provider-configs",
      headers: { cookie: ownerCookie },
      payload: {
        name: "DNS private provider",
        baseUrl: "https://private.example.test",
        apiKey: "sk-private-dns-3333",
        defaultModel: "gpt-4.1",
        allowedModels: ["gpt-4.1"],
      },
    });
    const failing = await app.inject({
      method: "POST",
      url: "/api/provider-configs",
      headers: { cookie: ownerCookie },
      payload: {
        name: "Failing public provider",
        baseUrl: "https://api.example.invalid",
        apiKey: "sk-failing-2222",
        defaultModel: "gpt-4.1",
        allowedModels: ["gpt-4.1"],
      },
    });
    const redirecting = await app.inject({
      method: "POST",
      url: "/api/provider-configs",
      headers: { cookie: ownerCookie },
      payload: {
        name: "Redirecting provider",
        baseUrl: "https://redirect.example.test",
        apiKey: "sk-redirect-4444",
        defaultModel: "gpt-4.1",
        allowedModels: ["gpt-4.1"],
      },
    });

    assert.equal(unsafe.statusCode, 400);
    assert.equal(privateDns.statusCode, 400);
    assert.equal(failing.statusCode, 502);
    assert.equal(redirecting.statusCode, 400);
    assert.equal((await providerConfigs.list()).length, initialCount);
    assert.equal(fetchCount, 2);
    assert.doesNotMatch(
      unsafe.body + privateDns.body + failing.body + redirecting.body,
      /sk-unsafe-1111|sk-failing-2222|sk-private-dns-3333|sk-redirect-4444/,
    );
    assert.equal(redirecting.json().error.code, "PROVIDER_BASE_URL_NOT_ALLOWED");
    assert.equal(failing.json().error.code, "PROVIDER_CONNECTION_FAILED");
    assert.equal(riskEvents.length, 4);
    assert.deepEqual(
      riskEvents.map((event) => [event.eventType, event.severity, event.targetId]),
      [
        ["provider_config_create_blocked", "high", null],
        ["provider_config_create_blocked", "high", null],
        ["provider_config_create_failed", "medium", null],
        ["provider_config_create_failed", "medium", null],
      ],
    );
    assert.doesNotMatch(
      JSON.stringify(riskEvents),
      /sk-unsafe-1111|sk-failing-2222|sk-private-dns-3333|sk-redirect-4444/,
    );
    assert.ok(providerConfigs.listAuditLogs().some((log) => log.action === "user.provider_config.create" && log.result === "blocked"));
    assert.ok(providerConfigs.listAuditLogs().some((log) => log.action === "user.provider_config.create" && log.result === "failed"));
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test("users cannot manage another user's private provider config", async () => {
  const { app, outsiderCookie, userProvider } = await createProviderRouteTestApp();

  const update = await app.inject({
    method: "PATCH",
    url: `/api/provider-configs/${userProvider.id}`,
    headers: { cookie: outsiderCookie },
    payload: { name: "Stolen Provider" },
  });
  const disable = await app.inject({
    method: "POST",
    url: `/api/provider-configs/${userProvider.id}/disable`,
    headers: { cookie: outsiderCookie },
  });

  assert.equal(update.statusCode, 404);
  assert.equal(disable.statusCode, 404);

  await app.close();
});

test("users can fully update and revoke their private provider config", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  const { app, ownerCookie, userProvider } = await createProviderRouteTestApp();

  try {
    const updated = await app.inject({
      method: "PATCH",
      url: `/api/provider-configs/${userProvider.id}`,
      headers: { cookie: ownerCookie },
      payload: {
        name: "Owner Personal Nonelinear",
        baseUrl: "https://api.nonelinear.com/v1",
        apiKey: "sk-updated-owner-5555",
        defaultModel: "gpt-5.4",
        allowedModels: ["gpt-5.4"],
      },
    });

    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().name, "Owner Personal Nonelinear");
    assert.equal(updated.json().baseUrl, "https://api.nonelinear.com");
    assert.equal(updated.json().defaultModel, "gpt-5.4");
    assert.equal(updated.json().maskedKey, "sk-...5555");
    assert.doesNotMatch(updated.body, /sk-updated-owner-5555|apiKey/i);

    const revoked = await app.inject({
      method: "POST",
      url: `/api/provider-configs/${userProvider.id}/revoke`,
      headers: { cookie: ownerCookie },
    });
    const listed = await app.inject({
      method: "GET",
      url: "/api/provider-configs",
      headers: { cookie: ownerCookie },
    });

    assert.equal(revoked.statusCode, 200);
    assert.equal(revoked.json().status, "revoked");
    assert.equal(
      listed.json().providerConfigs.some((config: { id: string }) => config.id === userProvider.id),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test("users cannot update or revoke system provider configs", async () => {
  const { app, ownerCookie, systemProvider } = await createProviderRouteTestApp();

  const update = await app.inject({
    method: "PATCH",
    url: `/api/provider-configs/${systemProvider.id}`,
    headers: { cookie: ownerCookie },
    payload: { name: "Not allowed" },
  });
  const revoke = await app.inject({
    method: "POST",
    url: `/api/provider-configs/${systemProvider.id}/revoke`,
    headers: { cookie: ownerCookie },
  });

  assert.equal(update.statusCode, 404);
  assert.equal(revoke.statusCode, 404);

  await app.close();
});

test("provider config test returns a safe authentication code without upstream text", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: 30001,
        message: "Sorry, your account balance is insufficient",
        apiKey: "sk-provider-response-should-not-leak",
      }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      },
    )) as typeof fetch;

  const { app, ownerCookie, systemProvider } = await createProviderRouteTestApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: `/api/provider-configs/${systemProvider.id}/test`,
      headers: { cookie: ownerCookie },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "PROVIDER_AUTH_FAILED");
    assert.equal(response.json().error.details.upstreamStatus, 403);
    assert.doesNotMatch(response.body, /account balance is insufficient/i);
    assert.doesNotMatch(response.body, /sk-provider-response-should-not-leak/);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});
