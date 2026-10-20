// Exercises actual SDK HTTP exchanges, browser consent, and revocation using isolated platform accounts.
import { requirementRuleFacts } from "@uml-platform/contracts";
import { requirementRuleSchema } from "@uml-platform/contracts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, PROTOCOL_VERSION_META_KEY, SERVER_INFO_META_KEY } from "@modelcontextprotocol/server";
import test from "node:test";
import { createConfiguredFastifyApp } from "../../server/fastify-app.js";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { loadMcpConfig } from "../../mcp/auth/mcp-config.js";
import { registerMcpModule } from "../../mcp/server/register-mcp-module.js";
import { platformMcpProtocolVersion as protocolVersion } from "../../mcp/server/mcp-server.js";
import { createMcpToolService } from "../../mcp/tools/tool-service.js";
import { verifierAsset } from "../../mcp/verification/verifier-distribution.js";
import { implementationVerifierSource } from "../../mcp/verification/verifier-source.js";
import {
  mcpContextInputSchema,
  mcpArtifactInputSchema,
  mcpListProjectsInputSchema,
} from "@uml-platform/contracts";

function modernRequest(method: string, params: unknown = {}) {
  return { jsonrpc: "2.0", id: 1, method, params: {
    ...(params as Record<string, unknown>),
    _meta: {
      [PROTOCOL_VERSION_META_KEY]: protocolVersion,
      [CLIENT_INFO_META_KEY]: { name: "test", version: "1" },
      [CLIENT_CAPABILITIES_META_KEY]: {},
    },
  } };
}

async function setup(
  webOrigin?: string,
  publicOrigin = "http://localhost:4001",
  cimdOrigins = "",
) {
  const authStore = createInMemoryAuthStore();
  const app = await createConfiguredFastifyApp();
  app.log.level = "silent";
  const config = loadMcpConfig({
    MCP_ENABLED: "true",
    MCP_PUBLIC_ORIGIN: publicOrigin,
    MCP_CIMD_ORIGINS: cimdOrigins,
    ...(webOrigin ? { MCP_WEB_ORIGIN: webOrigin } : {}),
    MCP_OAUTH_CLIENTS: JSON.stringify([
      {
        client_id: "test-client",
        client_name: "Coding agent",
        redirect_uris: ["http://127.0.0.1:8765/callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
    ]),
  })!;
  const module = (await registerMcpModule({
    app,
    authStore,
    pool: null,
    production: false,
    config,
  }))!;
  const alice = await authStore.createUser({
    username: "alice",
    displayName: "Alice",
    passwordHash: "not-a-password",
  });
  const bob = await authStore.createUser({
    username: "bob",
    displayName: "Bob",
    passwordHash: "not-a-password",
  });
  const a = await authStore.createProject({
    ownerUserId: alice.id,
    name: "图书管理系统",
    description: "A",

  });
  const b = await authStore.createProject({
    ownerUserId: bob.id,
    name: "图书管理系统",
    description: "B",

  });
  const session = await authStore.createSession({
    userId: alice.id,
    ipAddress: "127.0.0.1",
    userAgent: "test",
  });
  const pat = await module.access.createToken(
    alice.id,
    "test",
    { projectScope: 'selected', projectIds: [a.project.id] },
    30,
  );
  const headers = {
    host: new URL(publicOrigin).host,
    authorization: `Bearer ${pat.token}`,
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": protocolVersion,
  };
  const browserHeaders = {
    host: new URL(publicOrigin).host,
    cookie: `uml_session=${session.id}`,
  };
  function parse(response: { body: string }) {
    return response.body.startsWith("event:")
      ? JSON.parse(
          response.body
            .split("\n")
            .find((line) => line.startsWith("data: "))!
            .slice(6),
        )
      : JSON.parse(response.body);
  }
  async function rpc(method: string, params: unknown = {}) {
    return app.inject({
      method: "POST",
      url: "/api/mcp",
      headers: {
        ...headers,
        "mcp-method": method,
        ...(method === "tools/call" && typeof (params as { name?: unknown }).name === "string"
          ? { "mcp-name": (params as { name: string }).name } : {}),
      },
      payload: modernRequest(method, params),
    });
  }
  return {
    app,
    authStore,
    ...module,
    config,
    alice,
    bob,
    a: a.project,
    b: b.project,
    ownerMember: a.ownerMember,
    pat,
    headers,
    browserHeaders,
    parse,
    rpc,
  };
}
test("local demo proxy exposes enabled connections, tools and OAuth on the same Web origin", async (t) => {
  const s = await setup("http://localhost:3000", "http://localhost:3000");
  t.after(() => s.app.close());
  const proxyHeaders = {
    host: "localhost:4101",
    "x-forwarded-host": "localhost:3000",
  };
  const management = await s.app.inject({
    url: "/api/mcp/connections",
    headers: {
      ...s.browserHeaders,
      ...proxyHeaders,
      origin: "http://localhost:3000",
    },
  });
  assert.equal(management.statusCode, 200);
  assert.equal(management.json().enabled, true);
  assert.equal(management.json().serverUrl, "http://localhost:3000/api/mcp");
  const discovery = await s.app.inject({
    url: "/.well-known/oauth-protected-resource/api/mcp",
    headers: proxyHeaders,
  });
  assert.equal(discovery.json().resource, management.json().serverUrl);
  const tools = await s.app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: { ...s.headers, ...proxyHeaders, "mcp-method": "tools/list" },
    payload: modernRequest("tools/list"),
  });
  assert.equal(s.parse(tools).result?.tools.length, 4, tools.body);
  const authorization = await s.app.inject({
    url: `/api/mcp/oauth/auth?${new URLSearchParams({
      client_id: "test-client",
      response_type: "code",
      scope: "mcp:read",
      resource: s.config.resource,
      redirect_uri: "http://127.0.0.1:8765/callback",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
    })}`,
    headers: proxyHeaders,
  });
  assert.equal(authorization.statusCode, 303);
  assert.match(
    authorization.headers.location!,
    /^http:\/\/localhost:3000\/account\/connections\?interaction=/,
  );
});
test("discovery and failures preserve protocol JSON instead of the platform error envelope", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const denied = await s.app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: { host: "localhost:4001" },
    payload: {},
  });
  assert.equal(denied.statusCode, 401);
  assert.equal(denied.json().error, "invalid_token");
  assert.match(denied.headers["www-authenticate"]!, /resource_metadata/);
  const resource = await s.app.inject({
    url: "/.well-known/oauth-protected-resource/api/mcp",
    headers: { host: "localhost:4001" },
  });
  assert.equal(resource.json().resource, s.config.resource);
  const oauth = await s.app.inject({
    url: "/.well-known/oauth-authorization-server/api/mcp/oauth",
    headers: { host: "localhost:4001" },
  });
  assert.equal(oauth.statusCode, 200);
  assert.equal(oauth.json().issuer, s.config.issuer);
  assert.equal(oauth.json().token_endpoint, `${s.config.issuer}/token`);
  assert.notEqual(oauth.json().client_id_metadata_document_supported, true);
  assert.equal(oauth.json().registration_endpoint, `${s.config.issuer}/reg`);
  const discovery = s.parse(await s.rpc("server/discover"));
  const serverInfo = discovery.result._meta[SERVER_INFO_META_KEY];
  assert.equal(serverInfo.name, "uml-platform");
  const [icon] = serverInfo.icons;
  assert.equal(icon.mimeType, "image/png");
  assert.deepEqual(icon.sizes, ["128x128"]);
  assert.match(icon.src, /^data:image\/png;base64,/);
  // The handshake carries a complete PNG, so local and hosted clients need no image endpoint or token.
  const logo = Buffer.from(
    icon.src.slice("data:image/png;base64,".length),
    "base64",
  );
  assert.deepEqual(
    logo.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  assert.equal(logo.toString("ascii", 12, 16), "IHDR");
  assert.equal(logo.readUInt32BE(16), 128);
  assert.equal(logo.readUInt32BE(20), 128);
  const tools = s.parse(await s.rpc("tools/list"));
  assert.deepEqual(
    tools.result.tools.map((tool: { name: string }) => tool.name).sort(),
    [
      "check_context_updates",
      "get_artifact",
      "get_implementation_context",
      "list_projects",
    ],
  );
  const invalid = s.parse(
    await s.rpc("tools/call", { name: "get_artifact", arguments: {} }),
  );
  assert.ok(invalid.error || invalid.result.isError);
  const foreignOrigin = await s.app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: { ...s.headers, origin: "https://attacker.test" },
    payload: {},
  });
  assert.equal(foreignOrigin.statusCode, 403);
});

