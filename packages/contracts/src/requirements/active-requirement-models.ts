// Selects current use-case sources consistently before generation, persistence and fingerprinting.
function stringField(value: unknown, key: string): string {
  if (!value || typeof value !== "object") return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field.trim() : "";
}

export function useCaseScopedSourceId(model: unknown, prefix: "analysis" | "sequence", recordKey = "") {
  const explicit = stringField(model, "sourceUseCaseId");
  if (explicit) return explicit;
  const id = stringField(model, "modelId") || recordKey;
  return id.startsWith(`${prefix}:`) ? id.slice(prefix.length + 1) : "";
}

export function currentUseCaseSourceIds(models: readonly unknown[]): Set<string> | null {
  const useCaseModels = models.filter((model) => stringField(model, "diagramKind") === "usecase");
  const validIds = new Set<string>();
  let authoritative = false;
  for (const model of useCaseModels) {
    const useCases = (model as Record<string, unknown>).useCases;
    if (!Array.isArray(useCases)) continue;
    authoritative = true;
    for (const useCase of useCases) {
      const id = stringField(useCase, "id");
      if (id) validIds.add(id);
    }
  }
  return authoritative ? validIds : null;
}

export function activeRequirementModels<T>(models: readonly T[]): T[] {
  const validIds = currentUseCaseSourceIds(models);
  // Unknown provenance stays visible; only an explicit current use-case set can retire a source.
  return models.filter((model) => {
    if (!validIds || stringField(model, "diagramKind") !== "analysis") return true;
    const id = useCaseScopedSourceId(model, "analysis");
    return !id || validIds.has(id);
  });
}
