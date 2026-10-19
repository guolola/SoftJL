// Owns validated capacity matching, durable cached snapshots and administrator supplements for unknown models.
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { modelCapacityInputSchema, type ModelCapacity } from "@uml-platform/contracts";
import { fetchModelpedia } from "../adapters/llm/modelpedia.js";

const rowSchema = z.object({ provider: z.string(), api: z.string(), id: z.string(), canonical: z.string().optional(), context: z.number().int().positive().nullable(), output: z.number().int().positive().nullable(),
  name: z.string().optional(), status: z.enum(["active", "deprecated", "preview"]).optional(),
  input: z.array(z.string()).optional(), vision: z.boolean().optional(), reasoning: z.boolean().optional(), toolCall: z.boolean().optional() });
type Row = z.infer<typeof rowSchema>;
const snapshotSchema = z.object({ version: z.literal(3), source: z.literal("modelpedia"), syncedAt: z.string().datetime(), rows: z.array(rowSchema).min(1) });
const supplementSchema = z.record(z.object({ context: z.number().int().positive(), output: z.number().int().positive(), updatedAt: z.string().datetime() }));
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const host = (url: string) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };
const unknownCapacity = (): ModelCapacity => ({ context: null, output: null, source: "unknown", matchedId: null, updatedAt: null });
export const CATALOG_INTERVAL = 24 * 60 * 60 * 1000;

export function parseCatalog(data: unknown): Row[] {
  const rows: Row[] = [];
  const catalog = object(data);
  if (!Array.isArray(catalog.providers) || !Array.isArray(catalog.models)) throw new Error("Modelpedia 模型资料格式无效");
  const providers = new Map(catalog.providers.map(raw => { const provider = object(raw); return [provider.id, provider]; }));
  const identities = new Set<string>();
  for (const raw of catalog.models) {
    const model = object(raw); const provider = providers.get(model.provider); const capabilities = object(model.capabilities);
    const creator = typeof model.created_by === "string" ? model.created_by : undefined;
    const id = typeof model.id === "string" ? model.id : "";
    const publisherId = creator && id.startsWith(`${creator}/`) ? id.slice(creator.length + 1) : id;
    const result = rowSchema.safeParse({ provider: model.provider, api: typeof provider?.api_url === "string" ? provider.api_url : "", id,
      canonical: creator ? `${creator}/${publisherId}` : undefined, name: model.name, status: model.status,
      context: model.context_window ?? null, output: model.max_output_tokens ?? null,
      input: object(model.modalities).input, vision: capabilities.vision, reasoning: capabilities.reasoning, toolCall: capabilities.tool_call });
    if (!id || !provider || !result.success) throw new Error("Modelpedia 模型记录无效");
    const identity = JSON.stringify([result.data.provider, id]);
    if (identities.has(identity)) throw new Error("Modelpedia 模型记录重复");
    identities.add(identity); rows.push(result.data);
  }
  if (!rows.length) throw new Error("模型资料没有有效容量记录");
  return rows;
}

const knownCanonical = (value: string | undefined): value is string => typeof value === "string" && !value.startsWith("unknown/");
function catalogCandidates(rows: Row[], modelId: string, baseUrl: string) {
  // Exact IDs and explicit created_by identities are aliases; never strip versions or guess by substring.
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
  constructor(private file: string, private download = fetchModelpedia) {}
  async load() {
    try { this.snapshot = snapshotSchema.parse(JSON.parse(await readFile(this.file, "utf8"))); } catch { /* A missing/corrupt cache is replaced only by a validated download. */ }
    try { this.supplements = supplementSchema.parse(JSON.parse(await readFile(`${this.file}.overrides`, "utf8"))); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("管理员模型容量资料读取失败");
    }
  }
  status() { return { syncedAt: this.snapshot?.syncedAt ?? null, stale: !this.snapshot || Date.now() - Date.parse(this.snapshot.syncedAt) >= CATALOG_INTERVAL, error: this.lastError }; }
  async refresh() {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      try {
        const next = { version: 3 as const, source: "modelpedia" as const, syncedAt: new Date().toISOString(), rows: parseCatalog(await this.download()) };
        await this.write(this.file, next); this.snapshot = next; this.lastError = null;
      } catch { this.lastError = "同步失败，继续使用上次成功缓存"; }
    })().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  resolve(providerId: string, modelId: string, baseUrl: string): ModelCapacity {
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
    const capabilities = { vision: consensus(item => item.vision ?? item.input?.includes("image")), reasoning: consensus(item => item.reasoning), toolCall: consensus(item => item.toolCall) };
    const manual = this.supplements[JSON.stringify([providerId, modelId, baseUrl.replace(/\/+$/, "")])];
    if (row && (row.context && row.output || !manual)) return { context: row.context, output: row.output, source: "modelpedia", matchedId: row.matchedId, updatedAt: this.snapshot!.syncedAt, name: row.name, status: row.status, capabilities };
    return manual ? { ...manual, source: "admin", matchedId: modelId, capabilities } : { ...unknownCapacity(), capabilities };
  }
  async supplement(providerId: string, modelId: string, baseUrl: string, input: unknown) {
    const value = modelCapacityInputSchema.parse(input);
    const operation = this.writes.catch(() => {}).then(async () => {
      const matched = this.resolve(providerId, modelId, baseUrl);
      if (matched.source === "modelpedia" && matched.context && matched.output) throw new Error("已匹配 Modelpedia 的模型不能手动覆盖");
      const next = { ...this.supplements, [JSON.stringify([providerId, modelId, baseUrl.replace(/\/+$/, "")])]: { ...value, updatedAt: new Date().toISOString() } };
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