test("MCP rejects retired initialization and protocol envelopes", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const response = await s.app.inject({
    method: "POST", url: "/api/mcp",
    headers: { ...s.headers, "mcp-protocol-version": "2025-11-25" },
    payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "retired-client", version: "1" },
    } },
  });
  assert.ok(response.statusCode >= 400);
  assert.ok(s.parse(response).error);
});
test("two users cannot exchange project IDs, tokens, artifact IDs or cursors; live revocation is immediate", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const listed = s.parse(
    await s.rpc("tools/call", { name: "list_projects", arguments: {} }),
  ).result.structuredContent;
  assert.deepEqual(
    listed.data.items.map((p: { id: string }) => p.id),
    [s.a.id],
  );
  const foreign = s.parse(
    await s.rpc("tools/call", {
      name: "get_implementation_context",
      arguments: { projectId: s.b.id },
    }),
  ).result;
  assert.equal(foreign.isError, true);
  assert.equal(foreign.structuredContent.data.code, "access_denied");
  const principal = await s.access.authenticate(s.headers.authorization);
  const service = createMcpToolService(s.access, principal);
  s.authStore.saveProjectWorkspace({
    projectId: s.a.id,
    baseVersion: 0,
    updatedByUserId: s.alice.id,
    state: {
      requirementText: "借阅",
      rules: [
        {
          id: "R1",
          text: "归还",
          type: "business-rule" as const,

        },
      ],
    },
  });
  const first = await service.get_implementation_context(
    mcpContextInputSchema.parse({ projectId: s.a.id, limit: 1 }),
  );
  assert.ok(first.data.nextCursor);
  const bobPat = await s.access.createToken(s.bob.id, "bob", { projectScope: 'selected', projectIds: [s.b.id] }, 30);
  const bob = createMcpToolService(
    s.access,
    await s.access.authenticate(`Bearer ${bobPat.token}`),
  );
  const cursor = await bob.get_implementation_context(
    mcpContextInputSchema.parse({
      projectId: s.b.id,
      cursor: first.data.nextCursor,
    }),
  );
  assert.equal(cursor.status, "refresh_required");
  await s.access.store.revokeGrant(s.pat.connection.id);
  assert.equal((await s.rpc("tools/list")).statusCode, 401);
  await assert.rejects(() =>
    service.get_implementation_context(
      mcpContextInputSchema.parse({ projectId: s.a.id }),
    ),
  );
});
function designWorkspace(summary: string) {
  return {
    requirementText: "private-upstream-requirement",
    designModels: { implementation: {
      diagramKind: "architecture", modelId: "implementation", title: "实现设计", summary, notes: [], packages: [],
      components: [{ id: "service", name: "Service" }], relationships: [],
    } },
    designPlantUml: { implementation: "@startuml\ncomponent Service\n" },
  };
}

