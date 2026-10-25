// Selects task dependencies and projects prompt-only evidence without changing stored models or trust decisions.

type Row = Record<string, any>;
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(row) : [];

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
