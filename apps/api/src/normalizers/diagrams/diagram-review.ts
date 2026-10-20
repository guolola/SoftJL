// Verifies review claims and derives the exact changes authorized by confirmed facts.
import { createHash } from "node:crypto";
import { classifyDiagramReviewIssue, isExcludedDiagramReviewIssue, isUnverifiableReviewText, deriveTableModel, useCaseParticipationGaps, getModelGraphElements, validateModelInput, type DiagramModelSpec, type DesignDiagramModelSpec, type DiagramReviewFinding, type ModelingStage, type RequirementBaseline } from "@uml-platform/contracts";

export type ReviewModel = DiagramModelSpec | DesignDiagramModelSpec;
export interface DiagramReviewBasis {
  stage: ModelingStage;
  baseline?: RequirementBaseline | null;
  rules?: unknown;
  upstreamModels?: ReviewModel[];
  traceability?: unknown;
  requirementTraceability?: unknown;
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function reviewFingerprint(...inputs: unknown[]) { return createHash("sha256").update(stableJson(inputs)).digest("hex"); }

function at(value: unknown, path: string): unknown { return path.split(".").reduce<unknown>((v, key) => v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined, value); }
function put(value: unknown, path: string, expected: unknown) {
  const parts = path.split("."); const last = parts.pop()!;
  const parent = parts.reduce<unknown>((v, key) => (v as Record<string, unknown>)[key], value) as Record<string, unknown>;
  parent[last] = expected;
}
function comparison(text: string) {
  const normalized = text.replace(/不少于|至少|大于等于/g, ">=").replace(/不超过|至多|最多|小于等于/g, "<=").replace(/超过|大于/g, ">").replace(/少于|小于/g, "<").replace(/[\s，,。；;：:？?（）()]/g, "");
  const matches = [...normalized.matchAll(/(>=|<=|>|<)\s*(\d+(?:\.\d+)?)/g)];
  if (matches.length !== 1) return;
  return { op: matches[0]![1]!, key: normalized.replace(/>=|<=|>|</, "#") };
}
function trustedBinding(trace: unknown, model: ReviewModel, elementId: string, requirementId: string, upstreamTrace?: unknown): boolean {
  if (!Array.isArray(trace)) return false;
  return trace.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const row = entry as Record<string, any>;
    if (row.source?.elementId === elementId && row.source.diagramKind === model.diagramKind && (!row.source.modelId || row.source.modelId === model.modelId) && Array.isArray(row.targets) && Array.isArray(upstreamTrace)) {
      return row.targets.some((target: Record<string, any>) => upstreamTrace.some((entry) => {
        const binding = entry as Record<string, any>;
        return binding.ruleId === requirementId && binding.target?.elementId === target.elementId && binding.target.diagramKind === target.diagramKind && binding.target.modelId === target.modelId;
      }));
    }
    return (row.ruleId === requirementId || row.requirementId === requirementId) &&
      ((row.target?.elementId === elementId && (!row.target.modelId || row.target.modelId === model.modelId) && row.target.diagramKind === model.diagramKind) || row.targetId === elementId);
  });
}
export interface AuthorizedRepair { expectedModel: ReviewModel; findings: DiagramReviewFinding[]; changes: string[] }
export function deriveAuthorizedRepairs(model: ReviewModel, basis: DiagramReviewBasis): AuthorizedRepair {
  const expectedModel = structuredClone(model); const findings: DiagramReviewFinding[] = []; const changes: string[] = [];
  const modelId = model.modelId ?? model.diagramKind;
  const change = (path: string, expected: unknown, code: string, elementId: string | undefined, reference: string, detail: string) => {
    const actual = at(expectedModel, path);
    if (stableJson(actual) === stableJson(expected)) return;
    const id = `${modelId}:${code}:${elementId ?? path}`;
    findings.push({ id, layer: "model", code, category: classifyDiagramReviewIssue(detail, "model", code), modelId, elementId, path, expected, actual, evidence: [{ source: "confirmed-field-or-derived-rule", reference, detail }], observation: detail, verification: "verified", repairable: true });
    put(expectedModel, path, expected); changes.push(`${elementId ?? modelId} · ${path}: ${stableJson(actual)} → ${stableJson(expected)}`);
  };
  // Constraints are the authoritative input; derived flags/edges cannot authorize changes to constraints.
  if (model.diagramKind === "usecase") {
    const participation = useCaseParticipationGaps(model);
    if (participation.gaps.length) {
      const candidate = { ...model, relationships: participation.relationships };
      if (!validateModelInput(candidate, basis.stage).some((issue) => issue.severity === "error")) {
        change("relationships", participation.relationships, "actor-participation", undefined, modelId,
          `按模型明确声明的主／辅助参与者补齐 ${participation.gaps.length} 条关联，保留包含、扩展及泛化关系`);
      }
    }
  }
  if (model.diagramKind === "table" && model.tables.every((table) => table.relationalConstraints?.length) && !validateModelInput(model, basis.stage).some((issue) => issue.severity === "error")) {
    const derived = deriveTableModel(model);
    model.tables.forEach((table, i) => table.columns.forEach((column, j) => {
      for (const field of ["isPrimaryKey", "isForeignKey", "references"] as const) change(`tables.${i}.columns.${j}.${field}`, derived.tables[i]!.columns[j]![field], "constraint-marker", column.id, table.id, "按已校验的主外键约束派生字段标记");
    }));
    change("relationships", derived.relationships, "constraint-relationship", undefined, modelId, "按已校验的外键约束派生关系集合");
  }
  if (model.diagramKind === "architecture") {
    model.relationships.forEach((edge, i) => {
      if (edge.type !== "contains") return;
      const target = model.components.find((item) => item.id === edge.targetId) ?? model.packages.find((item) => item.id === edge.targetId);
      const owner = target && ("packageId" in target ? target.packageId : "parentId" in target ? target.parentId : undefined);
      if (owner && model.packages.some((item) => item.id === owner)) change(`relationships.${i}.sourceId`, owner, "explicit-owner", edge.id, target!.id, "包含关系必须指向模型明确声明的归属");
    });
  }
  // A uniquely traced literal predicate supports findings without inventing atomic facts.
  const ruleFacts = basis.baseline?.rules ?? [];
  const visit = (value: unknown, path: string, elementId?: string) => {
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>; const id = typeof row.id === "string" ? row.id : elementId;
    for (const [key, item] of Object.entries(row)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (typeof item === "string" && ["condition", "guard"].includes(key) && id) {
        const actual = comparison(item);
        const matches: { id: string; condition: string }[] = [];
        if (actual && !/&&|\|\||且|或|\band\b|\bor\b/.test(item) && actual.key.indexOf("#") > 0) {
          for (const rule of ruleFacts) {
            if (!trustedBinding(basis.traceability, model, id, rule.id, basis.requirementTraceability)) continue;
            const predicate = comparison(rule.text);
            if (!predicate) continue; // Multiple boundaries require semantic review.
            const position = predicate.key.indexOf(actual.key);
            if (position < 0 || /[\d.]/.test(predicate.key.charAt(position + actual.key.length))) continue;
            matches.push({ id: rule.requirementId, condition: item.replace(/>=|<=|>|<|不少于|至少|大于等于|不超过|至多|最多|小于等于|超过|大于|少于|小于/, predicate.op) });
          }
        }
        if (matches.length === 1 && actual) {
          const required = comparison(matches[0]!.condition!)!;
          if ((required.op === ">=" && actual.op === ">") || (required.op === "<=" && actual.op === "<")) {
            change(fieldPath, matches[0]!.condition, "confirmed-comparator", id, matches[0]!.id, "模型边界比较符与追踪需求中的明确条件不一致，请核对");
            if (model.diagramKind === "activity" && path.startsWith("relationships.")) {
              const index = Number(path.split(".")[1]); const edge = model.relationships[index]!;
              const siblings = model.relationships.filter((candidate) => candidate.sourceId === edge.sourceId);
              const other = siblings.find((candidate) => candidate.id !== edge.id);
              const otherKey = other?.guard ? "guard" : "condition";
              const otherText = other?.[otherKey]; const complement = otherText && comparison(otherText);
              if (siblings.length === 2 && !/&&|\|\||且|或|\band\b|\bor\b/.test(otherText ?? "") && model.nodes.some((node) => node.id === edge.sourceId && node.type === "decision") && complement && complement.key === actual.key && complement.op === (actual.op === ">" ? "<=" : ">=")) {
                change(`relationships.${model.relationships.indexOf(other!)}.${otherKey}`, otherText!.replace(/<=|>=|不超过|至多|最多|小于等于|不少于|至少|大于等于/, actual.op === ">" ? "<" : ">"), "complementary-branch", other!.id, matches[0]!.id, "保持二分支与已确认边界严格互补");
              }
            }
          }
        }
      } else if (typeof item === "object") visit(item, fieldPath, id);
    }
  };
  visit(model, "");
  // Business conditions are shown for review; structural repair must not rewrite their meaning.
  const content = findings.filter((finding) => finding.category === "business_constraint" || finding.category === "business_content");
  for (const finding of content) { put(expectedModel, finding.path!, finding.actual); finding.repairable = false; finding.category = "business_content"; }
  const structuralChanges = changes.filter((_, index) => !content.includes(findings[index]!));
  return { expectedModel, findings, changes: structuralChanges };
}