test("MCP rejects obsolete and semantically invalid saved inputs without rewriting them", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const service = createMcpToolService(s.access, await s.access.authenticate(s.headers.authorization));
  const base = designWorkspace("当前实现设计");
  const states = [
    { designModels: { implementation: { diagramKind: "architecture", title: "旧结构" } } },
    { ...base, designModels: { implementation: { ...base.designModels.implementation,
      relationships: [{ id: "missing-node", type: "contains", sourceId: "absent", targetId: "service" }],
    } } },
    { ...base, designSvgArtifacts: { implementation: { diagramKind: "architecture", svg: "<svg/>" } } },
  ];
  for (const [baseVersion, state] of states.entries()) {
    await s.authStore.saveProjectWorkspace({ projectId: s.a.id, baseVersion, updatedByUserId: s.alice.id, state });
    const before = structuredClone(await s.authStore.getProjectWorkspace(s.a.id));
    await assert.rejects(() => service.get_implementation_context(mcpContextInputSchema.parse({ projectId: s.a.id })));
    assert.deepEqual(await s.authStore.getProjectWorkspace(s.a.id), before);
  }
});

test("MCP exports saved inputs without review opinions and review-only edits keep existing reads valid", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const state = { ...designWorkspace("落实平台设计"),
    requirementBaseline: {
          schemaVersion: 3, id: "baseline-test", version: 1, sourceInputFingerprint: "test-source-input",
          runId: "test", sourceDocumentId: "inline-requirement", createdAt: "2026-01-01T00:00:00Z",
           assumptions: [], conflicts: [],
          qualityReport: { runId: "test", status: "passed", summary: "test", issues: [], blockingIssueIds: [], reviewRequiredRequirementIds: [] },
          rules: ([{
      id: "BORROW", sourceFragment: "借阅", type: "functional" as const, actor: "学生", subject: "系统",
      action: "借阅", object: "图书", condition: null, outcome: "借阅成功", confidence: 1,
      status: "rejected", criticality: "high", acceptanceCriteria: ["借阅成功后保存记录"],
      fieldProvenance: { acceptanceCriteria: { source: "ai-suggested", status: "rejected", rationale: "private-review-opinion" } },
    }]).map(item => ({ id: item.sourceRuleId ?? item.id, requirementId: item.id,
            text: item.sourceFragment, sourceFragment: item.sourceFragment, origin: "generated",
            type: "functional" as const,
          })),
        },
    visualReviews: { "design:implementation": { status: "pending_review", issues: ["private-review-opinion"],
      reason: "private-review-opinion", attempts: 1, checkedAt: "2026-10-18T00:00:00.000Z",
      findings: [{ id: "private-finding", modelId: "implementation", layer: "image", code: "provider-observation", category: "business_content",
        observation: "private-review-opinion", evidence: [], verification: "unverified", repairable: false }],
      repairAttempts: 1, repairHistory: [{ round: 1, target: "model", issueIds: ["private-finding"], beforeFingerprint: "source-before", changes: [], status: "accepted", reason: "private-repair-reason" }] } },
    autoGeneratedUpstreamReviews: { generated: { artifactId: "implementation", artifactType: "design-model", status: "rejected" } },
  };
  state.rules = state.requirementBaseline.rules.map(rule => requirementRuleFacts(rule));
  state.designModels.implementation.components[0] = { ...state.designModels.implementation.components[0],
    sourceRequirementIds: ["BORROW"],
  } as typeof state.designModels.implementation.components[0];
  await s.authStore.saveProjectWorkspace({ projectId: s.a.id, baseVersion: 0, updatedByUserId: s.alice.id, state });
  const service = createMcpToolService(s.access, await s.access.authenticate(s.headers.authorization));
  const page = await service.get_implementation_context(mcpContextInputSchema.parse({ projectId: s.a.id, limit: 50 }));
  assert.equal(page.status, "ok");
  assert.equal(page.data.nextCursor, null);
  assert.equal((page.data.implementation as { blockingTaskCount: number }).blockingTaskCount, 0);
  const directory = page.data.artifacts as Array<{ id: string; version: { contentHash: string } }>;
  assert.doesNotMatch(JSON.stringify(page), /private-review|private-repair|reviewStatus|fieldProvenance|source-review|trace-review/);
  for (const artifact of directory) {
    const payload = await service.get_artifact(mcpArtifactInputSchema.parse({ projectId: s.a.id, scope: page.data.scope, artifactId: artifact.id,
      expectedContextVersion: page.data.contextVersion, expectedVersion: artifact.version.contentHash, length: 24000,
    }));
    assert.equal(payload.status, "ok");
    assert.doesNotMatch(JSON.stringify(payload), /private-review|private-repair|reviewStatus|fieldProvenance|source-review|trace-review/);
  }
  await s.authStore.saveProjectWorkspace({ projectId: s.a.id, baseVersion: 1, updatedByUserId: s.alice.id,
    state: { ...state, visualReviews: {}, autoGeneratedUpstreamReviews: {}, requirementBaseline: state.requirementBaseline },
  });
  const unchanged = await service.get_implementation_context(mcpContextInputSchema.parse({ projectId: s.a.id,
    expectedContextVersion: page.data.contextVersion,
  }));
  assert.equal(unchanged.status, "ok");
  assert.equal(unchanged.data.contextVersion, page.data.contextVersion);
});

