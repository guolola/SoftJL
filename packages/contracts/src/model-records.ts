// Resolves model records and their artifacts without assuming model IDs equal diagram kinds.
function stringField(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result = (value as Record<string, unknown>)[field];
  return typeof result === "string" ? result : undefined;
}

export function findModelByDiagramKind<T>(
  models: Record<string, T | undefined>,
  diagramKind: string,
): T | undefined {
  const direct = models[diagramKind];
  return stringField(direct, "diagramKind") === diagramKind
    ? direct
    : Object.values(models).find((model) => stringField(model, "diagramKind") === diagramKind);
}

export function modelRecordBelongsToDiagramKinds(
  key: string,
  value: unknown,
  diagramKinds: Iterable<string>,
  models: Record<string, unknown> = {},
): boolean {
  const affected = new Set(diagramKinds);
  // String sources and error records inherit their type from the associated model.
  const kind = stringField(value, "diagramKind") ?? stringField(models[key], "diagramKind");
  if (kind) return affected.has(kind);
  // Keep legacy kind keys and scoped IDs readable when model metadata is unavailable.
  const candidate = key.split(":", 1)[0];
  if (affected.has(candidate)) return true;
  if (candidate.startsWith("design-") && affected.has(candidate.slice("design-".length))) return true;
  const modelId = stringField(value, "modelId");
  return Boolean(modelId && modelId !== key && modelRecordBelongsToDiagramKinds(modelId, undefined, affected, models));
}

export function resolveModelArtifactIdentity(
  key: string,
  models: Record<string, unknown>,
  artifacts: Record<string, unknown> = {},
) {
  const legacyKind = key.split(":", 1)[0];
  const diagramKind = stringField(models[key], "diagramKind")
    ?? stringField(artifacts[key], "diagramKind")
    ?? (legacyKind.startsWith("design-") ? legacyKind.slice("design-".length) : legacyKind);
  const modelId = stringField(models[key], "modelId")
    ?? stringField(artifacts[key], "modelId")
    ?? (key === diagramKind ? undefined : key);
  return { diagramKind, ...(modelId ? { modelId } : {}) };
}
