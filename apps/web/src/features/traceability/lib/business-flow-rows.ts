// Builds activity trace rows from persisted mappings only; missing and invalid rule references remain visible.
import type { FeasibilityBusinessFlowArtifact, RequirementRule } from "@uml-platform/contracts";
import { buildDiagramDetailModel } from "../../../entities/diagram/lib/model-details";
import { DEFAULT_TRACEABILITY_ROW_COPY, formatRuleId, type ElementRow, type TraceabilityRowCopy } from "./traceability-rows";

export function buildBusinessFlowRows(
  artifact: FeasibilityBusinessFlowArtifact | null,
  rules: RequirementRule[],
  copy: TraceabilityRowCopy = DEFAULT_TRACEABILITY_ROW_COPY,
): ElementRow[] {
  if (!artifact) return [];
  const detail = buildDiagramDetailModel(artifact.model);
  const rulesById = new Map(rules.map((rule) => [rule.id.trim().toLowerCase(), rule]));
  const itemsById = new Map(detail.items.map((item) => [item.id, item]));
  const row = (id: string, targetKind: "swimlane" | "node" | "relationship", label: string, typeLabel: string, subtitle?: string): ElementRow => {
    const mappings = artifact.traceability.filter((entry) => entry.targetKind === targetKind && entry.targetId === id);
    const sourceIds = [...new Set(mappings.map((entry) => entry.requirementId.trim()))];
    const invalidIds = sourceIds.filter((sourceId) => !rulesById.has(sourceId.toLowerCase()));
    const requirementRules = sourceIds.map((sourceId) => rulesById.get(sourceId.toLowerCase()))
      .filter((rule): rule is RequirementRule => Boolean(rule));
    return {
      id: `business-flow:${targetKind}:${id}`, label, typeLabel,
      subtitle: subtitle || copy.context.noDescription,
      groupKey: `business-flow:${typeLabel}`, groupLabel: typeLabel,
      scopeKey: `business-flow:${artifact.model.modelId}`,
      status: sourceIds.length > 0 && invalidIds.length === 0 ? "mapped" : "unmapped",
      mappingNote: invalidIds.length > 0 ? copy.context.invalidSources(invalidIds.join(", "))
        : sourceIds.length === 0 ? copy.context.missingSource : null,
      requirementRules,
      requirementElements: [], upstreamDesignElements: [],
      detailLines: [
        copy.context.sourceRules(sourceIds.join(", ") || copy.context.unmapped),
        ...requirementRules.map((rule) => `${formatRuleId(rule.id)} [${rule.category}] ${rule.text}`),
      ],
    };
  };
  return [
    ...detail.items.map((item) => row(item.id, item.kind === "swimlane" ? "swimlane" : "node", item.label, copy.semanticKindLabel(item.kind), item.description)),
    ...detail.relationships.map((relation) => row(relation.id, "relationship",
      `${itemsById.get(relation.sourceId)?.label ?? relation.sourceId} → ${itemsById.get(relation.targetId)?.label ?? relation.targetId}`,
      copy.context.relationships, relation.label)),
  ];
}