test("large model chunks reassemble exactly and concurrent source changes require refresh", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const text = "业务需求🙂".repeat(8000);
  s.authStore.saveProjectWorkspace({
    projectId: s.a.id,
    baseVersion: 0,
    updatedByUserId: s.alice.id,
    state: designWorkspace(text),
  });
  const service = createMcpToolService(
    s.access,
    await s.access.authenticate(s.headers.authorization),
  );
  const context = await service.get_implementation_context(
    mcpContextInputSchema.parse({ projectId: s.a.id }),
  );
  const version = (context.data.manifest as { contentHash: string }[])[0]
    .contentHash;
  const input = mcpArtifactInputSchema.parse({
    projectId: s.a.id,
    scope: {},
    expectedContextVersion: context.data.contextVersion,
    artifactId: "design:implementation",
    expectedVersion: version,
    length: 997,
  });
  let buffer = "";
  let offset = 0;
  for (;;) {
    const part = await service.get_artifact({ ...input, offset });
    buffer += part.data.chunk;
    if (part.data.nextOffset === null) break;
    offset = part.data.nextOffset as number;
  }
  assert.equal(JSON.parse(buffer).model.summary, text);
  assert.doesNotMatch(buffer, /private-upstream-requirement/);
  // Knowing an old source ID cannot bypass the design-only directory through direct artifact reads.
  for (const artifactId of ["requirements:source", "analysis:borrow"]) {
    const excluded = await service.get_artifact({ ...input, artifactId, offset: 0 });
    assert.equal(excluded.status, "refresh_required");
    assert.doesNotMatch(JSON.stringify(excluded), /private-upstream-requirement/);
    assert.equal(excluded.data.chunk, undefined);
  }
  s.authStore.saveProjectWorkspace({
    projectId: s.a.id,
    baseVersion: 1,
    updatedByUserId: s.alice.id,
    state: designWorkspace("新内容"),
  });
  assert.equal((await service.get_artifact(input)).status, "refresh_required");
});
test("scoped browser token creation needs CSRF; stored records never contain plaintext tokens", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const listing = (
    await s.app.inject({
      url: "/api/mcp/connections",
      headers: s.browserHeaders,
    })
  ).json();
  const request = {
    method: "POST" as const,
    url: "/api/mcp/connections/tokens",
    headers: s.browserHeaders,
    payload: { name: "agent", projectIds: [s.a.id] },
  };
  assert.equal((await s.app.inject(request)).statusCode, 403);
  const created = await s.app.inject({
    ...request,
    headers: { ...s.browserHeaders, "x-mcp-csrf": listing.csrf },
  });
  assert.equal(created.statusCode, 201);
  const response = created.json();
  assert.ok(response.token.startsWith("uml_mcp_"));
  assert.doesNotMatch(
    JSON.stringify(await s.store.listConnections(s.alice.id)),
    new RegExp(response.token),
  );
  const expired = await s.access.createToken(
    s.alice.id,
    "expired",
    { projectScope: 'selected', projectIds: [s.a.id] },
    -1,
  );
  await assert.rejects(() => s.access.authenticate(`Bearer ${expired.token}`));
  s.authStore.updateProject(s.a.id, { status: "deleted" });
  const removed = s.parse(
    await s.rpc("tools/call", {
      name: "get_implementation_context",
      arguments: { projectId: s.a.id },
    }),
  ).result;
  assert.equal(removed.structuredContent.data.code, "access_denied");
});

test("account-wide personal tokens follow live project access, including projects created later", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const listing = (await s.app.inject({ url: "/api/mcp/connections", headers: s.browserHeaders })).json();
  const created = await s.app.inject({
    method: "POST",
    url: "/api/mcp/connections/tokens",
    headers: { ...s.browserHeaders, "x-mcp-csrf": listing.csrf },
    payload: { name: "all-my-projects", projectScope: "account", projectIds: [] },
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().connection.projectScope, "account");
  const principal = await s.access.authenticate(`Bearer ${created.json().token}`);
  const service = createMcpToolService(s.access, principal);
  const later = await s.authStore.createProject({ ownerUserId: s.alice.id, name: "Later project", description: "" });
  const projects = await service.list_projects(mcpListProjectsInputSchema.parse({}));
  assert.deepEqual(new Set((projects.data.items as { id: string }[]).map((project) => project.id)), new Set([s.a.id, later.project.id]));
  const scoped = createMcpToolService(s.access, await s.access.authenticate(s.headers.authorization));
  assert.deepEqual(((await scoped.list_projects(mcpListProjectsInputSchema.parse({}))).data.items as { id: string }[]).map((project) => project.id), [s.a.id]);
  assert.equal((await service.get_implementation_context(mcpContextInputSchema.parse({ projectId: later.project.id }))).status, "ok");
  await assert.rejects(() => service.get_implementation_context(mcpContextInputSchema.parse({ projectId: s.b.id })), { code: "access_denied" });
  s.authStore.deleteMember(s.ownerMember.id);
  await assert.rejects(() => service.get_implementation_context(mcpContextInputSchema.parse({ projectId: s.a.id })), { code: "access_denied" });
  const refreshed = await service.list_projects(mcpListProjectsInputSchema.parse({}));
  assert.deepEqual((refreshed.data.items as { id: string }[]).map((project) => project.id), [later.project.id]);
  await s.store.revokeGrant(principal.id);
  await assert.rejects(() => service.list_projects(mcpListProjectsInputSchema.parse({})), { code: "invalid_token" });
});

