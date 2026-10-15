// Deterministically derives persisted requirement-to-context mappings from context source IDs.
import type { ContextDiagramSpec, ContextTraceRow } from "@uml-platform/contracts";

export function buildContextTraceability(model: ContextDiagramSpec): ContextTraceRow[] {
  const rows: ContextTraceRow[] = [
    ...model.people.flatMap((element) =>
      element.sourceRequirementIds.map((requirementId) => ({
        requirementId,
        targetId: element.id,
        targetKind: "person" as const,
        targetLabel: element.name,
      })),
    ),
    ...model.externalSystems.flatMap((element) =>
      element.sourceRequirementIds.map((requirementId) => ({
        requirementId,
        targetId: element.id,
        targetKind: "external-system" as const,
        targetLabel: element.name,
      })),
    ),
    ...model.relationships.flatMap((relationship) =>
      relationship.sourceRequirementIds.map((requirementId) => ({
        requirementId,
        targetId: relationship.id,
        targetKind: "relationship" as const,
        targetLabel: relationship.label,
      })),
    ),
  ];
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.requirementId.trim().toLowerCase()}:${row.targetKind}:${row.targetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
