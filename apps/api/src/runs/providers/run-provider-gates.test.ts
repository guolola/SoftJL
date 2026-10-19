// Verifies run admission requires saved provider capability metadata before accessing credentials or starting calls.
import assert from "node:assert/strict";
import test from "node:test";
import { createProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import { resolveProviderSettingsForRun } from "./run-provider-gates.js";

function setup() {
  const providerConfigs = createProviderConfigStore({ secret: "test" });
  const config = providerConfigs.create({ name: "Manual model", baseUrl: "https://api.example.test", apiKey: "test",
    defaultModel: "manual-model", allowedModels: ["manual-model"], createdBy: "test" });
  return { providerConfigs, config, metadata: { projectId: "project", userId: "user", createdAt: "2026-10-18T00:00:00Z" },
    providerSettings: { providerConfigId: config.id, model: "manual-model" } };
}

test("runs reject a saved model without capabilities before reading its secret", async () => {
  const input = setup(); let secretReads = 0;
  input.providerConfigs.get = () => ({ ...input.config, modelCapabilities: {} });
  input.providerConfigs.getSecret = () => { secretReads++; return "test"; };
  const resolution = await resolveProviderSettingsForRun(input);
  assert.deepEqual(resolution, { ok: false, statusCode: 400,
    error: { code: "PROVIDER_MODEL_CAPABILITY_MISSING", category: "validation", retryable: false } });
  assert.equal(secretReads, 0);
});

test("new manual models persist an explicit unverified compatible capability and remain usable", async () => {
  const input = setup();
  assert.equal(input.config.modelCapabilities["manual-model"]?.structuredOutputMode, "compatible");
  assert.equal(input.config.modelCapabilities["manual-model"]?.probeStatus, "unknown");
  const resolution = await resolveProviderSettingsForRun(input);
  assert.equal(resolution.ok, true);
  if (resolution.ok) assert.deepEqual(resolution.providerSettings.modelCapability, input.config.modelCapabilities["manual-model"]);
});
