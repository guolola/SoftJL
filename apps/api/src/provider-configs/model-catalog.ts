// Owns reference matching, durable cache recovery and isolated administrator/personal model overrides.
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { modelCapacityInputSchema, modelCapacityOverrideSchema, type ModelCapacity, type ModelCapacityOverride } from "@uml-platform/contracts";
import { fetchModelsDev } from "../adapters/llm/models-dev.js";

const rowSchema = z.object({ provider: z.string(), api: z.string(), id: z.string(), canonical: z.string().optional(), context: z.number().int().positive().nullable(), output: z.number().int().positive().nullable(),
  name: z.string().optional(), status: z.enum(["active", "deprecated", "preview"]).optional(),
  input: z.array(z.string()).optional(), reasoning: z.boolean().optional(), toolCall: z.boolean().optional() });
type Row = z.infer<typeof rowSchema>;
const snapshotSchema = z.object({ version: z.literal(4), source: z.literal("models.dev"), syncedAt: z.string().datetime(), rows: z.array(rowSchema).min(1) });
const supplementSchema = z.record(z.string(), modelCapacityOverrideSchema.extend({ updatedAt: z.string().datetime() }));
type Supplement = z.infer<typeof supplementSchema>[string];
type OverrideSource = "admin" | "user";

function applyOverride(reference: ModelCapacity, manual: Supplement | undefined, source: OverrideSource): ModelCapacity {
  if (!manual) return reference;
  // Explicit false must override a positive reference capability.
  return { ...reference, context: manual.context ?? reference.context, output: manual.output ?? reference.output,
    capabilities: { vision: reference.capabilities?.vision ?? null, reasoning: reference.capabilities?.reasoning ?? null,
      toolCall: reference.capabilities?.toolCall ?? null, ...manual.capabilities },
    source, updatedAt: manual.updatedAt };
}
const upstreamModelSchema = z.object({
  id: z.string().min(1), name: z.string().optional(), canonical_model_id: z.string().regex(/^[^/]+\/.+$/).optional(),
  status: z.enum(["alpha", "beta", "deprecated"]).optional(),
  limit: z.object({ context: z.number().int().nonnegative().optional(), output: z.number().int().nonnegative().optional() }).optional(),
  modalities: z.object({ input: z.array(z.string()).optional() }).optional(),
  reasoning: z.boolean().optional(), tool_call: z.boolean().optional(),
});
const upstreamCatalogSchema = z.record(z.string(), z.object({
  // Some providers publish account-specific URL templates; only concrete hosts participate in matching.
  id: z.string().min(1), api: z.string().optional(), models: z.record(z.string(), upstreamModelSchema),
}));
const host = (url: string) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };
const unknownCapacity = (): ModelCapacity => ({ context: null, output: null, source: "unknown", matchedId: null, updatedAt: null });
export const CATALOG_INTERVAL = 6 * 60 * 60 * 1000;

export function parseCatalog(data: unknown): Row[] {
  const rows: Row[] = [];
  const catalog = upstreamCatalogSchema.parse(data);
  for (const [providerId, provider] of Object.entries(catalog)) {
    if (providerId !== provider.id) throw new Error("Models.dev 供应商标识不一致");
    for (const [modelId, model] of Object.entries(provider.models)) {
      if (modelId !== model.id) throw new Error("Models.dev 模型标识不一致");
      if (rows.length >= 30000) throw new Error("模型资料超出数量限制");
      // Only an explicit canonical ID joins provider aliases. Missing/zero limits stay unknown;
      // absent lifecycle means active, while alpha/beta share the platform's preview state.
      rows.push(rowSchema.parse({ provider: providerId, api: provider.api ?? "", id: model.id,
        canonical: model.canonical_model_id, name: model.name,
        status: model.status === "deprecated" ? "deprecated" : model.status ? "preview" : "active",
        context: model.limit?.context || null, output: model.limit?.output || null,
        input: model.modalities?.input, reasoning: model.reasoning, toolCall: model.tool_call }));
    }
  }
  if (!rows.length) throw new Error("模型资料没有有效模型记录");
  return rows;
}

