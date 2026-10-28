// Tests catalog identity, stale fallback, durable supplements and the effective Pi budget.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CATALOG_INTERVAL, ModelCatalog, matchCatalog, parseCatalog } from "./model-catalog.js";
import { standardPiModel } from "../adapters/llm/pi-provider.js";
import type { ProviderSettings } from "@uml-platform/contracts";
const data = {
  origin: { id: "origin", api: "https://origin.example/v1", models: {
    "flash-v1": { id: "flash-v1", name: "Flash", canonical_model_id: "origin/flash-v1", limit: { context: 1000000, output: 32000 } },
  } },
  relay: { id: "relay", api: "https://relay.example/v1", models: {
    "flash-v1": { id: "flash-v1", name: "Flash Relay", canonical_model_id: "origin/flash-v1", limit: { context: 64000, output: 8000 } },
  } },
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
    await catalog.supplement("p", "flash-v1", "https://custom.example", { context: 24000, output: 4000 });
    await catalog.supplement("p", "unknown", "https://custom.example", { context: 24000, output: 4000 });
    assert.equal(catalog.resolve("other", "unknown", "https://custom.example").source, "unknown");
    assert.equal(catalog.resolve("p", "unknown", "https://changed.example").source, "unknown");
    fail = true; await catalog.refresh(); assert.ok(catalog.status().error);
    assert.equal(catalog.resolve("p", "flash-v1", "https://custom.example").context, 24000);
    const restored = new ModelCatalog(file); await restored.load();
    assert.equal(restored.resolve("p", "unknown", "https://custom.example").context, 24000);
    assert.equal(restored.resolve("p", "flash-v1", "https://custom.example").context, 24000);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("administrator fields override complete references, survive synchronization and can be cleared independently", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uml-model-overrides-"));
  try {
    const file = join(dir, "catalog.json");
    const download = async () => ({ origin: { ...data.origin, models: {
      "flash-v1": { ...data.origin.models["flash-v1"], reasoning: true, modalities: { input: ["text", "image"] } },
    } } });
    const catalog = new ModelCatalog(file, download); await catalog.refresh();
    const base = data.origin.api;
    await catalog.supplement("p", "flash-v1", base, { context: 64000, output: 8000, capabilities: { reasoning: false, vision: false } });
    const effective = catalog.resolve("p", "flash-v1", base);
    assert.equal(effective.source, "admin"); assert.equal(effective.context, 64000);
    assert.equal(effective.capabilities?.reasoning, false); assert.equal(effective.capabilities?.vision, false);
    assert.equal(catalog.describe("p", "flash-v1", base).reference.context, 1000000);
    assert.equal(catalog.describe("p", "flash-v1", base).reference.capabilities?.vision, true);
    await catalog.refresh(); assert.deepEqual(catalog.resolve("p", "flash-v1", base), effective);
    const restarted = new ModelCatalog(file); await restarted.load();
    assert.equal(restarted.resolve("p", "flash-v1", base).capabilities?.reasoning, false);
    assert.equal(restarted.resolve("other", "flash-v1", base).context, 1000000);
    assert.equal(restarted.resolve("p", "flash-v1", "https://changed.example").source, "models.dev");
    await catalog.supplement("p", "flash-v1", base, { capabilities: { reasoning: null } });
    assert.equal(catalog.resolve("p", "flash-v1", base).capabilities?.reasoning, true);
    assert.equal(catalog.resolve("p", "flash-v1", base).capabilities?.vision, false);
    await catalog.supplement("p", "flash-v1", base, { context: null, output: null, capabilities: { vision: null } });
    assert.equal(catalog.resolve("p", "flash-v1", base).source, "models.dev");
    assert.deepEqual(catalog.describe("p", "flash-v1", base).overrides, {});
    await catalog.supplement("p", "unknown", base, { capabilities: { reasoning: true, vision: true } });
    const unknown = catalog.resolve("p", "unknown", base);
    assert.equal(unknown.matchedId, null);
    assert.equal(unknown.context, null); assert.equal(unknown.capabilities?.reasoning, true);
    assert.equal(unknown.capabilities?.vision, true);
    await assert.rejects(catalog.supplement("p", "flash-v1", base, { context: 1024 }), /输出容量/);
    assert.equal(catalog.resolve("p", "flash-v1", base).context, 1000000);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("personal overrides are isolated from administrator records and clear back to inherited settings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uml-personal-overrides-"));
  try {
    const catalog = new ModelCatalog(join(dir, "catalog.json"), async () => data);
    await catalog.load(); await catalog.refresh();
    const base = data.origin.api;
    await catalog.supplement("p", "flash-v1", base, { context: 128000, output: 8192, capabilities: { vision: true } });
    await catalog.supplement("p", "flash-v1", base, { context: 64000, output: 4096, capabilities: { vision: false } }, "user");
    const personal = catalog.describe("p", "flash-v1", base, "user");
    assert.equal(personal.source, "user"); assert.equal(personal.capabilities?.vision, false);
    assert.equal(personal.reference.source, "admin"); assert.equal(personal.reference.context, 128000);
    assert.equal(catalog.describe("p", "flash-v1", base).overrides.context, 128000);
    const restarted = new ModelCatalog(join(dir, "catalog.json")); await restarted.load();
    assert.deepEqual(restarted.resolve("p", "flash-v1", base), catalog.resolve("p", "flash-v1", base));
    assert.equal(catalog.resolve("p", "flash-v1", "https://other.example").source, "models.dev");
    await catalog.supplement("p", "flash-v1", base, { context: null, output: null, capabilities: { vision: null } }, "user");
    assert.equal(catalog.resolve("p", "flash-v1", base).source, "admin");
    assert.equal(catalog.resolve("p", "flash-v1", base).context, 128000);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Pi uses catalog capacity automatically and operator limits only reduce it", () => {
  const old = process.env.UML_STANDARD_CONTEXT_TOKENS;
  const settings = { model: "flash-v1", apiBaseUrl: "https://api.deepseek.com/v1" } as ProviderSettings;
  const capacity = { context: 1000000, output: 32000, source: "models.dev" as const, matchedId: "origin/flash", updatedAt: null };
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
  const dir = await mkdtemp(join(tmpdir(), "uml-models.dev-"));
  try {
    const file = join(dir, "cache.json");
    await writeFile(file, JSON.stringify({ version: 3, source: "modelpedia", syncedAt: new Date().toISOString(), rows: parseCatalog(data) }));
    const catalog = new ModelCatalog(file, async () => data); await catalog.load();
    assert.equal(catalog.status().syncedAt, null);
    await catalog.refresh();
    const result = catalog.resolve("p", "flash-v1", "https://origin.example/v1");
    assert.equal(result.source, "models.dev"); assert.equal(result.name, "Flash");
    assert.equal(result.capabilities?.vision, null);
    const rows = parseCatalog({ origin: { id: "origin", models: { "metadata-only": { id: "metadata-only", modalities: { input: ["text", "image"] } } } } });
    assert.equal(rows[0].context, null);
    assert.throws(() => parseCatalog({ ...data, invalid: { id: "invalid", models: { invalid: { id: "different" } } } }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Models.dev reasoning capability, vision and output limits survive publisher and relay resolution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uml-models.dev-capabilities-"));
  try {
    const catalog = new ModelCatalog(join(dir, "catalog.json"), async () => Object.fromEntries(
      Object.entries(data).map(([id, provider]) => [id, { ...provider, models: {
        "flash-v1": { ...provider.models["flash-v1"], reasoning: true, tool_call: true, modalities: { input: ["text"] } },
      } }]),
    ));
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
  const dir = await mkdtemp(join(tmpdir(), "uml-models.dev-consensus-"));
  try {
    let conflict = false;
    const catalog = new ModelCatalog(join(dir, "catalog.json"), async () => ({
      origin: { ...data.origin, models: { "origin/flash-v1": { id: "origin/flash-v1", canonical_model_id: "origin/flash-v1", limit: { context: 1000000, output: 32000 }, reasoning: true, tool_call: true } } },
      relay: { ...data.relay, models: { "flash-v1": { id: "flash-v1", canonical_model_id: "origin/flash-v1", ...(conflict ? { reasoning: false } : {}) } } },
    }));
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
  const models = [
    ["baseten", { id: model, canonical_model_id: `deepseek/${model}` }],
    ["opencode", { id: model }],
    ["novita", { id: `deepseek/${model}`, canonical_model_id: `deepseek/${model}`, limit: { context: 1048576, output: 393216 } }],
    ["openrouter", { id: `deepseek/${model}`, canonical_model_id: `deepseek/${model}`, limit: { context: 1048576, output: 943718 } }],
    ["vercel", { id: `deepseek/${model}`, canonical_model_id: `deepseek/${model}`, limit: { context: 1000000 } }],
  ] as const;
  const rows = parseCatalog(Object.fromEntries(models.map(([id, entry]) => [id, { id, api: `https://${id}.example/v1`, models: { [entry.id]: entry } }])));
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
  const dir = await mkdtemp(join(tmpdir(), "uml-models.dev-fields-"));
  try {
    const catalog = new ModelCatalog(join(dir, "catalog.json"), async () => ({
      relay: { ...data.relay, models: { "flash-v1": { id: "flash-v1", canonical_model_id: "origin/flash-v1" } } },
      origin: { ...data.origin, models: { "origin/flash-v1": { id: "origin/flash-v1", canonical_model_id: "origin/flash-v1", limit: { context: 1000000 } } } },
    }));
    await catalog.load(); await catalog.refresh();
    const capacity = catalog.resolve("p", "flash-v1", "https://unlisted.example");
    assert.equal(capacity.context, 1000000); assert.equal(capacity.output, null); assert.equal(capacity.source, "models.dev");
    const pi = standardPiModel({ model: "flash-v1", apiBaseUrl: "https://unlisted.example" } as ProviderSettings, capacity);
    assert.equal(pi.contextWindow, 1000000, "missing output capacity must not force the 48k context fallback");
    const rows = parseCatalog({
      origin: { ...data.origin, models: { ambiguous: { id: "ambiguous", limit: { context: 32000, output: 4000 } } } },
      relay: { ...data.relay, models: { ambiguous: { id: "ambiguous", limit: { context: 64000, output: 4000 } } } },
    });
    const unknown = matchCatalog(rows, "ambiguous", "https://unlisted.example");
    assert.equal(unknown?.context, null); assert.equal(unknown?.output, 4000);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("maps Models.dev lifecycle, modalities and zero limits without guessing missing metadata", () => {
  const rows = parseCatalog({ origin: { id: "origin", api: "https://{endpoint}/v1", models: {
    alpha: { id: "alpha", status: "alpha", reasoning: false, tool_call: true, modalities: { input: ["text", "image"] }, limit: { context: 0, output: 0 } },
    beta: { id: "beta", status: "beta" },
    retired: { id: "retired", status: "deprecated" },
    current: { id: "current" },
  } } });
  assert.deepEqual(rows.map(row => row.status), ["preview", "preview", "deprecated", "active"]);
  assert.equal(rows[0].context, null); assert.equal(rows[0].output, null);
  assert.equal(rows[0].reasoning, false); assert.equal(rows[0].toolCall, true);
  assert.deepEqual(rows[0].input, ["text", "image"]);
  assert.equal(rows[3].canonical, undefined); assert.equal(rows[3].reasoning, undefined);
  assert.equal(rows[3].input, undefined);
  assert.equal(rows[3].api, "https://{endpoint}/v1", "provider URL templates must not reject the entire public catalog");
});

test("does not publish new capacities when atomic cache persistence fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uml-catalog-write-"));
  try {
    const file = join(dir, "catalog.json");
    let download: unknown = data;
    const catalog = new ModelCatalog(file, async () => download);
    await catalog.refresh();
    const saved = await readFile(file, "utf8");
    download = { origin: { ...data.origin, models: {
      "flash-v1": { ...data.origin.models["flash-v1"], limit: { context: 2000000, output: 64000 } },
    } } };
    // Occupying the temporary file path makes persistence fail without damaging the last snapshot.
    await mkdir(`${file}.tmp`);
    await catalog.refresh();
    assert.ok(catalog.status().error);
    assert.equal(await readFile(file, "utf8"), saved);
    assert.equal(catalog.resolve("p", "flash-v1", data.origin.api).context, 1000000);
    await rm(`${file}.tmp`, { recursive: true });
    await catalog.refresh();
    assert.equal(catalog.status().error, null);
    assert.equal(catalog.resolve("p", "flash-v1", data.origin.api).context, 2000000);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("rejects empty, obsolete, mismatched and oversized catalogs", () => {
  for (const invalid of [{}, [], { origin: { id: "origin", models: {} } },
    { providers: [], models: [] },
    { origin: { ...data.origin, id: "different" } },
    { origin: { ...data.origin, models: { flash: { id: "flash", limit: { context: -1 } } } } },
  ]) assert.throws(() => parseCatalog(invalid));
  const models = Object.fromEntries(Array.from({ length: 30001 }, (_, index) => [`m${index}`, { id: `m${index}` }]));
  assert.throws(() => parseCatalog({ origin: { id: "origin", models } }), /数量限制/);
});

test("keeps the last durable snapshot through invalid refreshes and recovers after six hours", async context => {
  const dir = await mkdtemp(join(tmpdir(), "uml-catalog-recovery-"));
  try {
    context.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-26T00:00:00Z") });
    const file = join(dir, "catalog.json");
    let download: unknown = data;
    const catalog = new ModelCatalog(file, async () => download);
    await catalog.refresh();
    const saved = await readFile(file, "utf8");
    assert.equal(JSON.parse(saved).version, 4); assert.equal(JSON.parse(saved).source, "models.dev");
    assert.equal(CATALOG_INTERVAL, 6 * 60 * 60 * 1000);
    context.mock.timers.tick(CATALOG_INTERVAL - 1);
    assert.equal(catalog.status().stale, false);
    context.mock.timers.tick(1);
    assert.equal(catalog.status().stale, true);
    download = { ...data, broken: { id: "broken", models: { invalid: { id: "different" } } } };
    await catalog.refresh();
    assert.ok(catalog.status().error);
    assert.equal(await readFile(file, "utf8"), saved);
    assert.equal(catalog.resolve("p", "flash-v1", data.origin.api).context, 1000000);
    download = data;
    await catalog.refresh();
    assert.equal(catalog.status().error, null);
    assert.equal(catalog.status().stale, false);
    const restarted = new ModelCatalog(file, async () => { throw new Error("offline"); });
    await restarted.load(); await restarted.refresh();
    assert.equal(restarted.resolve("p", "flash-v1", data.origin.api).source, "models.dev");
    assert.equal(restarted.resolve("p", "flash-v1", data.origin.api).context, 1000000);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
