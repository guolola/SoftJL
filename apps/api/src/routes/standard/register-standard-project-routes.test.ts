// Checks project-mode isolation, membership permissions and durable clarification through the real HTTP boundary.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { createProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import { createInMemoryLlmScheduler } from "../../adapters/llm/llm-scheduler.js";
import { registerStandardProjectRoutes } from "./register-standard-project-routes.js";
import { registerProjectRoutes } from "../projects/register-project-routes.js";
import { createFileDocumentLibrary } from "../../documents/library/document-library.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createStandardProjectState, type StandardProjectState } from "@uml-platform/contracts";
import { ModelCatalog } from "../../provider-configs/model-catalog.js";

test("model context reads canonical catalog capacity without requiring output metadata or starting a paid call", async t => {
  const app = Fastify(); const authStore = createInMemoryAuthStore();
  const owner = authStore.createUser({ email: "capacity@standard.test", displayName: "Owner", passwordHash: "test" })!;
  const cookie = `uml_session=${authStore.createSession({ userId: owner.id, ipAddress: "127.0.0.1", userAgent: "test" }).id}`;
  const { project } = authStore.createProject({ ownerUserId: owner.id, name: "Capacity", description: null, visibility: "private", projectMode: "standard" });
  const providerConfigs = createProviderConfigStore({ secret: "test" }); const model = "deepseek-v4.1-flash";
  const config = providerConfigs.create({ name: "test", baseUrl: "https://ai.comfly.org", apiKey: "test", defaultModel: model, allowedModels: [model], createdBy: "test" });
  const dir = await mkdtemp(join(tmpdir(), "uml-context-route-"));
  const previous = process.env.UML_STANDARD_CONTEXT_TOKENS; delete process.env.UML_STANDARD_CONTEXT_TOKENS;
  t.after(async () => {
    await app.close(); assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep)); await rm(dir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.UML_STANDARD_CONTEXT_TOKENS; else process.env.UML_STANDARD_CONTEXT_TOKENS = previous;
  });
  const modelCatalog = new ModelCatalog(join(dir, "catalog.json"), async () => ({ providers: [{ id: "empty" }, { id: "complete" }], models: [
    { provider: "empty", id: model, created_by: "deepseek" },
    { provider: "complete", id: `deepseek/${model}`, created_by: "deepseek", context_window: 1000000 },
  ] }));
  await modelCatalog.load(); await modelCatalog.refresh(); let calls = 0;
  registerStandardProjectRoutes({ app, authStore, providerConfigs, modelCatalog, llmScheduler: createInMemoryLlmScheduler(),
    llmTransport: { async *streamChatCompletion() { calls++; yield "unused"; } }, renderClient: async () => { throw new Error("unused"); }, pngRenderClient: async () => { throw new Error("unused"); } });
  const response = await app.inject({ url: `/api/projects/${project.id}/standard/model-context?${new URLSearchParams({ providerConfigId: config.id, model })}`, headers: { cookie } });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().capacity.context, 1000000); assert.equal(response.json().capacity.output, null);
  assert.equal(response.json().capacity.source, "modelpedia"); assert.equal(response.json().contextBudget, 1000000); assert.equal(calls, 0);
  const engineering = authStore.createProject({ ownerUserId: owner.id, name: "Engineering", description: null, visibility: "private", projectMode: "professional" }).project;
  const sharedUrl = `/api/projects/${engineering.id}/model-context?${new URLSearchParams({ providerConfigId: config.id, model })}`;
  const shared = await app.inject({ url: sharedUrl, headers: { cookie } });
  assert.equal(shared.statusCode, 200, shared.body);
  assert.deepEqual(shared.json(), response.json());
  assert.equal((await app.inject({ url: sharedUrl })).statusCode, 401);
  assert.equal(calls, 0);
});

