// Keeps each artifact's current value on the server and sends only the evidence needed for bounded repairs.
import { contractFieldSchema, isModelRelationshipAllowed, prototypeInterfaceNodeTypeSchema, prototypeInterfaceRelationshipTypeSchema, MAX_GENERATION_REPAIR_ATTEMPTS, snapshotInputFingerprint } from "@uml-platform/contracts";
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
    if (typeof row.id === "string" || typeof row.modelId === "string") result.push({ path, id: row.id, modelId: row.modelId, name: row.name ?? row.title, type: row.type ?? row.diagramKind });
    for (const [key, item] of Object.entries(row)) if (item && typeof item === "object") referenceIndex(item, result, `${path}${path ? "." : ""}${key}`);
  }
  return result;
}
function changesInside(before: any, after: any, allowed: string[], path = ""): boolean {
  if (JSON.stringify(before) === JSON.stringify(after)) return true;
  if (path && allowed.some(scope => path === scope || path.startsWith(scope + "."))) return true;
  if (!before || !after || typeof before !== "object" || typeof after !== "object" || Array.isArray(before) !== Array.isArray(after)) return false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].every(key => changesInside(before[key], after[key], allowed, path ? `${path}.${key}` : key));
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

function identifierMappingPaths(current: unknown, path: string): string[] {
  const match = /^(models\.\d+|model)\.(.+)\.id$/.exec(path);
  if (!match) return [];
  const model = valueAtRepairPath(current, match[1]!) as Row | undefined;
  if (!model?.diagramKind) return [];
  const id = valueAtRepairPath(current, path);
  const declaration = valueAtRepairPath(current, path.slice(0, -3)) as Row;
  const collection = match[2]!.split(".")[0]!;
  const kinds = new Set([collection === "classes" ? "class" : collection.slice(0, -1).toLowerCase(), declaration.type, declaration.nodeType]);
  if (collection === "nodes") kinds.add("node");
  const envelope = current as Row, paths: string[] = [];
  if (match[1] === "model") {
    (Array.isArray(envelope.traceability) ? envelope.traceability : []).forEach((entry: Row | null, index: number) => {
      if (entry && entry.targetId === id && kinds.has(entry.targetKind)) paths.push(`traceability.${index}.targetId`);
    });
  } else {
    const unambiguous = envelope.models.filter((item: Row | null) => item?.diagramKind === model.diagramKind).length === 1;
    for (const [field, side] of [["requirementModelTraceability", "target"], ["designModelTraceability", "source"]] as const) {
      (Array.isArray(envelope[field]) ? envelope[field] : []).forEach((entry: Row | null, index: number) => {
        const ref = entry?.[side];
        if (ref?.diagramKind === model.diagramKind && ref.elementId === id && typeof ref.elementKind === "string" && kinds.has(ref.elementKind.toLowerCase()) &&
          (ref.modelId ? ref.modelId === (model.modelId ?? model.diagramKind) : unambiguous)) paths.push(`${field}.${index}.${side}.elementId`);
      });
    }
  }
  return paths;
}

