// Tests catalog identity, stale fallback, durable supplements and the effective Pi budget.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelCatalog, matchCatalog, parseCatalog } from "./model-catalog.js";
import { standardPiModel } from "../adapters/llm/pi-provider.js";
import type { ProviderSettings } from "@uml-platform/contracts";
const data = {
  providers: [{ id: "origin", api_url: "https://origin.example/v1" }, { id: "relay", api_url: "https://relay.example/v1" }],
  models: [
    { provider: "origin", id: "flash-v1", name: "Flash", created_by: "origin", context_window: 1000000, max_output_tokens: 32000 },
    { provider: "relay", id: "flash-v1", name: "Flash Relay", created_by: "origin", context_window: 64000, max_output_tokens: 8000 },
  ],
};

test("prefers endpoint limits then canonical publisher records, without fuzzy matching", () => {
  const rows = parseCatalog(data);
  assert.equal(matchCatalog(rows, "flash-v1", "https://relay.example/v1")?.context, 64000);
  assert.equal(matchCatalog(rows, "flash-v1", "https://custom.example/v1")?.context, 1000000);
  assert.equal(matchCatalog(rows, "origin/flash-v1", "https://custom.example/v1")?.context, 1000000);
  assert.equal(matchCatalog(rows, "flash-v2", "https://custom.example/v1"), undefined);
  const ambiguous = [...rows, { provider: "other", api: "", id: "flash-v1", canonical: "other/model", context: 32000, output: 4000 }];
  assert.equal(matchCatalog(ambiguous, "flash-v1", "https://custom.example/v1"), undefined);
});
test("deduplicates sync, persists supplements and retains cached limits when offline", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uml-catalog-"));
  try {
    let calls = 0; let fail = false;
    const file = join(dir, "cache.json");
    const catalog = new ModelCatalog(file, async () => { calls++; if (fail) throw new Error("offline"); return data; });
    await catalog.load();
    await Promise.all([catalog.refresh(), catalog.refresh()]); assert.equal(calls, 1);
    await assert.rejects(catalog.supplement("p", "flash-v1", "https://custom.example", { context: 24000, output: 4000 }));
    await catalog.supplement("p", "unknown", "https://custom.example", { context: 24000, output: 4000 });
    assert.equal(catalog.resolve("other", "unknown", "https://custom.example").source, "unknown");
    assert.equal(catalog.resolve("p", "unknown", "https://changed.example").source, "unknown");
    fail = true; await catalog.refresh(); assert.ok(catalog.status().error);
    assert.equal(catalog.resolve("p", "flash-v1", "https://custom.example").context, 1000000);
    const restored = new ModelCatalog(file); await restored.load();
    assert.equal(restored.resolve("p", "unknown", "https://custom.example").context, 24000);
    assert.equal(restored.resolve("p", "flash-v1", "https://custom.example").context, 1000000);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("Pi uses catalog capacity automatically and operator limits only reduce it", () => {
  const old = process.env.UML_STANDARD_CONTEXT_TOKENS;
  const settings = { model: "flash-v1", apiBaseUrl: "https://api.deepseek.com/v1" } as ProviderSettings;
  const capacity = { context: 1000000, output: 32000, source: "modelpedia" as const, matchedId: "origin/flash", updatedAt: null };
  try {
    delete process.env.UML_STANDARD_CONTEXT_TOKENS;
    assert.equal(standardPiModel(settings, capacity).contextWindow, 1000000);
    process.env.UML_STANDARD_CONTEXT_TOKENS = "96000";
    assert.equal(standardPiModel(settings, capacity).contextWindow, 96000);
    process.env.UML_STANDARD_CONTEXT_TOKENS = "2000000";
    assert.equal(standardPiModel(settings, capacity).contextWindow, 1000000);
  } finally { if (old === undefined) delete process.env.UML_STANDARD_CONTEXT_TOKENS; else process.env.UML_STANDARD_CONTEXT_TOKENS = old; }
});

test("retains unknown capabilities and rejects old cache versions and malformed replacements", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uml-modelpedia-"));
  try {
    const file = join(dir, "cache.json");
    await writeFile(file, JSON.stringify({ version: 2, syncedAt: new Date().toISOString(), rows: parseCatalog(data) }));
    const catalog = new ModelCatalog(file, async () => data); await catalog.load();
    assert.equal(catalog.status().syncedAt, null);
    await catalog.refresh();
    const result = catalog.resolve("p", "flash-v1", "https://origin.example/v1");
    assert.equal(result.source, "modelpedia"); assert.equal(result.name, "Flash");
    assert.equal(result.capabilities?.vision, null);
    const rows = parseCatalog({ providers: data.providers, models: [{ provider: "origin", id: "metadata-only", capabilities: { vision: true } }] });
    assert.equal(rows[0].context, null);
    assert.throws(() => parseCatalog({ ...data, models: [...data.models, { id: "invalid", provider: "missing" }] }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Modelpedia reasoning capability, vision and output limits survive publisher and relay resolution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uml-modelpedia-capabilities-"));
  try {
    const catalog = new ModelCatalog(join(dir, "catalog.json"), async () => ({ providers: data.providers, models: [
      { ...data.models[0], capabilities: { reasoning: true, vision: false, tool_call: true } },
      { ...data.models[1], capabilities: { reasoning: true, vision: false, tool_call: true } },
    ] }));
    await catalog.load(); await catalog.refresh();
    const relay = catalog.resolve("p", "flash-v1", "https://relay.example/v1");
    assert.equal(relay.context, 64000); assert.equal(relay.output, 8000); assert.equal(relay.capabilities?.reasoning, true);
    const publisher = catalog.resolve("p", "origin/flash-v1", "https://unlisted.example/v1");
    assert.equal(publisher.context, 1000000); assert.equal(publisher.output, 32000); assert.equal(publisher.capabilities?.reasoning, true);
    assert.equal(publisher.capabilities?.vision, false); assert.equal(publisher.capabilities?.toolCall, true);
    const unknown = catalog.resolve("p", "flash-v2", "https://relay.example/v1");
    assert.equal(unknown.context, null); assert.equal(unknown.capabilities?.reasoning, null);
    const pi = standardPiModel({ model: "flash-v1", apiBaseUrl: "https://relay.example/v1" } as ProviderSettings, relay);
    assert.equal(pi.reasoning, true); assert.equal(pi.contextWindow, 64000); assert.equal(pi.maxTokens, 8000);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("missing reseller metadata does not veto confirmed canonical capabilities, but explicit conflicts remain unknown", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uml-modelpedia-consensus-"));
  try {
    let conflict = false;
    const catalog = new ModelCatalog(join(dir, "catalog.json"), async () => ({ providers: data.providers, models: [
      { provider: "origin", id: "origin/flash-v1", created_by: "origin", context_window: 1000000, max_output_tokens: 32000, capabilities: { reasoning: true, tool_call: true } },
      { provider: "relay", id: "flash-v1", created_by: "origin", ...(conflict ? { capabilities: { reasoning: false } } : {}) },
    ] }));
    await catalog.load(); await catalog.refresh();
    assert.equal(catalog.resolve("p", "flash-v1", "https://unlisted.example").capabilities?.reasoning, true);
    // The selected endpoint's own absent field stays unknown; another endpoint's capability cannot override it.
    assert.equal(catalog.resolve("p", "flash-v1", "https://relay.example").capabilities?.reasoning, null);
    conflict = true; await catalog.refresh();
    assert.equal(catalog.resolve("p", "flash-v1", "https://unlisted.example").capabilities?.reasoning, null);
    assert.equal(catalog.resolve("p", "flash-v1", "https://relay.example").capabilities?.reasoning, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("empty short IDs cannot mask the DeepSeek canonical model's published capacity", () => {
  const model = "deepseek-v4.1-flash";
  const rows = parseCatalog({ providers: ["baseten", "novita", "openrouter", "vercel", "opencode"].map(id => ({ id, api_url: `https://${id}.example/v1` })), models: [
    { provider: "baseten", id: model, created_by: "deepseek" },
    { provider: "opencode", id: model, created_by: "unknown" },
    { provider: "novita", id: `deepseek/${model}`, created_by: "deepseek", context_window: 1048576, max_output_tokens: 393216 },
    { provider: "openrouter", id: `deepseek/${model}`, created_by: "deepseek", context_window: 1048576, max_output_tokens: 943718 },
    { provider: "vercel", id: `deepseek/${model}`, created_by: "deepseek", context_window: 1000000 },
  ] });
  for (const id of [model, `deepseek/${model}`]) {
    const result = matchCatalog(rows, id, "https://unlisted.example/v1");
    assert.equal(result?.context, 1000000); assert.equal(result?.output, 393216);
    assert.equal(result?.matchedId, `deepseek/${model}`);
  }
  assert.equal(matchCatalog(rows, model, "https://openrouter.example/v1")?.output, 943718);
  assert.equal(matchCatalog(rows, model, "https://novita.example/v1")?.context, 1048576);
  assert.equal(matchCatalog(rows, model, "https://baseten.example/v1")?.context, 1000000, "an empty local field may use canonical metadata");
  assert.equal(matchCatalog(rows, `${model}-fast`, "https://unlisted.example/v1"), undefined, "distinct versions must not be guessed");
  const limited = rows.map(row => row.provider === "baseten" ? { ...row, context: 32000, output: 4000 } : row);
  assert.equal(matchCatalog(limited, model, "https://baseten.example/v1")?.context, 32000, "explicit endpoint limits still win");
});

test("context is independent of missing or differing output limits and unidentified models keep real conflicts unknown", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uml-modelpedia-fields-"));
  try {
    const catalog = new ModelCatalog(join(dir, "catalog.json"), async () => ({ providers: data.providers, models: [
      { provider: "relay", id: "flash-v1", created_by: "origin" },
      { provider: "origin", id: "origin/flash-v1", created_by: "origin", context_window: 1000000 },
    ] }));
    await catalog.load(); await catalog.refresh();
    const capacity = catalog.resolve("p", "flash-v1", "https://unlisted.example");
    assert.equal(capacity.context, 1000000); assert.equal(capacity.output, null); assert.equal(capacity.source, "modelpedia");
    const pi = standardPiModel({ model: "flash-v1", apiBaseUrl: "https://unlisted.example" } as ProviderSettings, capacity);
    assert.equal(pi.contextWindow, 1000000, "missing output capacity must not force the 48k context fallback");
    const rows = parseCatalog({ providers: data.providers, models: [
      { provider: "origin", id: "ambiguous", context_window: 32000, max_output_tokens: 4000 },
      { provider: "relay", id: "ambiguous", context_window: 64000, max_output_tokens: 4000 },
    ] });
    const unknown = matchCatalog(rows, "ambiguous", "https://unlisted.example");
    assert.equal(unknown?.context, null); assert.equal(unknown?.output, 4000);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
