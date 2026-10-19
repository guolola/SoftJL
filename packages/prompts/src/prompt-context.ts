// Selects task dependencies and projects prompt-only evidence without changing stored models or trust decisions.
import { requirementBaselinePromptContext, designDependencies, designRequirementSources, type AnyDiagramModel, type ModelingStage, type RequirementBaseline } from "@uml-platform/contracts";

type Row = Record<string, any>;
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(row) : [];
// Singleton models use their diagram kind as identity; explicit references must match that identity.
const refMatches = (ref: Row, model: Row) => ref.diagramKind === model.diagramKind && (!ref.modelId || ref.modelId === (model.modelId ?? model.diagramKind));

export function compactPromptRules(value: unknown): unknown {
  // Classification carries scopes, acceptance criteria and context references absent from rule text.
  return Array.isArray(value) ? rows(value).map(({ id, text, type }) => ({ id, text, type })) : value;
}

// References resolve against complete source models or the deduplicated element index; provenance remains explicit.
export function compactPromptTraceability(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const ref = (value: unknown) => {
    const r = row(value);
    return [r.modelId ?? null, r.diagramKind, r.elementId];
  };
  return rows(value).map((entry) => {
    if (!entry.source && !entry.target) {
      const { targetLabel: _label, ...rest } = entry;
      return rest;
    }
    return {
      ...(entry.ruleId ? { ruleId: entry.ruleId } : {}),
      ...(entry.source ? { source: ref(entry.source) } : {}),
      ...(entry.target ? { target: ref(entry.target) } : {}),
      ...(entry.targets ? { targets: rows(entry.targets).map(ref) } : {}),
      ...(entry.upstreamDesignRefs ? { upstreamDesignRefs: rows(entry.upstreamDesignRefs).map(ref) } : {}),
      ...(entry.mappingSource ? { mappingSource: entry.mappingSource } : {}),
      ...(entry.reviewStatus ? { reviewStatus: entry.reviewStatus } : {}),
      ...(entry.confidence ? { confidence: entry.confidence } : {}),
      ...((entry.reviewStatus === "pending" || entry.confidence === "low" || /相似|similar|候选/i.test(entry.rationale ?? "")) && entry.rationale ? { rationale: entry.rationale } : {}),
    };
  });
}

export function scopeUseCaseModelForPrompt<T extends Row>(source: T, useCaseId: string): T {
  if (source.diagramKind !== "usecase") return source;
  const useCases = rows(source.useCases);
  if (!useCases.some((item) => item.id === useCaseId)) return source;
  const ids = new Set([useCaseId]);
  // Include/extend/generalization dependencies are authoritative even when not yet traced.
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of rows(source.relationships)) {
      if (edge.type === "association" || ![edge.sourceId, edge.targetId].some((id) => ids.has(id))) continue;
      for (const id of [edge.sourceId, edge.targetId]) if (useCases.some((item) => item.id === id) && !ids.has(id)) { ids.add(id); changed = true; }
    }
  }
  const retained = new Set([...ids, ...rows(source.actors).map((actor) => actor.id), ...rows(source.systemBoundaries).map((boundary) => boundary.id)]);
  // The selected case stays first for single-target callers; dependencies provide read-only evidence.
  return { ...source, useCases: [useCases.find((item) => item.id === useCaseId)!, ...useCases.filter((item) => item.id !== useCaseId && ids.has(item.id))],
    relationships: rows(source.relationships).filter((edge) => retained.has(edge.sourceId) && retained.has(edge.targetId)) };
}

export function selectPromptUpstreamModels(stage: ModelingStage, model: AnyDiagramModel, candidates: unknown): unknown[] {
  const sources = rows(candidates);
  const useCaseId = (model.diagramKind === "analysis" || model.diagramKind === "sequence")
    ? model.sourceUseCaseId ?? model.modelId?.match(/^(?:analysis|sequence):(.+)$/)?.[1] : undefined;
  if (model.diagramKind === "analysis" || model.diagramKind === "sequence") {
    return sources.filter((source) => source.diagramKind === "usecase" || (model.diagramKind === "sequence" && source.diagramKind === "analysis" &&
      (!useCaseId || source.sourceUseCaseId === useCaseId || source.modelId === `analysis:${useCaseId}`)))
      .map((source) => source.diagramKind === "usecase" && useCaseId ? scopeUseCaseModelForPrompt(source, useCaseId) : source);
  }
  if (stage !== "design") return [];
  const kinds = new Set([...(designRequirementSources[model.diagramKind] ?? []), ...(designDependencies[model.diagramKind] ?? [])]);
  return sources.filter((source) => kinds.has(source.diagramKind));
}

