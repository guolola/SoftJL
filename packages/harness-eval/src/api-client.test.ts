// Exercises the evaluator against real API authentication, project access and run routes without external models.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiServer } from "../../../apps/api/src/index.js";
import { createInMemoryAuthStore } from "../../../apps/api/src/auth/in-memory-auth-store.js";
import { createFileDocumentLibrary } from "../../../apps/api/src/documents/library/document-library.js";
import { createProviderConfigStore } from "../../../apps/api/src/provider-configs/provider-config-store.js";
import { createRunRecordStore } from "../../../apps/api/src/runs/records/run-record-store.js";
import { hashPassword } from "../../../apps/api/src/security/password-hashing.js";
import { createEvaluationApiClient } from "./api-client.js";

test("evaluator logs in, authorizes fixture inputs and polling, and revokes its own session", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "softjl-eval-auth-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const authStore = createInMemoryAuthStore();
  const user = await authStore.createUser({ email: "evaluator@example.test", displayName: "Evaluator", passwordHash: hashPassword("evaluation-password"), emailVerified: true });
  assert.ok(user);
  const { project } = await authStore.createProject({ ownerUserId: user.id, name: "Evaluation", visibility: "private" });
  const providers = createProviderConfigStore({ secret: "isolated-evaluation-secret" });
  const provider = providers.create({ name: "Fixture provider", baseUrl: "https://api.openai.com", apiKey: "fixture-not-a-real-key", defaultModel: "fixture-model", allowedModels: ["fixture-model"], createdBy: user.id, scopeType: "user", scopeId: user.id });
  const records = createRunRecordStore();
  let llmCalls = 0;
  const app = await createApiServer({
    nodeEnv: "test", authStore, providerConfigStore: providers, runRecordStore: records,
    documentLibrary: createFileDocumentLibrary(directory),
    llmTransport: { async *streamChatCompletion() { llmCalls++; yield "{}"; } },
  });
  t.after(() => app.close());
  const calls: Array<{ path: string; headers: Headers; body?: string }> = [];
  const send: typeof fetch = async (input, init = {}) => {
    const path = new URL(String(input)).pathname;
    const headers = new Headers(init.headers);
    calls.push({ path, headers, body: typeof init.body === "string" ? init.body : undefined });
    const result = await app.inject({ method: (init.method ?? "GET") as "GET" | "POST", url: path, headers: Object.fromEntries(headers), payload: init.body as string | undefined });
    const responseHeaders = new Headers();
    for (const [name, value] of Object.entries(result.headers)) {
      if (value !== undefined) for (const item of Array.isArray(value) ? value : [value]) responseHeaders.append(name, String(item));
    }
    return new Response(result.statusCode === 204 ? null : result.body, { status: result.statusCode, headers: responseHeaders });
  };
  const env = { UML_EVAL_PROJECT_ID: project.id, UML_EVAL_PROVIDER_CONFIG_ID: provider.id, UML_EVAL_MODEL: "fixture-model", UML_EVAL_EMAIL: user.email, UML_EVAL_PASSWORD: "evaluation-password", UML_EVAL_TIMEOUT_MS: "10000", UML_EVAL_POLL_MS: "0" };
  const client = await createEvaluationApiClient(env, send);
  const snapshot = await client.run({ requirementText: "用户登录后可以查看订单并提交取消申请。", selectedDiagrams: [] });
  // Invalid model output intentionally terminates the real pipeline; all transport and authorization are real.
  assert.equal(snapshot.status, "failed");
  assert.ok(llmCalls > 0);
  const start = calls.find((call) => call.path === "/api/runs")!;
  assert.equal(JSON.parse(start.body!).projectId, undefined);
  assert.equal(JSON.parse(start.body!).requirementText, "用户登录后可以查看订单并提交取消申请。");
  assert.equal(records.get(snapshot.runId)?.metadata?.projectId, project.id);
  assert.equal(records.get(snapshot.runId)?.metadata?.userId, user.id);
  assert.ok(calls.some((call) => call.path === `/api/runs/${snapshot.runId}`));
  for (const call of calls.filter((call) => call.path.startsWith("/api/runs"))) {
    assert.equal(call.headers.get("x-uml-project-id"), project.id);
    assert.match(call.headers.get("cookie") ?? "", /uml_session=/);
  }
  await client.close();
  const ended = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: start.headers.get("cookie")! } });
  assert.equal(ended.statusCode, 401);

  const session = await authStore.createSession({ userId: user.id, ipAddress: null, userAgent: "eval-test" });
  const before = calls.length;
  const borrowed = await createEvaluationApiClient({ ...env, UML_EVAL_SESSION_COOKIE: `uml_session=${session.id}` }, send);
  await borrowed.close();
  assert.equal(calls.length, before);
  const unauthorized = await createEvaluationApiClient({ ...env, UML_EVAL_SESSION_COOKIE: "uml_session=invalid" }, send);
  await assert.rejects(() => unauthorized.run({ requirementText: "用户查看订单", selectedDiagrams: [] }), /HTTP 401/);
});

test("evaluator explains MFA and does not expose server response secrets", async () => {
  const env = { UML_EVAL_PROJECT_ID: "project", UML_EVAL_PROVIDER_CONFIG_ID: "provider", UML_EVAL_MODEL: "model", UML_EVAL_EMAIL: "eval@example.test", UML_EVAL_PASSWORD: "password" };
  await assert.rejects(() => createEvaluationApiClient(env, async () => new Response("private-challenge", { status: 202 })), /UML_EVAL_SESSION_COOKIE/);
  await assert.rejects(() => createEvaluationApiClient(env, async () => new Response("private-provider-details", { status: 403 })), (error: Error) => error.message.includes("HTTP 403") && !error.message.includes("private"));
});
