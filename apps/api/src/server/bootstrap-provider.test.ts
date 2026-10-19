// Exercises demo bootstrap idempotence, secret preservation and production isolation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createProviderConfigStore } from "../provider-configs/provider-config-store.js";
import { seedDemoProvider } from "./bootstrap-provider.js";

test("demo bootstrap creates once and preserves the original secret on repeated startup", async () => {
  const store = createProviderConfigStore();
  const env = { UML_DEMO_PROVIDER_SEED: "true", UML_DEMO_PROVIDER_NAME: "Demo Provider", UML_DEMO_PROVIDER_BASE_URL: "https://provider.example.com/v1", UML_DEMO_PROVIDER_API_KEY: "test-key-original" };
  await seedDemoProvider(store, "development", env);
  await seedDemoProvider(store, "development", { ...env, UML_DEMO_PROVIDER_API_KEY: "replacement-must-not-be-used" });
  assert.equal(store.list().length, 1);
  const provider = store.list()[0]!;
  assert.equal(provider.defaultModel, "deepseek-v4.1-flash");
  assert.equal(store.getSecret(provider.id), "test-key-original");
});

test("an explicitly named existing provider gains the requested default model without losing models", async () => {
  const store = createProviderConfigStore();
  const provider = store.create({ name: "Existing", baseUrl: "https://provider.example.com/v1", apiKey: "test-secret", defaultModel: "old", allowedModels: ["old"], createdBy: "test" });
  await seedDemoProvider(store, "development", { UML_DEMO_PROVIDER_SEED: "true", UML_DEMO_PROVIDER_NAME: "Existing" });
  assert.deepEqual(store.get(provider.id)!.allowedModels, ["old", "deepseek-v4.1-flash"]);
  assert.equal(store.getSecret(provider.id), "test-secret");
  store.revoke(provider.id, "test");
  assert.match((await seedDemoProvider(store, "development", { UML_DEMO_PROVIDER_SEED: "true", UML_DEMO_PROVIDER_NAME: "Existing" }))!, /撤销/);
  assert.equal(store.get(provider.id)!.status, "revoked");
});

test("production, ordinary startup and incomplete configuration never seed a fake provider", async () => {
  const store = createProviderConfigStore();
  const env = { UML_DEMO_PROVIDER_SEED: "true", UML_DEMO_PROVIDER_NAME: "Demo", UML_DEMO_PROVIDER_BASE_URL: "https://provider.example.com/v1", UML_DEMO_PROVIDER_API_KEY: "test" };
  assert.equal(await seedDemoProvider(store, "production", env), null);
  assert.equal(await seedDemoProvider(store, "development", {}), null);
  assert.match((await seedDemoProvider(store, "development", { UML_DEMO_PROVIDER_SEED: "true" }))!, /需要/);
  assert.match((await seedDemoProvider(store, "development", { UML_DEMO_PROVIDER_SEED: "true", UML_DEMO_PROVIDER_NAME: "Demo" }))!, /需要/);
  assert.equal(store.list().length, 0);
});

test("the requested Nonelinear provider is the demo default and can be reused by URL", async () => {
  const store = createProviderConfigStore();
  const env = { UML_DEMO_PROVIDER_SEED: "true", UML_DEMO_PROVIDER_API_KEY: "test-local-only" };
  await seedDemoProvider(store, "development", env);
  // The store canonicalizes /v1; the transport adds it back when constructing OpenAI endpoints.
  assert.equal(store.list()[0]!.baseUrl, "https://api.nonelinear.com.cn");
  assert.equal(store.list()[0]!.name, "Nonelinear");
  await seedDemoProvider(store, "development", { ...env, UML_DEMO_PROVIDER_NAME: "Another display name", UML_DEMO_PROVIDER_BASE_URL: "https://api.nonelinear.com.cn/v1" });
  assert.equal(store.list().length, 1);
});