export function verifyReviewClaims(claims: DiagramReviewFinding[], model: ReviewModel, basis: DiagramReviewBasis | undefined): DiagramReviewFinding[] {
  if (claims.some((claim) => claim.modelId !== (model.modelId ?? model.diagramKind))) throw new Error("检查输出引用了其他模型，无法核实");
  const elements = new Set(getModelGraphElements(model).map((item) => item.id));
  const relationships = new Set(("messages" in model ? model.messages : model.relationships).map((item) => item.id));
  const authorized = basis ? deriveAuthorizedRepairs(model, basis).findings : [];
  const diagnostics = basis ? validateModelInput(model, basis.stage).filter((item) => item.severity === "error") : [];
  return claims.filter((claim) => !isExcludedDiagramReviewIssue(claim.observation)).map((claim) => {
    const proof = authorized.find((item) => item.path === claim.path && stableJson(item.expected) === stableJson(claim.expected));
    if (proof) return { ...proof, id: claim.id };
    const unreadable = isUnverifiableReviewText(`${claim.code} ${claim.observation}`);
    const inferred = claim.category;
    const diagnostic = diagnostics.find((item) => (claim.path && item.path === claim.path) ||
      ((item.elementId === claim.elementId || item.elementId === claim.relationshipId) && item.code === claim.code));
    if (inferred === "model_structure" && diagnostic) return { ...claim, category: "model_structure", verification: "verified", repairable: true,
      evidence: [{ source: "stage-contract", reference: diagnostic.code, detail: diagnostic.message }], path: diagnostic.path };
    const structuralObservation = inferred === "model_structure" && !diagnostic;
    const renderObservation = inferred === "render_mismatch";
    // Provider evidence is retained as an observation, never promoted to service authorization.
    return { ...claim, category: unreadable || structuralObservation || renderObservation ? "check_execution" : inferred === "other" || inferred === "business_constraint" ? "business_content" : inferred,
      verification: unreadable || structuralObservation || renderObservation ? "inconclusive" : "unverified", repairable: false,
      ...(structuralObservation ? { observation: `结构观察尚未得到规则核实：${claim.observation}` } : {}),
      ...(renderObservation ? { observation: `图形观察尚未得到程序核实：${claim.observation}` } : {}),
      evidence: claim.evidence.map((item) => ({ ...item, source: `provider-observation:${item.source}` })), ...(claim.elementId && !elements.has(claim.elementId) ? { elementId: undefined } : {}), ...(claim.relationshipId && !relationships.has(claim.relationshipId) ? { relationshipId: undefined } : {}) };
  });
}