test("acknowledges chat with its durable user message before model execution and never duplicates retries", async t => {
  const app = Fastify(); const authStore = createInMemoryAuthStore();
  const owner = authStore.createUser({ email: "ack@standard.test", displayName: "Owner", passwordHash: "test" })!;
  const cookie = `uml_session=${authStore.createSession({ userId: owner.id, ipAddress: "127.0.0.1", userAgent: "test" }).id}`;
  const { project } = authStore.createProject({ ownerUserId: owner.id, name: "Chat", description: null, visibility: "private", projectMode: "standard" });
  const providerConfigs = createProviderConfigStore({ secret: "test" });
  const config = providerConfigs.create({ name: "test", baseUrl: "https://example.test", apiKey: "test", defaultModel: "test", allowedModels: ["test"], createdBy: "test" });
  const scheduler = createInMemoryLlmScheduler();
  // Stop at the scheduling boundary: this test must never contact an external provider.
  scheduler.run = async () => { throw new Error("test queue stopped"); };
  registerStandardProjectRoutes({ app, authStore, providerConfigs, llmScheduler: scheduler,
    llmTransport: { async *streamChatCompletion() { throw new Error("unexpected model call"); } },
    renderClient: async () => { throw new Error("unexpected rendering"); }, pngRenderClient: async () => { throw new Error("unexpected rendering"); } });
  t.after(() => app.close());
  const url = `/api/projects/${project.id}/standard`;
  const requestId = "11111111-1111-4111-8111-111111111111";
  const payload = { operation: "chat", requestId, message: "你好", quote: { text: "引用内容" },
    attachments: [{ id: "file", name: "scope.txt", type: "document", contentType: "text/plain", text: "附件内容" }],
    providerSettings: { providerConfigId: config.id, model: "test" } };
  const started = await app.inject({ method: "POST", url, headers: { cookie }, payload });
  assert.equal(started.statusCode, 202, started.body);
  const acknowledged = started.json().state;
  assert.equal(acknowledged.conversation.length, 1);
  assert.deepEqual(acknowledged.conversation[0], { id: `user:${requestId}`, role: "user", text: "你好", status: "completed",
    createdAt: acknowledged.conversation[0].createdAt, quote: payload.quote, attachments: payload.attachments });
  assert.equal(acknowledged.piSession, undefined);
  assert.equal(acknowledged.acceptedCommands, undefined);
  const repeated = await app.inject({ method: "POST", url, headers: { cookie }, payload });
  assert.equal(repeated.statusCode, 200);
  const persisted = (await app.inject({ url, headers: { cookie } })).json().state;
  assert.equal(persisted.conversation.filter((message: { role: string }) => message.role === "user").length, 1);
});

test("revision commands require current history, valid user content and stored attachment capabilities before starting a model call", async t => {
  const app = Fastify(); const authStore = createInMemoryAuthStore();
  const owner = authStore.createUser({ email: "revision@standard.test", displayName: "Owner", passwordHash: "test" })!;
  const cookie = `uml_session=${authStore.createSession({ userId: owner.id, ipAddress: "127.0.0.1", userAgent: "test" }).id}`;
  const { project } = authStore.createProject({ ownerUserId: owner.id, name: "Revision", description: null, visibility: "private", projectMode: "standard" });
  const providerConfigs = createProviderConfigStore({ secret: "test" });
  const config = providerConfigs.create({ name: "test", baseUrl: "https://ai.comfly.org", apiKey: "test", defaultModel: "test", allowedModels: ["test"], createdBy: "test" });
  const providerSettings = { providerConfigId: config.id, model: "test" };
  const state: StandardProjectState = { ...createStandardProjectState(), conversation: [
    { id: "u", role: "user", text: "describe this image", status: "completed", createdAt: "now", attachments: [{ id: "f", name: "i.png", type: "image", contentType: "image/png", data: "iVBORw0KGgo=" }] },
    { id: "a", role: "assistant", text: "saved response", status: "completed", createdAt: "now" },
  ] };
  const workspace = authStore.getProjectWorkspace(project.id);
  authStore.saveProjectWorkspace({ projectId: project.id, baseVersion: workspace.version, updatedByUserId: owner.id, state: { standardProject: state } });
  let calls = 0;
  registerStandardProjectRoutes({ app, authStore, providerConfigs, llmScheduler: createInMemoryLlmScheduler(),
    llmTransport: { async *streamChatCompletion() { calls++; yield "unused"; } }, renderClient: async () => { throw new Error("unused"); }, pngRenderClient: async () => { throw new Error("unused"); } });
  t.after(() => app.close());
  const path = `/api/projects/${project.id}/standard`;
  const send = (payload: Record<string, unknown>) => app.inject({ method: "POST", url: path, headers: { cookie }, payload: { ...payload, providerSettings } });
  assert.equal((await send({ operation: "edit", messageId: "u", message: "new requirement" })).statusCode, 409);
  assert.equal((await send({ operation: "edit", messageId: "u", expectedHeadId: "stale", message: "new requirement" })).statusCode, 409);
  assert.equal((await send({ operation: "edit", messageId: "a", expectedHeadId: "a", message: "new requirement" })).statusCode, 409);
  assert.equal((await send({ operation: "edit", messageId: "u", expectedHeadId: "a", useRecommendations: true })).statusCode, 400);
  // Forged empty attachments cannot bypass checking the stored original image when regenerating.
  const regenerate = await send({ operation: "regenerate", messageId: "a", expectedHeadId: "a", attachments: [] });
  assert.equal(regenerate.statusCode, 400); assert.match(regenerate.json().message, /支持图片/);
  const persisted = (await app.inject({ url: path, headers: { cookie } })).json().state;
  assert.deepEqual(persisted.conversation, state.conversation); assert.equal(persisted.run, undefined); assert.equal(calls, 0);
});

