// Verifies personal model metadata permissions, durable writes, reference resets and generation-facing values.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { createProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import { ModelCatalog } from "../../provider-configs/model-catalog.js";
import { registerProjectModelContextRoutes } from "../projects/register-project-model-context-routes.js";
import { registerProviderModelCapacityRoutes } from "./register-provider-model-capacity-routes.js";

async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "uml-personal-models-"));
  const app = Fastify();
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const authStore = createInMemoryAuthStore();
  const owner = authStore.createUser({ username: "model_owner", displayName: "Owner", passwordHash: "test" })!;
  const other = authStore.createUser({ username: "model_other", displayName: "Other", passwordHash: "test" })!;
  const headers = (userId: string) => ({ cookie: `uml_session=${authStore.createSession({ userId, ipAddress: "127.0.0.1", userAgent: "test" }).id}` });
  const providerConfigs = createProviderConfigStore();
  const input = { name: "Personal provider", baseUrl: "https://provider.example.test/v1", apiKey: "private-test-key", defaultModel: "known", allowedModels: ["known", "unknown"], createdBy: owner.id };
  const personal = providerConfigs.create({ ...input, scopeType: "user", scopeId: owner.id });
  const system = providerConfigs.create({ ...input, scopeType: "system" });
  const project = authStore.createProject({ ownerUserId: owner.id, name: "Models", description: null }).project;
  const scoped = providerConfigs.create({ ...input, scopeType: "project", scopeId: project.id });
  const file = join(directory, "catalog.json");
  const catalog = new ModelCatalog(file, async () => ({ provider: { id: "provider", api: input.baseUrl, models: {
    known: { id: "known", limit: { context: 128000, output: 8192 }, reasoning: true, modalities: { input: ["text", "image"] } },
  } } }));
  await catalog.load(); await catalog.refresh();
  registerProviderModelCapacityRoutes({ app, authStore, providerConfigs, catalog });
  registerProjectModelContextRoutes({ app, authStore, providerConfigs, modelCatalog: catalog });
  return { app, providerConfigs, personal, system, scoped, catalog, file, project,
    ownerHeaders: headers(owner.id), otherHeaders: headers(other.id), owner };
}

test("only owners may read or update configured personal models without using credentials", async t => {
  const { app, providerConfigs, personal, system, scoped, ownerHeaders, otherHeaders, catalog } = await setup(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("metadata must not probe providers"); });
  for (const method of ["GET", "PUT"] as const) {
    const payload = method === "PUT" ? { modelId: "known", capacity: { context: 64000 } } : undefined;
    const url = `/api/provider-configs/${personal.id}/capacities`;
    assert.equal((await app.inject({ method, url, payload })).statusCode, 401);
    assert.equal((await app.inject({ method, url, payload, headers: otherHeaders })).statusCode, 404);
    for (const provider of [system, scoped]) {
      assert.equal((await app.inject({ method, url: url.replace(personal.id, provider.id), payload, headers: ownerHeaders })).statusCode, 404);
    }
  }
  const url = `/api/provider-configs/${personal.id}/capacities`;
  const response = await app.inject({ url, headers: ownerHeaders });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().models.map((model: { modelId: string }) => model.modelId), ["known", "unknown"]);
  assert.doesNotMatch(response.body, /private-test-key|apiKey/);
  const before = structuredClone(personal.modelCapabilities);
  const saved = await app.inject({ method: "PUT", url, headers: ownerHeaders,
    payload: { modelId: "known", capacity: { context: 64000, output: 4096, capabilities: { reasoning: false, vision: false } } } });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().source, "user");
  assert.deepEqual(saved.json().overrides, { context: 64000, output: 4096, capabilities: { reasoning: false, vision: false } });
  assert.equal(catalog.resolve(system.id, "known", system.baseUrl).context, 128000);
  assert.deepEqual(providerConfigs.get(personal.id)?.modelCapabilities, before);
  assert.ok(providerConfigs.listAuditLogs().some(entry => entry.action === "user.provider_config.capacity_update"));
  providerConfigs.disable(personal.id, "test");
  assert.equal((await app.inject({ method: "PUT", url, headers: ownerHeaders, payload: { modelId: "known", capacity: { context: 64000 } } })).statusCode, 404);
  assert.equal(fetch.mock.callCount(), 0);
});

test("validates effective limits, supports capabilities-only edits and restores references", async t => {
  const { app, personal, ownerHeaders: headers, catalog, file, project } = await setup(t);
  const url = `/api/provider-configs/${personal.id}/capacities`;
  for (const payload of [
    { modelId: "not-configured", capacity: { context: 64000 } },
    { modelId: "known", capacity: {} }, { modelId: "known", capacity: { context: 64000.5 } },
    { modelId: "known", capacity: { output: 128001 } }, { modelId: "known", capacity: { context: 100 } },
    { modelId: "known", capacity: { capabilities: { reasoning: "true" } } },
  ]) assert.equal((await app.inject({ method: "PUT", url, headers, payload })).statusCode, payload.capacity.output === 128001 ? 409 : 400);
  const edited = await app.inject({ method: "PUT", url, headers, payload: {
    modelId: "unknown", capacity: { capabilities: { reasoning: true, vision: false } },
  } });
  assert.equal(edited.statusCode, 200); assert.equal(edited.json().context, null); assert.equal(edited.json().capabilities.vision, false);
  await app.inject({ method: "PUT", url, headers, payload: { modelId: "known", capacity: { context: 64000, output: 4096, capabilities: { reasoning: false, vision: true } } } });
  const restarted = new ModelCatalog(file); await restarted.load();
  assert.equal(restarted.resolve(personal.id, "known", personal.baseUrl).context, 64000);
  assert.equal(restarted.resolve(personal.id, "known", personal.baseUrl).source, "user");
  await catalog.refresh();
  const context = await app.inject({ url: `/api/projects/${project.id}/model-context?${new URLSearchParams({ providerConfigId: personal.id, model: "known" })}`, headers });
  assert.equal(context.statusCode, 200); assert.equal(context.json().contextBudget, 64000);
  assert.equal(context.json().capacity.output, 4096); assert.equal(context.json().capacity.capabilities.reasoning, false);
  const reset = await app.inject({ method: "PUT", url, headers, payload: { modelId: "known", capacity: { context: null, output: null, capabilities: { reasoning: null, vision: null } } } });
  assert.equal(reset.statusCode, 200); assert.deepEqual(reset.json().overrides, {});
  assert.equal(reset.json().source, "models.dev"); assert.equal(reset.json().context, 128000);
});