test("accounts with no projects can create personal tokens before creating their first project", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const user = await s.authStore.createUser({ username: "new", displayName: "New user", passwordHash: "not-a-password" });
  const token = await s.access.createToken(user.id, "new-account", { projectScope: "account", projectIds: [] }, 30);
  const service = createMcpToolService(s.access, await s.access.authenticate(`Bearer ${token.token}`));
  assert.deepEqual((await service.list_projects(mcpListProjectsInputSchema.parse({}))).data.items, []);
  const project = await s.authStore.createProject({ ownerUserId: user.id, name: "First project", description: "" });
  assert.equal((await service.get_implementation_context(mcpContextInputSchema.parse({ projectId: project.project.id }))).status, "ok");
  s.authStore.updateUser(user.id, { status: "disabled" });
  await assert.rejects(() => service.list_projects(mcpListProjectsInputSchema.parse({})), { code: "invalid_token" });
});
test("OAuth PKCE account consent without projects follows live access through refresh and revocation", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  // An empty account can authorize before creating or joining its first project.
  s.authStore.deleteMember(s.ownerMember.id);
  const jar = new Map<string, string>();
  jar.set("uml_session", s.browserHeaders.cookie.slice("uml_session=".length));
  const send = async (
    url: string,
    method: "GET" | "POST" = "GET",
    payload?: string | object,
    headers: Record<string, string> = {},
  ) => {
    const res = await s.app.inject({
      url,
      method,
      headers: {
        host: "localhost:4001",
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
        ...headers,
      },
      ...(payload === undefined ? {} : { payload }),
    });
    for (const cookie of res.cookies) jar.set(cookie.name, cookie.value);
    return res;
  };
  const verifier = "a".repeat(64);
  const params = new URLSearchParams({
    client_id: "test-client",
    redirect_uri: "http://127.0.0.1:8765/callback",
    response_type: "code",
    scope: "mcp:read offline_access",
    resource: s.config.resource,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: "local-state",
  });
  const auth = await send(`/api/mcp/oauth/auth?${params}`);
  assert.equal(auth.statusCode, 303, auth.body);
  const uid = new URL(auth.headers.location!).searchParams.get("interaction")!;
  const details = await send(`/api/mcp/interactions/${uid}`);
  assert.equal(details.statusCode, 200, details.body);
  const info = (await send("/api/mcp/connections")).json();
  const consent = await send(
    `/api/mcp/interactions/${uid}`,
    "POST",
    { csrf: info.csrf, projectScope: "account", projectIds: [] },
    { "x-mcp-csrf": info.csrf },
  );
  assert.equal(consent.statusCode, 200, consent.body);
  const resume = new URL(consent.json().redirect);
  const callback = await send(`${resume.pathname}${resume.search}`);
  assert.equal(callback.statusCode, 303, callback.body);
  const redirect = new URL(callback.headers.location!);
  const repeated = redirect.searchParams.get("interaction");
  assert.equal(
    redirect.searchParams.get("state"),
    "local-state",
    repeated
      ? JSON.stringify(
          (await s.store.findEntity("Interaction", "id", repeated))?.prompt,
        )
      : redirect.toString(),
  );
  assert.ok(redirect.searchParams.get("code"), redirect.toString());
  const exchange = await send(
    "/api/mcp/oauth/token",
    "POST",
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "test-client",
      code: redirect.searchParams.get("code")!,
      redirect_uri: "http://127.0.0.1:8765/callback",
      code_verifier: verifier,
      resource: s.config.resource,
    }).toString(),
    { "content-type": "application/x-www-form-urlencoded" },
  );
  assert.equal(exchange.statusCode, 200, exchange.body);
  const tokens = exchange.json();
  const principal = await s.access.authenticate(
    `Bearer ${tokens.access_token}`,
  );
  assert.deepEqual(principal.projectIds, []);
  const connections = (await send("/api/mcp/connections")).json().connections;
  assert.equal(connections.find((connection: { id: string }) => connection.id === principal.id).projectScope, "account");
  const service = createMcpToolService(s.access, principal);
  assert.deepEqual((await service.list_projects(mcpListProjectsInputSchema.parse({}))).data.items, []);
  const later = await s.authStore.createProject({ ownerUserId: s.alice.id, name: "Later OAuth project", description: "" });
  assert.deepEqual(((await service.list_projects(mcpListProjectsInputSchema.parse({}))).data.items as { id: string }[]).map((project) => project.id), [later.project.id]);
  assert.equal((await service.get_implementation_context(mcpContextInputSchema.parse({ projectId: later.project.id }))).status, "ok");
  await assert.rejects(() => service.get_implementation_context(mcpContextInputSchema.parse({ projectId: s.b.id })), { code: "access_denied" });
  s.authStore.deleteMember(later.ownerMember.id);
  await assert.rejects(() => service.get_implementation_context(mcpContextInputSchema.parse({ projectId: later.project.id })), { code: "access_denied" });
  assert.deepEqual((await service.list_projects(mcpListProjectsInputSchema.parse({}))).data.items, []);
  const joined = s.authStore.createMember({
    projectId: s.a.id, userId: s.alice.id, username: s.alice.username, displayName: s.alice.displayName,
    role: "viewer", status: "active", invitedByUserId: null, invitedAt: null, joinedAt: new Date().toISOString(),
  });
  assert.equal((await service.get_implementation_context(mcpContextInputSchema.parse({ projectId: s.a.id }))).status, "ok");
  assert.deepEqual(((await service.list_projects(mcpListProjectsInputSchema.parse({}))).data.items as { id: string }[]).map((project) => project.id), [s.a.id]);
  s.authStore.deleteMember(joined.id);
  assert.ok(tokens.refresh_token);
  const refreshed = await send(
    "/api/mcp/oauth/token",
    "POST",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: "test-client",
      refresh_token: tokens.refresh_token,
      resource: s.config.resource,
    }).toString(),
    { "content-type": "application/x-www-form-urlencoded" },
  );
  assert.equal(refreshed.statusCode, 200, refreshed.body);
  const refreshedPrincipal = await s.access.authenticate(`Bearer ${refreshed.json().access_token}`);
  assert.deepEqual(refreshedPrincipal.projectIds, []);
  await s.access.store.revokeGrant(principal.id);
  await assert.rejects(() =>
    s.access.authenticate(`Bearer ${refreshed.json().access_token}`),
  );
  const revoked = await send(
    "/api/mcp/oauth/token",
    "POST",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: "test-client",
      refresh_token: refreshed.json().refresh_token,
    }).toString(),
    { "content-type": "application/x-www-form-urlencoded" },
  );
  assert.equal(revoked.statusCode, 400);
  assert.equal(revoked.json().error, "invalid_grant");
});
test("official SDK v2 client completes discovery and all four tools over HTTP", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  s.authStore.saveProjectWorkspace({
    projectId: s.a.id,
    baseVersion: 0,
    updatedByUserId: s.alice.id,
    state: designWorkspace("使用 Spring Boot + Vue + MySQL 构建图书管理系统，每人最多借5本。"),
  });
  const client = new Client({ name: "platform-acceptance", version: "1" }, {
    supportedProtocolVersions: [protocolVersion], versionNegotiation: { mode: { pin: protocolVersion } },
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(s.config.resource),
    {
      requestInit: { headers: { authorization: s.headers.authorization } },
      fetch: async (url, options) => {
        const request = new Request(url, options);
        const headers = Object.fromEntries(request.headers);
        headers.host = "localhost:4001";
        const response = await s.app.inject({
          method: request.method as "POST" | "GET" | "DELETE",
          url: new URL(request.url).pathname,
          headers,
          ...(request.method === "POST"
            ? { payload: await request.text() }
            : {}),
        });
        return new Response(
          [204, 205, 304].includes(response.statusCode) ? null : response.body,
          {
            status: response.statusCode,
            headers: Object.fromEntries(
              Object.entries(response.headers).map(([key, value]) => [
                key,
                String(value),
              ]),
            ),
          },
        );
      },
    },
  );
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 4);
  const projects = await client.callTool({
    name: "list_projects",
    arguments: {},
  });
  assert.ok(projects.structuredContent);
  const context = (
    await client.callTool({
      name: "get_implementation_context",
      arguments: { projectId: s.a.id },
    })
  ).structuredContent as {
    data: {
      scope: unknown;
      contextVersion: string;
      manifest: { artifactId: string; contentHash: string }[];
    };
  };
  const artifact = await client.callTool({
    name: "get_artifact",
    arguments: {
      projectId: s.a.id,
      scope: context.data.scope,
      expectedContextVersion: context.data.contextVersion,
      artifactId: context.data.manifest[0].artifactId,
      expectedVersion: context.data.manifest[0].contentHash,
    },
  });
  assert.match(JSON.stringify(artifact.structuredContent), /Spring Boot/);
  s.authStore.saveProjectWorkspace({
    projectId: s.a.id,
    baseVersion: 1,
    updatedByUserId: s.alice.id,
    state: designWorkspace("使用 Spring Boot + Vue + MySQL 构建图书管理系统，每人最多借8本。"),
  });
  const updates = (
    await client.callTool({
      name: "check_context_updates",
      arguments: {
        projectId: s.a.id,
        scope: context.data.scope,
        manifest: context.data.manifest,
      },
    })
  ).structuredContent as { data: { changes: { change: string }[] } };
  assert.equal(updates.data.changes[0].change, "modified");
});
test("CIMD is advertised only after trusted metadata origins are configured", async (t) => {
  const s = await setup(undefined, "http://localhost:4001", "https://trusted-client.example");
  t.after(() => s.app.close());
  const metadata = await s.app.inject({
    url: "/.well-known/oauth-authorization-server/api/mcp/oauth",
    headers: { host: "localhost:4001" },
  });
  assert.equal(metadata.json().client_id_metadata_document_supported, true);
  assert.equal(metadata.json().registration_endpoint, `${s.config.issuer}/reg`);
  const untrusted = await s.app.inject({
    url: `/api/mcp/oauth/auth?${new URLSearchParams({
      client_id: "https://127.0.0.1/client.json",
      response_type: "code",
      redirect_uri: "http://127.0.0.1:8765/callback",
      scope: "mcp:read",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
    })}`,
    headers: { host: "localhost:4001" },
  });
  assert.ok(untrusted.statusCode >= 400 || untrusted.headers.location?.includes("error="), untrusted.body);
});

