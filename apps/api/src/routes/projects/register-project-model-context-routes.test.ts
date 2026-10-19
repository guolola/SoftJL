// Verifies engineering model metadata stays independent of run history and consumption.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { modelContextSettingsSchema } from "@uml-platform/contracts";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { createProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import { ModelCatalog } from "../../provider-configs/model-catalog.js";
import { registerProjectModelContextRoutes } from "./register-project-model-context-routes.js";

test("engineering model context returns only capacity and capabilities after project authorization", async t => {
  const app = Fastify(); t.after(() => app.close());
  const authStore = createInMemoryAuthStore();
  const user = authStore.createUser({ email: "capacity@context.test", displayName: "Owner", passwordHash: "test" })!;
  const cookie = `uml_session=${authStore.createSession({ userId: user.id, ipAddress: "127.0.0.1", userAgent: "test" }).id}`;
  const project = authStore.createProject({ ownerUserId: user.id, name: "Engineering", description: null, visibility: "private", projectMode: "professional" }).project;
  const providerConfigs = createProviderConfigStore({ secret: "test" });
  const provider = providerConfigs.create({ name: "provider", baseUrl: "https://llm.test", apiKey: "test", defaultModel: "model", allowedModels: ["model"], createdBy: "test" });
  const catalog = new ModelCatalog("unused.json");
  const capacity = { context: 1000000, output: 8192, source: "modelpedia" as const, matchedId: "model", updatedAt: null };
  catalog.resolve = () => capacity;
  registerProjectModelContextRoutes({ app, authStore, providerConfigs, modelCatalog: catalog });
  const url = `/api/projects/${project.id}/model-context?${new URLSearchParams({ providerConfigId: provider.id, model: "model" })}`;
  const response = await app.inject({ url, headers: { cookie } });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(modelContextSettingsSchema.parse(response.json()), { model: "model", capacity, contextBudget: 1000000 });
  assert.equal(response.json().tokenUsage, undefined);
  assert.equal((await app.inject({ url })).statusCode, 401);
  assert.equal((await app.inject({ url: url.replace("/model-context?", "/standard/model-context?"), headers: { cookie } })).statusCode, 404);
});