test("ordinary endpoints require membership and trusted ordinary mode, preserve questions, and prevent forged state", async t => {
  const app = Fastify(); const authStore = createInMemoryAuthStore();
  const owner = authStore.createUser({ email: "owner@standard.test", displayName: "Owner", passwordHash: "test" })!;
  const other = authStore.createUser({ email: "other@standard.test", displayName: "Other", passwordHash: "test" })!;
  const cookie = `uml_session=${authStore.createSession({ userId: owner.id, ipAddress: "127.0.0.1", userAgent: "test" }).id}`;
  const outsider = `uml_session=${authStore.createSession({ userId: other.id, ipAddress: "127.0.0.1", userAgent: "test" }).id}`;
  const providerConfigs = createProviderConfigStore({ secret: "test" });
  const config = providerConfigs.create({ name: "test", baseUrl: "https://ai.comfly.org", apiKey: "test", defaultModel: "test", allowedModels: ["test"], createdBy: "test" });
  let calls = 0;
  const libraryRoot = await mkdtemp(join(tmpdir(), "uml-standard-documents-"));
  const documentLibrary = createFileDocumentLibrary(libraryRoot);
  t.after(async () => {
    assert.ok(resolve(libraryRoot).startsWith(resolve(tmpdir()) + sep));
    await rm(libraryRoot, { recursive: true, force: true });
  });
  registerProjectRoutes({ app, authStore });
  registerStandardProjectRoutes({ app, authStore, providerConfigs, documentLibrary, llmScheduler: createInMemoryLlmScheduler(),
    llmTransport: { async *streamChatCompletion() { calls++; yield JSON.stringify({ kind: "questions", questions: [{ id: "q1", title: "谁可以借阅？", options: ["学生", "所有用户"], recommendation: "学生" }] }); } },
    renderClient: async () => { throw new Error("No rendering during clarification"); },
    pngRenderClient: async () => { throw new Error("No PNG during clarification"); },
  });
  t.after(() => app.close());
  const created = await app.inject({ method: "POST", url: "/api/projects", headers: { cookie }, payload: { name: "普通版" } });
  assert.equal(created.statusCode, 201); assert.equal(created.json().project.projectMode, "standard");
  const projectId = created.json().project.id;
  const { project: pro } = authStore.createProject({ ownerUserId: owner.id, name: "旧项目", description: null, visibility: "private" });
  const path = `/api/projects/${projectId}/standard`;
  const capacityUrl = `${path}/model-context?providerConfigId=${config.id}&model=test`;
  assert.equal((await app.inject({ url: capacityUrl })).statusCode, 401);
  assert.equal((await app.inject({ url: capacityUrl, headers: { cookie: outsider } })).statusCode, 403);
  const capacity = await app.inject({ url: capacityUrl, headers: { cookie } });
  assert.equal(capacity.statusCode, 200);
  assert.equal(capacity.json().capacity.source, "unknown");
  assert.equal(calls, 0, "reading capacity must not start an LLM call");
  assert.equal((await app.inject({ url: `${path}/model-context?providerConfigId=${config.id}&model=unconfigured`, headers: { cookie } })).statusCode, 400);
  assert.equal((await app.inject({ method: "GET", url: path })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: path, headers: { cookie: outsider } })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: `/api/projects/${pro.id}/standard`, headers: { cookie }, payload: { operation: "prepare", projectMode: "standard" } })).statusCode, 409);
  const payload = JSON.stringify({ operation: "prepare", requestId: "11111111-1111-4111-8111-111111111111", description: "图书系统", providerSettings: { providerConfigId: config.id, model: "test" } });
  // Browser fetch defaults string bodies to text/plain unless the API wrapper declares JSON.
  const invalid = await app.inject({ method: "POST", url: path, headers: { cookie, "content-type": "text/plain;charset=UTF-8" }, payload });
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls, 0, "invalid request encoding must fail before calling the model");
  const started = await app.inject({ method: "POST", url: path, headers: { cookie, "content-type": "application/json" }, payload });
  assert.equal(started.statusCode, 202, started.body);
  let state;
  for (let attempt = 0; attempt < 100; attempt++) {
    state = (await app.inject({ method: "GET", url: path, headers: { cookie } })).json().state;
    if (state.run.status !== "running") break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(state.run.status, "completed", JSON.stringify(state));
  assert.equal(state.rounds[0].questions[0].id, "q1"); assert.equal(calls, 1);
  const repeated = await app.inject({ method: "POST", url: path, headers: { cookie, "content-type": "application/json" }, payload });
  assert.equal(repeated.statusCode, 200); assert.equal(repeated.json().state.run.id, state.run.id);
  assert.equal(calls, 1, "replaying an accepted command must return the existing task");
  const beforeSession = authStore.getProjectWorkspace(projectId);
  authStore.saveProjectWorkspace({ projectId, baseVersion: beforeSession.version, updatedByUserId: owner.id, state: {
    ...beforeSession.state, standardProject: { ...state, piSession: { entries: [{ privateToolHistory: "internal" }], leafId: null }, memory: ["使用关系数据库"] },
  } });
  const publicWorkspace = await app.inject({ method: "GET", url: `/api/projects/${projectId}/workspace`, headers: { cookie } });
  assert.equal(publicWorkspace.json().state.standardProject.piSession, undefined);
  assert.deepEqual(publicWorkspace.json().state.standardProject.memory, ["使用关系数据库"]);
  const workspace = authStore.getProjectWorkspace(projectId);
  const save = await app.inject({ method: "PUT", url: `/api/projects/${projectId}/workspace`, headers: { cookie }, payload: { baseVersion: workspace.version, state: { standardProject: { description: "forged" } } } });
  assert.equal(save.statusCode, 200);
  assert.equal(save.json().state.standardProject.description, "图书系统");
  assert.equal(save.json().state.standardProject.piSession, undefined);
  assert.ok((authStore.getProjectWorkspace(projectId).state.standardProject as Record<string, unknown>).piSession);
  const rename = await app.inject({ method: "PATCH", url: `/api/projects/${projectId}`, headers: { cookie }, payload: { name: "改名", projectMode: "professional" } });
  assert.equal(rename.statusCode, 200); assert.equal(rename.json().project.projectMode, "standard");

  // Adopt pre-library ordinary files once and serve the edited library file on subsequent downloads.
  const beforeDocument = authStore.getProjectWorkspace(projectId);
  authStore.saveProjectWorkspace({ projectId, baseVersion: beforeDocument.version, updatedByUserId: owner.id, state: {
    ...beforeDocument.state, standardProject: { ...(beforeDocument.state.standardProject as object), documents: {
      requirementsSpec: { title: "需求规格说明书", markdown: "# 系统需求\n支持图书借阅。", generatedAt: new Date().toISOString(), diagrams: [] },
    } },
  } });
  const publish = `${path}/documents/requirementsSpec/publish`;
  assert.equal((await app.inject({ method: "POST", url: publish, headers: { cookie: outsider } })).statusCode, 403);
  const firstPublish = await app.inject({ method: "POST", url: publish, headers: { cookie } });
  assert.equal(firstPublish.statusCode, 200, firstPublish.body);
  const documentId = firstPublish.json().state.documents.requirementsSpec.documentId;
  assert.ok(documentId);
  const secondPublish = await app.inject({ method: "POST", url: publish, headers: { cookie } });
  assert.equal(secondPublish.json().state.documents.requirementsSpec.documentId, documentId);
  const documents = await documentLibrary.listDocuments(`project-${projectId}`);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].sourceRunId, null);
  await documentLibrary.updateDocumentBuffer(`project-${projectId}`, documentId, Buffer.from("edited Word document"));
  const download = await app.inject({ method: "GET", url: `${path}/documents/requirementsSpec/download`, headers: { cookie } });
  assert.equal(download.statusCode, 200);
  assert.equal(download.body, "edited Word document");
  assert.equal(calls, 1, "adoption must not call the model again");
});