test("DCR validates redirects; missing PKCE, unknown resource and untrusted CIMD cannot authorize", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const registered = await s.app.inject({
    method: "POST",
    url: "/api/mcp/oauth/reg",
    headers: { host: "localhost:4001" },
    payload: {
      client_name: "Dynamic agent",
      redirect_uris: ["http://127.0.0.1:8765/callback"],
      token_endpoint_auth_method: "none",
    },
  });
  assert.equal(registered.statusCode, 201, registered.body);
  // Default OAuth discovery uses DCR, and the platform supplies the resource when the client omits it.
  const authorize = await s.app.inject({
    url: `/api/mcp/oauth/auth?${new URLSearchParams({
      client_id: registered.json().client_id,
      response_type: "code",
      redirect_uri: "http://127.0.0.1:8765/callback",
      scope: "mcp:read",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
    })}`,
    headers: { host: "localhost:4001" },
  });
  assert.equal(authorize.statusCode, 303, authorize.body);
  assert.match(authorize.headers.location!, /\/account\/connections\?interaction=/);
  const invalid = await s.app.inject({
    method: "POST",
    url: "/api/mcp/oauth/reg",
    headers: { host: "localhost:4001" },
    payload: { redirect_uris: ["http://attacker.test/callback"] },
  });
  assert.equal(invalid.statusCode, 400);
  const base = {
    client_id: "test-client",
    response_type: "code",
    redirect_uri: "http://127.0.0.1:8765/callback",
    scope: "mcp:read",
    resource: s.config.resource,
  };
  for (const params of [
    base,
    { ...base, client_id: "https://127.0.0.1/client.json" },
    {
      ...base,
      resource: "https://other-resource.test/",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
    },
  ]) {
    const response = await s.app.inject({
      url: `/api/mcp/oauth/auth?${new URLSearchParams(params)}`,
      headers: { host: "localhost:4001" },
    });
    assert.ok(
      response.statusCode >= 400 ||
        Boolean(response.headers.location?.includes("error=")),
      response.body,
    );
  }
});
test("member removal, disabled accounts and concurrent principals are checked at read time", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const bobToken = await s.access.createToken(s.bob.id, "bob", { projectScope: 'selected', projectIds: [s.b.id] }, 30);
  const bob = createMcpToolService(
    s.access,
    await s.access.authenticate(`Bearer ${bobToken.token}`),
  );
  const alice = createMcpToolService(
    s.access,
    await s.access.authenticate(s.headers.authorization),
  );
  const [a, b] = await Promise.all([
    alice.get_implementation_context(
      mcpContextInputSchema.parse({ projectId: s.a.id }),
    ),
    bob.get_implementation_context(
      mcpContextInputSchema.parse({ projectId: s.b.id }),
    ),
  ]);
  assert.equal((a.data.project as { id: string }).id, s.a.id);
  assert.equal((b.data.project as { id: string }).id, s.b.id);
  s.authStore.deleteMember(s.ownerMember.id);
  await assert.rejects(() =>
    alice.get_implementation_context(
      mcpContextInputSchema.parse({ projectId: s.a.id }),
    ),
  );
  s.authStore.updateUser(s.bob.id, { status: "disabled" });
  await assert.rejects(() => s.access.authenticate(`Bearer ${bobToken.token}`));
});
test("invalid JSON stays a JSON-RPC parse error and feature-off prevents external access", async (t) => {
  const s = await setup("http://localhost:4003");
  t.after(() => s.app.close());
  const malformed = await s.app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: { ...s.headers, "content-type": "application/json" },
    payload: "{",
  });
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.json().error.code, -32700);
  const forwarded = await s.app.inject({
    url: "/.well-known/oauth-protected-resource/api/mcp",
    headers: { host: "127.0.0.1:4001", "x-forwarded-host": "localhost:4001" },
  });
  assert.equal(forwarded.statusCode, 200);
  const browserProxy = await s.app.inject({
    url: "/api/mcp/connections",
    headers: {
      ...s.browserHeaders,
      host: "127.0.0.1:4001",
      "x-forwarded-host": "localhost:4003",
      origin: "http://localhost:4003",
    },
  });
  assert.equal(browserProxy.statusCode, 200);
  const invalidHost = await s.app.inject({
    url: "/api/mcp/connections",
    headers: {
      ...s.browserHeaders,
      host: "127.0.0.1:4001",
      "x-forwarded-host": "attacker.test",
    },
  });
  assert.equal(invalidHost.statusCode, 403);
  const disabled = await createConfiguredFastifyApp();
  disabled.log.level = "silent";
  t.after(() => disabled.close());
  await registerMcpModule({
    app: disabled,
    authStore: s.authStore,
    pool: null,
    production: false,
    config: null,
  });
  assert.equal(
    (await disabled.inject({ url: "/api/mcp/connections" })).json().enabled,
    false,
  );
  assert.equal(
    (await disabled.inject({ method: "POST", url: "/api/mcp", payload: {} }))
      .statusCode,
    404,
  );
  assert.equal(
    (
      await disabled.inject({
        url: "/.well-known/oauth-protected-resource/api/mcp",
      })
    ).statusCode,
    404,
  );
});

