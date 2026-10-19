// Resolves model records and their artifacts without assuming model IDs equal diagram kinds.
import { umlDiagramKindSchema } from "./requirements.js";
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
  // Current singleton and use-case-scoped records use their diagram kind as the key prefix.
  const candidate = key.split(":", 1)[0];
  if (affected.has(candidate)) return true;
  const modelId = stringField(value, "modelId");
  return Boolean(modelId && modelId !== key && modelRecordBelongsToDiagramKinds(modelId, undefined, affected, models));
}

export function resolveModelArtifactIdentity(
  key: string,
  models: Record<string, unknown>,
  artifacts: Record<string, unknown> = {},
) {
  const keyKind = key.split(":", 1)[0];
  const diagramKind = umlDiagramKindSchema.parse(stringField(models[key], "diagramKind")
    ?? stringField(artifacts[key], "diagramKind")
    ?? keyKind);
  const modelId = stringField(models[key], "modelId")
    ?? stringField(artifacts[key], "modelId")
    ?? (key === diagramKind ? undefined : key);
  return { diagramKind, ...(modelId ? { modelId } : {}) };
}