export function reviewPromptContext(stage: ModelingStage, model: AnyDiagramModel, value: unknown): unknown {
  const basis = row(value);
  if (!Object.keys(basis).length) return value ?? {};
  const rules = compactPromptRules(basis.rules);
  const upstreamModels = selectPromptUpstreamModels(stage, model, basis.upstreamModels);
  const traceability = Array.isArray(basis.traceability) ? rows(basis.traceability).filter((entry) =>
    entry.source ? refMatches(row(entry.source), model) : entry.target ? refMatches(row(entry.target), model) : true) : basis.traceability;
  const targetRefs = rows(traceability).flatMap((entry) => rows(entry.targets));
  // Some design mappings point outside the structural inputs (for example a component's domain target).
  // Retain each such identity once so compact references remain understandable without resending whole models.
  const referenceIndex = [...new Map(targetRefs.filter(ref => !upstreamModels.some(source => refMatches(ref, row(source))))
    .map(({ modelId, diagramKind, elementId, elementKind, label }) => [JSON.stringify([modelId, diagramKind, elementId]), { modelId, diagramKind, elementId, elementKind, label }])).values()];
  const requirementTraceability = Array.isArray(basis.requirementTraceability) ? rows(basis.requirementTraceability).filter((entry) =>
    targetRefs.some((ref) => refMatches(row(entry.target), ref) && row(entry.target).elementId === ref.elementId)) : basis.requirementTraceability;
  return {
    ...basis,
    ...(basis.baseline ? { baseline: requirementBaselinePromptContext(basis.baseline as RequirementBaseline, Array.isArray(rules) ? rows(rules).map((rule) => rule.id) : false) } : {}),
    ...(rules ? { rules } : {}),
    ...(basis.upstreamModels ? { upstreamModels } : {}),
    ...(traceability ? { traceability: compactPromptTraceability(traceability) } : {}),
    ...(requirementTraceability ? { requirementTraceability: compactPromptTraceability(requirementTraceability) } : {}),
    ...(referenceIndex.length ? { referenceIndex } : {}),
    referenceFormat: "引用数组为 [modelId或null, diagramKind, elementId]；pending/低置信映射仅用于定位，不能作为业务已确认的证明。",
  };
}

export function structuralRepairPromptModel(model: AnyDiagramModel, diagnostics: unknown): unknown {
  const paths = rows(diagnostics).map(item => item.path).filter((path): path is string => typeof path === "string" && path.length > 0);
  if (!paths.length || paths.some(path => !path.includes("."))) return model;
  const source = model as unknown as Row;
  const targets = [...new Set(paths.map(path => path.split(".").slice(0, 2).join(".")))].map(path => {
    const [key, index] = path.split(".");
    return { path, value: source[key]?.[index] };
  });
  const ids = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === "string") ids.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  targets.forEach(target => collect(target.value));
  const foldedIds = new Set([...ids].map(id => id.toLowerCase()));
  const collections = Object.entries(source).filter(([, value]) => Array.isArray(value));
  const dependencies = Object.fromEntries(collections.map(([key, value]) =>
    [key, rows(value).filter(item => typeof item.id === "string" && foldedIds.has(item.id.toLowerCase()) && !targets.some(target => target.value === item))]).filter(([, value]) => (value as unknown[]).length));
  const referenceIndex = Object.fromEntries(collections.map(([key, value]) => [key, rows(value).filter(item => item.id).map(({ id, name, parentFragmentId, parentBranchId }) => ({ id, name, parentFragmentId, parentBranchId }))]));
  return { diagramKind: model.diagramKind, modelId: model.modelId, title: model.title, targets, dependencies, referenceIndex };
}

export function modelTaskSourcePrompt(prompt: string): string {
  // Global repairs need constraints and explicit target identity as well as structural sources.
  const headings = ["RequirementBaseline（只用于约束和验收边界）：", "本次目标用例：", "需求阶段用例模型：", "需求阶段来源模型：", "单用例需求阶段用例模型（唯一分析来源）："];
  const positions = headings.map(heading => prompt.indexOf(heading)).filter(index => index >= 0);
  return positions.length ? prompt.slice(Math.min(...positions)) : prompt;
}