test("implementation bundle and verifier use normal paging and source version guards without documents", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const { mcpUpdatesInputSchema, mcpImplementationSnapshotSchema, mcpImplementationReportSchema } = await import("@uml-platform/contracts");
  await s.authStore.saveProjectWorkspace({
    projectId: s.a.id, baseVersion: 0, updatedByUserId: s.alice.id,
    state: { ...designWorkspace("每名学生最多借5本"), rules: [{ id: "BORROW", type: "business-rule" as const, text: "最多5本",  }] },
  });
  const service = createMcpToolService(s.access, await s.access.authenticate(s.headers.authorization));
  const scope = { requirementIds: [], artifactIds: [] };
  const directory: any[] = [];
  const manifest: any[] = [];
  let cursor: string | undefined;
  let contextVersion: string | undefined;
  do {
    const page = await service.get_implementation_context(mcpContextInputSchema.parse({
      projectId: s.a.id, scope, limit: 1, cursor, expectedContextVersion: contextVersion,
    }));
    assert.equal(page.status, "ok");
    contextVersion = page.data.contextVersion as string;
    directory.push(...page.data.artifacts as any[]);
    manifest.push(...page.data.manifest as any[]);
    cursor = page.data.nextCursor as string | undefined;
  } while (cursor);
  assert.ok(directory.every((entry) => !entry.id.startsWith("document:") && entry.stage !== "documents"));
  assert.ok(directory.some((entry) => entry.id === "implementation:validator"));
  assert.ok(manifest.every((entry) => !entry.artifactId.startsWith("implementation:")));
  async function readPayload(id: string) {
    const entry = directory.find((value) => value.id === id)!;
    let nextOffset: number | null = 0;
    let joined = "";
    while (nextOffset !== null) {
      const response = await service.get_artifact(mcpArtifactInputSchema.parse({
        projectId: s.a.id, scope, artifactId: id, expectedContextVersion: contextVersion,
        expectedVersion: entry.version.contentHash, offset: nextOffset, length: 24000,
      }));
      assert.equal(response.status, "ok");
      joined += response.data.chunk;
      nextOffset = response.data.nextOffset as number | null;
    }
    return JSON.parse(joined);
  }
  const bundle = await readPayload("implementation:bundle");
  const report = await readPayload("implementation:report");
  assert.ok(mcpImplementationSnapshotSchema.safeParse(bundle.snapshot).success);
  assert.ok(mcpImplementationReportSchema.safeParse(report.reportTemplate).success);
  assert.equal(bundle.reportTemplate, undefined);
  assert.equal(bundle.reportSchema, undefined);
  assert.deepEqual(bundle.readPolicy.beforeVerification, ["implementation:report", "implementation:validator"]);
  assert.equal(bundle.snapshot.contextVersion, contextVersion);
  assert.deepEqual(bundle.snapshot.manifest, manifest);
  const snapshot = mcpImplementationSnapshotSchema.parse(bundle.snapshot);
  assert.equal(bundle.snapshot.version, 2);
  assert.equal(report.reportTemplate.version, 2);
  assert.equal(report.reportTemplate.contextVersion, contextVersion);
  assert.ok(snapshot.tasks.every((task) => task.sourceArtifactIds.every((id) => !id.startsWith("document:"))));
  const validator = await readPayload("implementation:validator");
  assert.equal(validator.source, undefined);
  assert.equal(validator.downloadUrl, new URL(verifierAsset.path, s.config.origin).href);
  assert.equal(validator.contentHash, verifierAsset.contentHash);
  const validatorDirectory = directory.find((value) => value.id === "implementation:validator")!;
  assert.equal(validatorDirectory.requiresRead, false);
  assert.equal(validatorDirectory.inlinePayload.downloadUrl, validator.downloadUrl);
  const download = await s.app.inject({ url: new URL(validator.downloadUrl).pathname, headers: { host: new URL(s.config.origin).host } });
  assert.equal(download.statusCode, 200);
  assert.equal(download.body, implementationVerifierSource);
  assert.equal(`sha256:${createHash("sha256").update(download.rawPayload).digest("hex")}`, validator.contentHash);
  const unchanged = await service.check_context_updates(mcpUpdatesInputSchema.parse({ projectId: s.a.id, scope, manifest: bundle.snapshot.manifest }));
  assert.deepEqual(unchanged.data.changes, []);
  // Existing clients must discard removed document baselines and cannot read their old artifact IDs.
  const removedDocument = { artifactId: "document:document-a", contentHash: "sha256:old-document", inputFingerprint: null, freshness: "unknown" };
  const removed = await service.check_context_updates(mcpUpdatesInputSchema.parse({ projectId: s.a.id, scope, manifest: [...manifest, removedDocument] }));
  assert.deepEqual(removed.data.changes, [{ artifactId: removedDocument.artifactId, change: "deleted", previous: removedDocument, current: null }]);
  const unavailable = await service.get_artifact(mcpArtifactInputSchema.parse({
    projectId: s.a.id, scope, artifactId: removedDocument.artifactId, expectedContextVersion: contextVersion,
    expectedVersion: removedDocument.contentHash,
  }));
  assert.equal(unavailable.status, "refresh_required");
  const documentScope = await service.get_implementation_context(mcpContextInputSchema.parse({
    projectId: s.a.id, scope: { requirementIds: [], artifactIds: [removedDocument.artifactId] },
  }));
  assert.equal(documentScope.status, "selection_required");
  await s.authStore.saveProjectWorkspace({
    projectId: s.a.id, baseVersion: 1, updatedByUserId: s.alice.id,
    state: { ...designWorkspace("每名学生最多借8本"), rules: [{ id: "BORROW", type: "business-rule" as const, text: "最多8本",  }] },
  });
  const changed = await service.check_context_updates(mcpUpdatesInputSchema.parse({ projectId: s.a.id, scope, manifest }));
  assert.ok((changed.data.changes as any[]).some((entry) => entry.artifactId === "design:implementation" && entry.change === "modified"));
  const outdated = await service.get_artifact(mcpArtifactInputSchema.parse({
    projectId: s.a.id, scope, artifactId: "implementation:bundle", expectedContextVersion: contextVersion,
    expectedVersion: directory.find((entry) => entry.id === "implementation:bundle").version.contentHash,
  }));
  assert.equal(outdated.status, "refresh_required");
});