function structuralContext(current: unknown, path: string) {
  if (!/(?:^|\.)(?:nodes|activations|fragments|relationships)(?:\.|$)/.test(path)) return undefined;
  const parts = path.split(".");
  const modelPath = parts.slice(0, parts.findIndex(part => ["nodes", "activations", "fragments", "relationships"].includes(part))).join(".");
  const model = (modelPath ? valueAtRepairPath(current, modelPath) : current) as Row | undefined;
  if (!model) return undefined;
  if (model.diagramKind === "activity") return {
    nodes: model.nodes?.map((node: Row) => ({ id: node.id, type: node.type, name: node.name, actorOrLane: node.actorOrLane })),
    relationships: model.relationships,
    degrees: model.nodes?.map((node: Row) => ({ id: node.id,
      incoming: model.relationships?.filter((edge: Row) => edge.targetId === node.id).map((edge: Row) => edge.id),
      outgoing: model.relationships?.filter((edge: Row) => edge.sourceId === node.id).map((edge: Row) => edge.id) })),
    instruction: "活动图连接问题必须联动修复节点与连线。decision/fork 恰好一条入边且至少两条出边；merge/join 至少两条入边且恰好一条出边。首次路径和重试路径返回同一判断时，先用 merge 汇合，再连入 decision。保留已有业务节点的 id、职责、分支条件和业务顺序，只允许增加必要的结构控制节点和控制流；禁止仅切换节点类型、改名或改 id 来规避错误。",
  };
  if (parts.includes("relationships")) {
    if (!["prototype", "navigation"].includes(model.diagramKind)) return undefined;
    const kinds = prototypeInterfaceNodeTypeSchema.options;
    return { nodes: model.nodes?.map((node: Row) => ({ id: node.id, name: node.name, nodeType: node.nodeType })),
      allowedEndpoints: prototypeInterfaceRelationshipTypeSchema.options.flatMap(type => kinds.flatMap(sourceKind => kinds.flatMap(targetKind =>
        isModelRelationshipAllowed(model.diagramKind, type, sourceKind, targetKind) ? [{ type, sourceKind, targetKind }] : []))),
      instruction: "必须按合法端点矩阵修复。入口或页面的导航只能指向页面，不能指向模块；若现有端点组合不支持任何关系类型，必须修复端点引用，不能只切换关系类型。仅使用已有节点，不改变模块与页面的业务身份。" };
  }
  // Activation validity depends on message order and branch membership, not their business descriptions.
  return { messages: model.messages?.map((message: Row) => ({ id: message.id, sourceId: message.sourceId, targetId: message.targetId })),
    fragments: model.fragments?.map((fragment: Row) => ({ id: fragment.id, type: fragment.type, messageIds: fragment.messageIds,
      parentFragmentId: fragment.parentFragmentId, parentBranchId: fragment.parentBranchId,
      branches: fragment.branches?.map((branch: Row) => ({ id: branch.id, messageIds: branch.messageIds })) })) };
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
  constructor(readonly targetId: string, private readonly sources: unknown, private readonly roots: string[] = ["models"], private readonly limit = MAX_GENERATION_REPAIR_ATTEMPTS, private readonly initialTask?: string, private readonly responseSchema?: ZodTypeAny) {
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
      if (Array.isArray(value?.changes)) value = applyGenerationPatch(this.current, value, this.targetId, this.allowed);
      else if (value?.patch && Number.isInteger(value.candidateIndex)) {
        const candidate = structuredClone(this.current) as Row;
        const owner = candidate.candidates?.[value.candidateIndex]?.implementation;
        if (!owner) throw new Error("修复候选索引不存在");
        Object.assign(owner, value.patch);
        if (!changesInside(this.current, candidate, this.allowed)) throw new Error("候选章节修复越过允许范围");
        value = candidate;
      } else if (!changesInside(this.current, value, this.allowed)) throw new Error("完整修复输出越过允许范围；请只返回指定字段补丁");
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
    for (const path of [...paths, ...this.diagnostics.flatMap(issue => issue.relatedPaths ?? [])]) {
      if (!path) continue; // Envelope-level diagnostics use the explicit scoped-regeneration branch below.
      if (this.current && typeof this.current === "object" && "models" in this.current && !path.startsWith("models") && !path.toLowerCase().includes("traceability")) {
        const models = (this.current as Row).models;
        const diagnostic = incoming.find(issue => issue.path === path);
        const matches = Array.isArray(models) ? models.flatMap((model: Row, index: number) =>
          model && (model.modelId === diagnostic?.modelId || model.modelId === this.targetId || model.diagramKind === this.targetId || models.length === 1) ? [index] : []) : [];
        // Never guess the first model or apply one model's missing-field repair to its siblings.
        if (matches.length === 1) normalized.push(`models.${matches[0]}.${path}`);
      } else normalized.push(path);
    }
    let relocated = false;
    if (this.current !== undefined) for (let index = 0; index < normalized.length; index++) {
      const actionable = actionableRepairPath(this.current, normalized[index]!, this.responseSchema);
      relocated ||= actionable !== normalized[index];
      normalized[index] = actionable;
    }
    this.allowed = [...new Set(normalized.filter(path => roots.some(root => path === root || path.startsWith(root + "."))))];
    // Keep declared provenance attached to the same local element; never edit upstream targets or sibling models.
    for (const diagnostic of this.diagnostics.filter(issue => issue.code === "duplicate-id")) {
      const declaration = this.allowed.find(path => path === diagnostic.path || path.endsWith(`.${diagnostic.path}`));
      if (declaration) this.allowed.push(...identifierMappingPaths(this.current, declaration).filter(path => roots.some(root => path === root || path.startsWith(root + "."))));
    }
    this.allowed = [...new Set(this.allowed)];
    // Degree/connectivity defects cannot be repaired by editing one node alone.
    // Open only that activity model's graph collections, preserving other fields and artifacts.
    for (const diagnostic of incoming) {
      if (!["split-degree", "join-degree", "mixed-control-node", "initial-incoming", "final-outgoing", "missing-endpoint", "unreachable-node"].includes(diagnostic.code ?? "")) continue;
      const path = this.allowed.find(path => path === diagnostic.path || path.endsWith(`.${diagnostic.path}`));
      const match = path?.match(/^(.*?)(?:\.)?(nodes|relationships)(?:\.|$)/);
      if (!match) continue;
      const prefix = match[1]!.replace(/\.$/, "");
      const model = (prefix ? valueAtRepairPath(this.current, prefix) : this.current) as Row | undefined;
      if (model?.diagramKind !== "activity") continue;
      const graphPaths = ["nodes", "relationships"].map(collection => prefix ? `${prefix}.${collection}` : collection);
      if (graphPaths.every(path => roots.some(root => path === root || path.startsWith(root + ".")))) this.allowed = [...new Set([...this.allowed.filter(path => !graphPaths.some(graph => path === graph || path.startsWith(graph + "."))), ...graphPaths])];
    }
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
        structuralContext: structuralContext(this.current, path), owner: owner && !Array.isArray(owner) ? Object.values(owner).every(item => item === null || typeof item !== "object") ? owner : { id: owner.id, modelId: owner.modelId, name: owner.name, type: owner.type, diagramKind: owner.diagramKind } : undefined };
    });
    return buildFocusedRepairPrompt({ ...this.metadata, error: errorMessage, instruction: options.instruction, sourceLabel: options.sourceLabel,
      replaceScope: missingValue && !this.syntax,
      current: missingValue ? this.raw : global ? this.current : targets,
      diagnostics: this.diagnostics,
      references: this.syntax ? [] : referenceIndex(this.current).filter(entry => {
        const modelScopes = this.allowed.filter(path => /^models\.\d+(?:\.|$)/.test(path)).map(path => path.split(".").slice(0, 2).join("."));
        if (modelScopes.length && !modelScopes.some(scope => entry.path === scope || entry.path.startsWith(scope + "."))) return false;
        if (!this.allowed.some(path => path.startsWith("candidates."))) return true;
        return this.allowed.some(path => entry.path === path.split(".").slice(0, 2).join(".") || entry.path.startsWith(path.split(".").slice(0, 2).join(".") + "."));
      }),
      // Pure contract fixes use current identities. Business/global repairs receive scoped authoritative facts.
      sourceFacts: missingValue && !this.syntax ? this.initialTask ?? this.sources : options.sourceFacts ?? (global || this.allowed.some(path => /(?:traceability|sourceElementIds)/i.test(path)) ? this.sources : undefined),
    });
  }
}