const knownCanonical = (value: string | undefined): value is string => typeof value === "string";
function catalogCandidates(rows: Row[], modelId: string, baseUrl: string) {
  // Exact IDs and explicit canonical_model_id identities are aliases; never guess versions or publishers.
  const seed = rows.filter(row => row.id === modelId || `${row.provider}/${row.id}` === modelId
    || row.canonical === modelId || row.canonical?.split("/").slice(1).join("/") === modelId);
  const identities = new Set(seed.map(row => row.canonical).filter(knownCanonical));
  const aliases = rows.filter(row => seed.includes(row) || row.canonical && identities.has(row.canonical));
  const local = aliases.filter(row => host(row.api) && host(row.api) === host(baseUrl));
  return { aliases, local, identities };
}

export function matchCatalog(rows: Row[], modelId: string, baseUrl: string): (Row & { matchedId: string }) | undefined {
  const { aliases, local, identities } = catalogCandidates(rows, modelId, baseUrl);
  if (!aliases.length) return undefined;
  const localIdentities = new Set(local.map(row => row.canonical).filter(knownCanonical));
  if (localIdentities.size > 1 || !local.length && identities.size > 1) return undefined;
  const canonical = localIdentities.size === 1 ? [...localIdentities][0] : identities.size === 1 ? [...identities][0] : undefined;
  const related = canonical ? aliases.filter(row => row.canonical === canonical) : local.length ? local : aliases;
  const publisher = canonical ? related.filter(row => row.provider === canonical.split("/")[0]) : [];
  // Resolve each field independently. An empty short-ID row or conflicting output limits must not
  // hide a known context window. Prefer this endpoint, then the publisher, then the same canonical model.
  const capacity = (field: "context" | "output") => {
    for (const layer of [local, publisher, related]) {
      const values = layer.map(row => row[field]).filter((value): value is number => value !== null);
      if (!values.length) continue;
      // For one confirmed model use the smallest published channel limit as a conservative fallback.
      // Without a confirmed canonical identity, genuinely conflicting values remain unknown.
      return canonical ? Math.min(...values) : new Set(values).size === 1 ? values[0]! : null;
    }
    return null;
  };
  const record = local[0] ?? publisher[0] ?? related.find(row => row.context || row.output) ?? related[0];
  if (!record) return undefined;
  return { ...record, context: capacity("context"), output: capacity("output"),
    matchedId: !local.length && canonical ? canonical : `${record.provider}/${record.id}` };
}