test("generic verifier downloads are byte-exact, immutable and independent of private workspaces", async (t) => {
  const s = await setup();
  t.after(() => s.app.close());
  const workspaceRead = t.mock.method(s.authStore, "getProjectWorkspace", () => { throw new Error("Download must not load project data"); });
  const headers = { host: new URL(s.config.origin).host };
  const response = await s.app.inject({ url: verifierAsset.path, headers });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, implementationVerifierSource);
  assert.equal(response.rawPayload.length, verifierAsset.bytes.length);
  assert.match(response.headers["content-type"]!, /^text\/javascript; charset=utf-8/);
  assert.equal(response.headers["content-disposition"], 'attachment; filename="uml-verify.mjs"');
  assert.equal(response.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal(response.headers.etag, verifierAsset.etag);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  const cached = await s.app.inject({ url: verifierAsset.path, headers: { ...headers, "if-none-match": `W/${verifierAsset.etag}` } });
  assert.equal(cached.statusCode, 304);
  assert.equal(cached.body, "");
  const head = await s.app.inject({ method: "HEAD", url: verifierAsset.path, headers });
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, "");
  assert.equal(Number(head.headers["content-length"]), verifierAsset.bytes.length);
  const missing = await s.app.inject({ url: `/api/mcp/assets/${"0".repeat(64)}/uml-verify.mjs`, headers });
  assert.equal(missing.statusCode, 404);
  assert.equal(workspaceRead.mock.callCount(), 0);
});

test("disabled MCP does not expose the verifier download", async (t) => {
  const app = await createConfiguredFastifyApp();
  t.after(() => app.close());
  await registerMcpModule({ app, authStore: createInMemoryAuthStore(), pool: null, production: false, config: null });
  assert.equal((await app.inject({ url: verifierAsset.path })).statusCode, 404);
});


test("ordinary MCP uses trusted project mode and omits professional implementation artifacts", async t => {
  const s = await setup(); t.after(() => s.app.close());
  const { project } = s.authStore.createProject({ ownerUserId: s.alice.id, name: "普通版", projectMode: "standard", description: null });
  s.authStore.saveProjectWorkspace({ projectId: project.id, baseVersion: 0, updatedByUserId: s.alice.id,
    state: { standardProject: { description: "修改后的需求", rounds: [], diagrams: {} }, projectMode: "professional" } });
  const token = await s.access.createToken(s.alice.id, "ordinary", { projectScope: 'selected', projectIds: [project.id] }, 30);
  const service = createMcpToolService(s.access, await s.access.authenticate(`Bearer ${token.token}`));
  const response = await service.get_implementation_context(mcpContextInputSchema.parse({ projectId: project.id }));
  assert.equal(response.status, "ok");
  assert.equal(response.data.project.projectMode, "standard");
  assert.equal(response.data.implementation, null);
  assert.ok(response.data.artifacts.some((item: { id: string }) => item.id === "standard:description"));
  assert.equal(response.data.artifacts.some((item: { id: string }) => item.id.startsWith("implementation:")), false);
  assert.match(response.data.instructions, /普通版/);
});