test("stop preserves completed artifacts and continuation resumes only the saved unfinished scope", async t => {
  const app = Fastify(); const authStore = createInMemoryAuthStore();
  const owner = authStore.createUser({ email: "resume@standard.test", displayName: "Owner", passwordHash: "test" })!;
  const cookie = `uml_session=${authStore.createSession({ userId: owner.id, ipAddress: "127.0.0.1", userAgent: "test" }).id}`;
  const { project } = authStore.createProject({ ownerUserId: owner.id, name: "Recovery", description: "system", visibility: "private", projectMode: "standard" });
  const providerConfigs = createProviderConfigStore({ secret: "test" });
  const config = providerConfigs.create({ name: "test", baseUrl: "https://ai.comfly.org", apiKey: "test", defaultModel: "test", allowedModels: ["test"], createdBy: "test" });
  const providerSettings = { providerConfigId: config.id, model: "test" };
  const node = { id: "book", type: "class", label: "Book", fields: [], methods: [] };
  const state: StandardProjectState = { ...createStandardProjectState("system"), outline: { title: "System", summary: "Borrow", roles: [{ id: "user", name: "User", description: "Borrow" }], businesses: [{ id: "borrow", name: "Borrow", roleIds: ["user"], description: "Borrow", steps: ["Submit"], exceptions: [] }], entities: [{ id: "book", name: "Book", attributes: ["ID"] }], modules: ["Books"], relationships: [], assumptions: [] },
    diagrams: { function: { id: "function", kind: "function", title: "Keep", status: "completed", svg: "<svg>keep</svg>" }, class: { id: "class", kind: "class", title: "Class", status: "failed" } } };
  const workspace = authStore.getProjectWorkspace(project.id);
  authStore.saveProjectWorkspace({ projectId: project.id, baseVersion: workspace.version, updatedByUserId: owner.id, state: { standardProject: state } });
  let block = true; let calls = 0;
  registerStandardProjectRoutes({ app, authStore, providerConfigs, llmScheduler: createInMemoryLlmScheduler(),
    llmTransport: { async *streamChatCompletion(input) {
      calls++; assert.equal(JSON.parse(String(input.messages[1]!.content)).task.id, "class");
      if (block) await new Promise<void>((_, reject) => {
        const abort = () => reject(new Error("stopped")); input.abortSignal?.addEventListener("abort", abort, { once: true }); if (input.abortSignal?.aborted) abort();
      });
      yield JSON.stringify({ nodes: [node], edges: [] });
    } },
    renderClient: async () => ({ svg: "<svg>new</svg>", renderMeta: { engine: "test", generatedAt: "now", sourceLength: 1, durationMs: 1 } }),
    pngRenderClient: async () => { throw new Error("No documents"); },
  });
  t.after(() => app.close());
  const path = `/api/projects/${project.id}/standard`;
  const start = await app.inject({ method: "POST", url: path, headers: { cookie }, payload: { operation: "retry", diagramId: "class", providerSettings } });
  assert.equal(start.statusCode, 202, start.body);
  for (let at = 0; calls === 0 && at < 100; at++) await new Promise(resolve => setTimeout(resolve, 5));
  const stopped = await app.inject({ method: "POST", url: `${path}/cancel`, headers: { cookie } });
  assert.equal(stopped.json().state.run.status, "stopped");
  assert.equal(stopped.json().state.diagrams.function.svg, "<svg>keep</svg>");
  const runId = stopped.json().state.run.id;
  for (let at = 0; at < 3; at++) assert.equal((await app.inject({ method: "GET", url: path, headers: { cookie } })).json().state.run.id, runId);
  assert.equal(calls, 1, "reconnecting reads never restart work");
  block = false;
  const continued = await app.inject({ method: "POST", url: path, headers: { cookie }, payload: { operation: "resume", resumeRunId: runId, providerSettings } });
  assert.equal(continued.statusCode, 202, continued.body);
  let finished = continued.json().state;
  for (let at = 0; at < 100; at++) { finished = (await app.inject({ method: "GET", url: path, headers: { cookie } })).json().state; if (finished.run.status !== "running") break; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.equal(finished.run.status, "completed"); assert.equal(finished.run.continuedFrom, runId);
  assert.equal(finished.diagrams.function.svg, "<svg>keep</svg>"); assert.equal(finished.diagrams.class.status, "completed"); assert.equal(calls, 2);
  const stale = await app.inject({ method: "POST", url: path, headers: { cookie }, payload: { operation: "resume", resumeRunId: runId, providerSettings } });
  assert.equal(stale.statusCode, 409); assert.equal(calls, 2);
});

// A real service replacement must unlock the persisted run without sending another model request.
test("reconciles a run left by a previous process and preserves its completed artifacts and continuation scope", async t => {
  const app = Fastify(); const authStore = createInMemoryAuthStore();
  const owner = authStore.createUser({ email: "restart@standard.test", displayName: "Owner", passwordHash: "test" })!;
  const cookie = `uml_session=${authStore.createSession({ userId: owner.id, ipAddress: "127.0.0.1", userAgent: "test" }).id}`;
  const { project } = authStore.createProject({ ownerUserId: owner.id, name: "Restart", description: "Saved requirements", visibility: "private", projectMode: "standard" });
  const workspace = authStore.getProjectWorkspace(project.id);
  const state: StandardProjectState = { ...createStandardProjectState("Saved requirements"),
    run: { id: "previous-process-run", operation: "chat", status: "running", startedAt: new Date(Date.now() - process.uptime() * 1000 - 60000).toISOString(), work: { ids: ["class"] } },
    conversation: [{ id: "partial", role: "assistant", text: "Partial response", status: "streaming", createdAt: "now" }],
    diagrams: { function: { id: "function", kind: "function", title: "Keep", status: "completed", svg: "<svg>keep</svg>" }, class: { id: "class", kind: "class", title: "Unfinished", status: "running", phase: "generating" } } };
  authStore.saveProjectWorkspace({ projectId: project.id, baseVersion: workspace.version, updatedByUserId: owner.id, state: { standardProject: state } });
  let calls = 0;
  registerStandardProjectRoutes({ app, authStore, providerConfigs: createProviderConfigStore({ secret: "test" }), llmScheduler: createInMemoryLlmScheduler(),
    llmTransport: { async *streamChatCompletion() { calls++; yield "unused"; } }, renderClient: async () => { throw new Error("unused"); }, pngRenderClient: async () => { throw new Error("unused"); } });
  t.after(() => app.close());
  const url = `/api/projects/${project.id}/standard`;
  const result = (await app.inject({ url, headers: { cookie } })).json().state;
  assert.equal(result.run.status, "stopped"); assert.equal(result.run.interruptionReason, "server_restart");
  assert.deepEqual(result.run.work.ids, ["class"]); assert.equal(result.run.id, "previous-process-run");
  assert.equal(result.diagrams.function.svg, "<svg>keep</svg>"); assert.equal(result.diagrams.class.status, "failed"); assert.equal(result.diagrams.class.phase, undefined);
  assert.equal(result.conversation[0].status, "failed"); assert.equal(result.description, "Saved requirements");
  assert.equal((await app.inject({ url, headers: { cookie } })).json().state.run.finishedAt, result.run.finishedAt);
  assert.equal(calls, 0, "recovery reads must not generate or restart anything");
});