export function reviewObservationClaims(judgment: { passed: boolean; issues: string[]; findings: DiagramReviewFinding[] }, model: ReviewModel, layer: "model" | "image") {
  const observations = judgment.findings.filter((item) => !isExcludedDiagramReviewIssue(item.observation));
  for (const [index, observation] of filterDiagramReviewIssues(judgment.issues).entries()) {
    if (observations.some((item) => item.observation === observation)) continue;
    observations.push({ id: `issue:${index}`, modelId: model.modelId ?? model.diagramKind, layer, code: "provider-observation",
      category: classifyDiagramReviewIssue(observation, layer), observation, evidence: [], verification: "unverified", repairable: false });
  }
  if (!observations.length && !judgment.issues.length && !judgment.findings.length && !judgment.passed) {
    observations.push({ id: "no-conclusion", modelId: model.modelId ?? model.diagramKind, layer, code: "check-no-conclusion", category: "check_execution",
      observation: "检查未返回可核实的结论", evidence: [], verification: "inconclusive", repairable: false });
  }
  return observations;
}

export function filterDiagramReviewIssues(issues: string[]): string[] {
  return [...new Set(issues.flatMap((issue) => issue.split(/[；;\n]+/)).map((issue) => issue.trim()).filter((issue) => issue && !isExcludedDiagramReviewIssue(issue)))];
}