export class ModelCatalog {
  private snapshot?: z.infer<typeof snapshotSchema>;
  private supplements: z.infer<typeof supplementSchema> = {};
  private pending?: Promise<void>;
  private writes: Promise<unknown> = Promise.resolve();
  private lastError: string | null = null;
  constructor(private file: string, private download = fetchModelsDev) {}
  async load() {
    try { this.snapshot = snapshotSchema.parse(JSON.parse(await readFile(this.file, "utf8"))); } catch { /* A missing/corrupt cache is replaced only by a validated download. */ }
    try { this.supplements = supplementSchema.parse(JSON.parse(await readFile(`${this.file}.overrides`, "utf8"))); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("模型容量覆盖资料读取失败");
    }
  }
  status() { return { syncedAt: this.snapshot?.syncedAt ?? null, stale: !this.snapshot || Date.now() - Date.parse(this.snapshot.syncedAt) >= CATALOG_INTERVAL, error: this.lastError }; }
  async refresh() {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      try {
        const next = { version: 4 as const, source: "models.dev" as const, syncedAt: new Date().toISOString(), rows: parseCatalog(await this.download()) };
        await this.write(this.file, next); this.snapshot = next; this.lastError = null;
      } catch { this.lastError = "同步失败，继续使用上次成功缓存"; }
    })().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private reference(modelId: string, baseUrl: string): ModelCapacity {
    const row = matchCatalog(this.snapshot?.rows ?? [], modelId, baseUrl);
    // Feature consensus is independent of capacity: resellers often have different token limits.
    const { aliases, local } = catalogCandidates(this.snapshot?.rows ?? [], modelId, baseUrl);
    const candidates = local.length ? local : aliases;
    const consensus = (read: (item: Row) => boolean | undefined) => {
      // Missing metadata is not a negative capability. Agreeing explicit records can confirm it;
      // a real true/false conflict (or no explicit record) remains unknown.
      const values = candidates.map(read).filter((value): value is boolean => value !== undefined);
      return values.length && values.every(value => value === values[0]) ? values[0]! : null;
    };
    const capabilities = { vision: consensus(item => item.input?.includes("image")), reasoning: consensus(item => item.reasoning), toolCall: consensus(item => item.toolCall) };
    return row ? { context: row.context, output: row.output, source: "models.dev", matchedId: row.matchedId, updatedAt: this.snapshot!.syncedAt, name: row.name, status: row.status, capabilities }
      : { ...unknownCapacity(), capabilities };
  }
  private overrideKey(providerId: string, modelId: string, baseUrl: string, source: OverrideSource = "admin") {
    const identity = [providerId, modelId, baseUrl.replace(/\/+$/, "")];
    // Personal settings use a separate namespace so existing administrator records retain their provenance.
    return JSON.stringify(source === "user" ? ["user", ...identity] : identity);
  }
  private administratorCapacity(providerId: string, modelId: string, baseUrl: string) {
    const reference = this.reference(modelId, baseUrl);
    const manual = this.supplements[this.overrideKey(providerId, modelId, baseUrl)];
    return applyOverride(reference, manual, "admin");
  }
  resolve(providerId: string, modelId: string, baseUrl: string): ModelCapacity {
    return applyOverride(this.administratorCapacity(providerId, modelId, baseUrl),
      this.supplements[this.overrideKey(providerId, modelId, baseUrl, "user")], "user");
  }
  describe(providerId: string, modelId: string, baseUrl: string, source: OverrideSource = "admin") {
    const manual = this.supplements[this.overrideKey(providerId, modelId, baseUrl, source)];
    const { updatedAt: _updatedAt, ...overrides } = manual ?? {};
    const reference = source === "user" ? this.administratorCapacity(providerId, modelId, baseUrl) : this.reference(modelId, baseUrl);
    return { modelId, ...this.resolve(providerId, modelId, baseUrl), reference, overrides };
  }
  async supplement(providerId: string, modelId: string, baseUrl: string, input: unknown, source: OverrideSource = "admin") {
    const value = modelCapacityInputSchema.parse(input);
    const operation = this.writes.catch(() => {}).then(async () => {
      const key = this.overrideKey(providerId, modelId, baseUrl, source);
      const current = this.supplements[key];
      const updated: ModelCapacityOverride = { context: current?.context, output: current?.output, capabilities: { ...current?.capabilities } };
      // Omitted fields are untouched; null removes only this source's override.
      for (const field of ["context", "output"] as const) {
        if (value[field] === null) delete updated[field];
        else if (value[field] !== undefined) updated[field] = value[field];
      }
      for (const field of ["reasoning", "vision"] as const) {
        if (value.capabilities?.[field] === null) delete updated.capabilities![field];
        else if (value.capabilities?.[field] !== undefined) updated.capabilities![field] = value.capabilities[field];
      }
      if (!Object.keys(updated.capabilities!).length) delete updated.capabilities;
      if (updated.context === undefined) delete updated.context;
      if (updated.output === undefined) delete updated.output;
      const reference = source === "user" ? this.administratorCapacity(providerId, modelId, baseUrl) : this.reference(modelId, baseUrl);
      const context = updated.context ?? reference.context;
      const output = updated.output ?? reference.output;
      if (context && output && output > context) throw new Error("输出容量不能超过上下文容量");
      const next = { ...this.supplements };
      if (Object.keys(updated).length) next[key] = { ...updated, updatedAt: new Date().toISOString() };
      else delete next[key];
      await this.write(`${this.file}.overrides`, next); this.supplements = next;
    });
    this.writes = operation; await operation;
  }
  private async write(file: string, data: unknown) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(data), "utf8");
    await rename(`${file}.tmp`, file);
  }
}
