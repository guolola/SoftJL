// Enumerates every identified element, including structural and nested records, for provenance coverage.
export interface SourceElement {
  id: string;
  elementId: string;
  name: string;
  path: string;
  collection: string;
  value: Record<string, unknown>;
}

export function modelSourceElements(model: unknown): SourceElement[] {
  const result: SourceElement[] = [];
  const visit = (value: unknown, path: string, collection: string, parentId: string) => {
    if (Array.isArray(value)) { value.forEach((item, index) => visit(item, `${path}.${index}`, collection, parentId)); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : undefined;
    const elementId = id ? (parentId ? `${parentId}.${id}` : id) : parentId;
    if (id) result.push({ id, elementId, path, collection, value: record,
      name: String(record.name ?? record.label ?? record.risk ?? (record.sourceId && record.targetId ? `${record.sourceId} → ${record.targetId}` : id)) });
    for (const [field, child] of Object.entries(record)) visit(child, path ? `${path}.${field}` : field, field, elementId);
  };
  visit(model, "", "", "");
  return result;
}

// Unqualified nested IDs are accepted only when they identify one real element in this artifact.
export function resolveSourceElement(model: unknown, elementId: string) {
  const elements = modelSourceElements(model);
  const qualified = elements.filter(element => element.elementId === elementId);
  // Table foreign-key constraints and their derived relationship view share one
  // canonical identity. An exact qualified ID names that identity in both views.
  if (qualified.length) return qualified[0];
  const matches = elements.filter(element => element.id === elementId);
  return matches.length === 1 ? matches[0] : undefined;
}