export function acceptRepairCandidate(candidate: ReviewModel, before: ReviewModel, authorized: AuthorizedRepair, basis: DiagramReviewBasis, validate?: (model: ReviewModel) => void) {
  if (stableJson(candidate) === stableJson(before)) throw new Error("候选没有有效改动");
  if (stableJson(candidate) !== stableJson(authorized.expectedModel)) throw new Error("候选越过授权字段或集合，已拒绝");
  const errors = validateModelInput(candidate, basis.stage).filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(errors.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  validate?.(candidate);
  return structuredClone(candidate);
}

export function acceptStructuralRepairCandidate(candidate: ReviewModel, before: ReviewModel, basis: DiagramReviewBasis, validate?: (model: ReviewModel) => void) {
  const diagnostics = validateModelInput(before, basis.stage).filter((issue) => issue.severity === "error");
  if (!diagnostics.length) throw new Error("没有已核实的结构错误，不允许改写模型");
  const errors = validateModelInput(candidate, basis.stage).filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(`候选仍不符合结构规则：${errors.map((item) => item.message).join("；")}`);
  const allowed = new Set(diagnostics.flatMap((item) => [item.path, ...item.relatedPaths ?? []]));
  // An identifier rename preserves ownership and endpoints only when its matching reference moves with it.
  const identifierRename = (path: string) => diagnostics.some(item => item.code === "duplicate-id" && item.relatedPaths?.includes(path)
    && at(before, path) === at(before, item.path) && at(candidate, path) === at(candidate, item.path));
  for (const diagnostic of diagnostics) if (diagnostic.code === "duplicate-id") for (const path of diagnostic.relatedPaths ?? []) {
    if (stableJson(at(before, path)) !== stableJson(at(candidate, path)) && !identifierRename(path)) throw new Error("标识修复改变了关联引用的业务指向");
  }
  for (const diagnostic of diagnostics) {
    if (diagnostic.code === "fragment-range") allowed.add(`${diagnostic.path}.messageIds`);
    if (diagnostic.code === "branch-range" && "fragments" in before) {
      const index = Number(diagnostic.path.split(".")[1]);
      before.fragments[index]?.branches?.forEach((_, j) => allowed.add(`fragments.${index}.branches.${j}.messageIds`));
    }
    if (diagnostic.code === "activation-order" && "activations" in before) {
      const index = before.activations?.findIndex((item) => item.id === diagnostic.elementId) ?? -1;
      if (index >= 0) { allowed.add(`activations.${index}.startMessageId`); allowed.add(`activations.${index}.endMessageId`); }
    }
  }
  const equivalentIds = (left: unknown, right: unknown) => stableJson([...new Set(Array.isArray(left) ? left : [])].sort()) === stableJson([...new Set(Array.isArray(right) ? right : [])].sort());
  const normalizeId = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : value;
  for (const path of allowed) {
    if (/^(?:relationships|messages)\.\d+(?:\.|$)/.test(path)) {
      const [collection, index] = path.split(".");
      const old = (before as any)[collection]?.[Number(index)], next = (candidate as any)[collection]?.[Number(index)];
      if (!old || !next) continue;
      const reversed = old.sourceId === next.targetId && old.targetId === next.sourceId && old.type === next.type;
      if (!reversed && (normalizeId(old.sourceId) !== normalizeId(next.sourceId) && !identifierRename(`${collection}.${index}.sourceId`) || normalizeId(old.targetId) !== normalizeId(next.targetId) && !identifierRename(`${collection}.${index}.targetId`))) throw new Error("候选改变关系涉及的业务对象，没有唯一结构依据");
      if (normalizeId(old.type) !== normalizeId(next.type)) throw new Error("候选改变关系业务含义，没有唯一结构依据");
      if (stableJson(old.extensionPointIds) !== stableJson(next.extensionPointIds) && before.diagramKind === "usecase") {
        const points = before.useCases.find((item) => item.id === next.targetId)?.extensionPoints ?? [];
        if (points.length !== 1 || stableJson(next.extensionPointIds) !== stableJson([points[0].id])) throw new Error("扩展点选择涉及业务内容，没有唯一结构依据");
      }
    }
    if (/\.messageIds$/.test(path) && !equivalentIds(at(before, path), at(candidate, path))) throw new Error("候选增删或移动业务消息，已拒绝");
    if (/Multiplicity$|\.multiplicity$/.test(path)) {
      const numbers = (value: unknown) => typeof value === "string" ? value.match(/\d+|\*/g) : undefined;
      if (stableJson(numbers(at(before, path))) !== stableJson(numbers(at(candidate, path)))) throw new Error("候选改变多重性的业务数量，已拒绝");
    }
    if (/\.(?:systemBoundaryId|packageId|parentId|actorOrLane)$/.test(path) && normalizeId(at(before, path)) !== normalizeId(at(candidate, path))) {
      const uniqueBoundary = before.diagramKind === "usecase" && /\.systemBoundaryId$/.test(path) && before.systemBoundaries.length === 1 && at(candidate, path) === before.systemBoundaries[0].id;
      if (!uniqueBoundary && !identifierRename(path)) throw new Error("归属选择涉及业务内容，没有唯一结构依据");
    }
  }
  if ("activations" in before && "activations" in candidate) for (let i = 0; i < (before.activations?.length ?? 0); i++) {
    if (!allowed.has(`activations.${i}.startMessageId`)) continue;
    const old = before.activations![i], next = candidate.activations?.[i];
    if (!next || !equivalentIds([old.startMessageId, old.endMessageId], [next.startMessageId, next.endMessageId])) throw new Error("候选改变激活对应的业务消息，已拒绝");
  }
  const project = (model: ReviewModel) => {
    const copy = structuredClone(model) as any;
    for (const diagnostic of diagnostics) if (diagnostic.code === "duplicate-id") for (const path of [diagnostic.path, ...diagnostic.relatedPaths ?? []]) {
      const parts = path.split("."); const key = parts.pop()!;
      const parent = parts.reduce<any>((value, part) => value?.[part], copy);
      if (parent) delete parent[key];
    }
    for (const path of allowed) {
      if (/^(?:relationships|messages)\.\d+(?:\.|$)/.test(path) && !/Multiplicity$/.test(path)) {
        const [collection, index] = path.split(".");
        const edge = copy[collection]?.[Number(index)];
        if (edge) for (const field of ["sourceId", "targetId", "type", "extensionPointIds"]) delete edge[field];
      } else if (/\.(?:systemBoundaryId|packageId|parentId|actorOrLane|extensionPointIds|parentFragmentId|parentBranchId|messageIds|startMessageId|endMessageId|sourceMultiplicity|targetMultiplicity|multiplicity)$/.test(path)) {
        const parts = path.split("."); const key = parts.pop()!;
        const parent = parts.reduce<any>((value, part) => value?.[part], copy);
        if (parent) delete parent[key];
      }
    }
    return copy;
  };
  // Preserve business nodes, names, constraints, flow steps and relationship descriptions; only diagnosed structural fields may change.
  if (stableJson(project(candidate)) !== stableJson(project(before))) throw new Error("候选越过结构修复范围，涉及业务内容或无关字段");
  if (stableJson(candidate) === stableJson(before)) throw new Error("候选没有有效改动");
  validate?.(candidate);
  return structuredClone(candidate);
}
