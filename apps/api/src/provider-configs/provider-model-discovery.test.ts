// Verifies incremental discovery never probes saved model IDs, including empty updates.
import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderModelDiscoveryProgressEvent } from "@uml-platform/contracts";
import type { OpenAiCompatibleClientFactory } from "../adapters/llm/llm-transport.js";
import { discoverOpenAiCompatibleModelCapabilities } from "./provider-model-discovery.js";

for (const newIds of [["chat-new"], []]) {
  test(`incremental discovery probes only ${newIds.length} new models`, async () => {
    const probed: string[] = [];
    const events: ProviderModelDiscoveryProgressEvent[] = [];
    const clientFactory: OpenAiCompatibleClientFactory = () => ({
      models: { list: async () => ({ data: ["chat-saved", ...newIds, "image-new"].map(id => ({ id })) }) },
      chat: { completions: { create: async body => {
        probed.push(body.model);
        return (async function* () {
          yield { choices: [{ delta: { content: '{"probe":"strict-json-ok","n":1}' } }] };
        })() as never;
      } } },
    });
    const result = await discoverOpenAiCompatibleModelCapabilities({
      apiBaseUrl: "https://provider.example.test/v1", apiKey: "test-key",
      existingModelIds: ["chat-saved", "chat-absent"], clientFactory,
      resolveHostname: async () => ["93.184.216.34"],
      onProgress: event => events.push(event),
    });
    assert.deepEqual(probed, newIds);
    assert.deepEqual(result.models.map(model => model.id), newIds);
    assert.equal(result.summary?.excludedByNameCount, 1);
    assert.deepEqual(events.find(event => event.type === "name_filtered"), {
      type: "name_filtered", rawCount: 2 + newIds.length, candidateCount: newIds.length, excludedByNameCount: 1,
    });
    assert.ok(events.filter(event => event.type === "probe_started").every(event => event.modelId === "chat-new"));
  });
}
