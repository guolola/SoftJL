// Keeps feasibility plans and document chapters on the server for bounded, versioned field repairs.
import { contractFieldSchema, MAX_GENERATION_REPAIR_ATTEMPTS, snapshotInputFingerprint } from "@uml-platform/contracts";
import type { ZodTypeAny } from "zod";
import { buildFocusedRepairPrompt } from "@uml-platform/prompts";
import { parseJson } from "../../../normalizers/json/parse-json.js";
import { applyGenerationPatch, repairPathParts, restoreJsonPunctuation, valueAtRepairPath } from "../../../normalizers/structured-output/repair-patch.js";
import { repairDiagnostics, type RepairDiagnostic } from "../../../normalizers/structured-output/repair-diagnostics.js";

type Row = Record<string, any>;
function referenceIndex(value: unknown, result: Row[] = [], path = "") {
  if (Array.isArray(value)) value.forEach((item, index) => referenceIndex(item, result, `${path}${path ? "." : ""}${index}`));
  else if (value && typeof value === "object") {
    const row = value as Row;
    if (typeof row.id === "string") result.push({ path, id: row.id, name: row.name ?? row.title });
    for (const [key, item] of Object.entries(row)) if (item && typeof item === "object") referenceIndex(item, result, `${path}${path ? "." : ""}${key}`);
  }
  return result;
}
// Missing leaves can be added; absent parents and array slots require a bounded owner replacement.
function actionableRepairPath(current: unknown, path: string, schema?: ZodTypeAny): string {
  const parts = repairPathParts(path);
  for (let length = parts.length; length > 0; length--) {
    const candidate = parts.slice(0, length).join(".");
    const parent = length === 1 ? current : valueAtRepairPath(current, parts.slice(0, length - 1).join("."));
    const key = parts[length - 1]!;
    if (!parent || typeof parent !== "object") continue;
    if (Array.isArray(parent) && (!/^\d+$/.test(key) || Number(key) >= parent.length)) continue;
    if (Object.hasOwn(parent, key) || schema && contractFieldSchema(schema, current, candidate)) return candidate;
    // Without a schema, only a missing final field is a known insertion point.
    if (!schema && length === parts.length) return candidate;
  }
  return "";
}

export class GenerationRepairSession {
  private current: unknown;
  private raw = "";
  private allowed: string[] = [];
  private pending = false;
  private syntax = false;
  private used = 0;
  private diagnostics: RepairDiagnostic[] = [];
  readonly metadata: { targetId: string; mode: string; baseFingerprint: string; paths: string[]; round: number; reason?: string };
  constructor(readonly targetId: string, private readonly sources: unknown, private readonly roots: string[], private readonly limit = MAX_GENERATION_REPAIR_ATTEMPTS, private readonly initialTask?: string, private readonly responseSchema?: ZodTypeAny) {
    this.metadata = { targetId, mode: "initial", baseFingerprint: "", paths: [], round: 0 };
  }
  get repairing() { return this.pending; }
  get attempts() { return this.used; }
  accept(raw: string): string {
    const restored = restoreJsonPunctuation(raw);
    let value: any;
    try { value = parseJson(restored); } catch {
      if (!this.pending) { this.raw = raw; this.current = undefined; }
      throw new SyntaxError("JSON 无法安全恢复；需要修复原始输出的语法");
    }
    if (this.pending && !this.syntax && this.current !== undefined) {
      value = applyGenerationPatch(this.current, value, this.targetId, this.allowed);
    }
    this.current = value;
    this.raw = JSON.stringify(value);
    this.pending = false;
    return this.raw;
  }
  prepare(error: unknown, options: { paths?: string[]; instruction?: string; sourceFacts?: unknown; sourceLabel?: string } = {}): string {
    if (this.used >= this.limit) throw new Error(`${this.targetId} 已达到共享 ${this.limit} 次修复调用上限`);
    this.used++;
    const roots = this.roots.length ? this.roots : this.current && typeof this.current === "object" ? Object.keys(this.current) : [];
    const incoming = repairDiagnostics(error);
    if (incoming.length) this.diagnostics = incoming;
    else if (!this.pending) this.diagnostics = []; // A parsed new candidate must not keep an unrelated old error.
    const normalized: string[] = [];
    const paths = options.paths?.length ? options.paths : incoming.length ? incoming.map(issue => issue.path) : this.pending && this.current !== undefined ? this.allowed : [];
    for (const path of paths) {
      if (!path) continue; // Envelope-level diagnostics use the explicit scoped-regeneration branch below.
      normalized.push(path);
    }
    let relocated = false;
    if (this.current !== undefined) for (let index = 0; index < normalized.length; index++) {
      const actionable = actionableRepairPath(this.current, normalized[index]!, this.responseSchema);
      relocated ||= actionable !== normalized[index];
      normalized[index] = actionable;
    }
    this.allowed = [...new Set(normalized.filter(path => roots.some(root => path === root || path.startsWith(root + "."))))];
    const global = !this.allowed.length;
    if (global) this.allowed = [...roots];
    const missingValue = this.current === undefined;
    this.syntax = missingValue && /^[{[]/.test(this.raw.trim().replace(/^```(?:json)?\s*/i, ""));
    this.pending = true;
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.metadata.mode = this.syntax ? "syntax" : global ? "scoped-regeneration" : "field-patch";
    this.metadata.round = this.used;
    this.metadata.baseFingerprint = snapshotInputFingerprint(this.current === undefined ? this.raw : this.current);
    this.metadata.paths = this.allowed;
    this.metadata.reason = missingValue && !this.syntax ? "没有可修复的结构化结果，明确升级为本产物重新生成" : global ? "诊断无法定位到字段，扩大到本次产物范围" : relocated ? "诊断路径无法直接应用，已定位到当前产物内可修复的上级路径" : undefined;
    const targets = this.allowed.map(path => {
      const parts = path.split(".");
      const parent = parts.length > 1 ? parts.slice(0, -1).join(".") : path;
      const value = this.current === undefined ? undefined : valueAtRepairPath(this.current, path);
      const owner = this.current === undefined ? undefined : valueAtRepairPath(this.current, parent) as Row | undefined;
      const diagnostic = this.diagnostics.find(issue => issue.path === path || path.endsWith(`.${issue.path}`));
      const expectedSchema = this.responseSchema ? contractFieldSchema(this.responseSchema, this.current, path) ?? diagnostic?.expectedSchema : diagnostic?.expectedSchema;
      return { path, value, actualType: value === undefined ? "missing" : value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
        expectedSchema, diagnostics: this.diagnostics.filter(issue => issue.path === path || issue.path.startsWith(`${path}.`) || path.endsWith(`.${issue.path}`)),
        owner: owner && !Array.isArray(owner) ? Object.values(owner).every(item => item === null || typeof item !== "object") ? owner : { id: owner.id, name: owner.name, title: owner.title } : undefined };
    });
    return buildFocusedRepairPrompt({ ...this.metadata, error: errorMessage, instruction: options.instruction, sourceLabel: options.sourceLabel,
      replaceScope: missingValue && !this.syntax,
      current: missingValue ? this.raw : global ? this.current : targets,
      diagnostics: this.diagnostics,
      references: this.syntax ? [] : referenceIndex(this.current).filter(entry => {
        if (!this.allowed.some(path => path.startsWith("candidates."))) return true;
        return this.allowed.some(path => entry.path === path.split(".").slice(0, 2).join(".") || entry.path.startsWith(path.split(".").slice(0, 2).join(".") + "."));
      }),
      // Pure contract fixes use current identities. Business/global repairs receive scoped authoritative facts.
      sourceFacts: missingValue && !this.syntax ? this.initialTask ?? this.sources : options.sourceFacts ?? (global ? this.sources : undefined),
    });
  }
}
