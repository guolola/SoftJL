// Derives compact provenance badges for sidebar diagram entries from existing workflow state.
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import { DIAGRAM_META, DESIGN_DIAGRAM_META, type DesignDiagramType } from "../../../entities/diagram/model";

function formatRuleId(id: string) {
  const value = id.trim();
  const match = /^r(\d+)$/i.exec(value);
  return match ? `R${match[1]}` : value;
}

export type RequirementTraceBadge = {
  label: string;
  fullLabel: string;
};

export function buildRequirementDiagramTraceBadge(
  rules: RequirementRule[],
): RequirementTraceBadge | undefined {
  const ruleIds = Array.from(
    new Set(rules.map((rule) => formatRuleId(rule.id)).filter(Boolean)),
  );
  if (ruleIds.length === 0) {
    return undefined;
  }

  const visibleIds = ruleIds.slice(0, 3);
  return {
    label:
      ruleIds.length > visibleIds.length
        ? `${visibleIds.join(" ")} +${ruleIds.length - visibleIds.length}`
        : visibleIds.join(" "),
    fullLabel: ruleIds.join(", "),
  };
}

const DESIGN_UPSTREAM_BADGES: Record<DesignDiagramType, string[]> = {
  architecture: [DIAGRAM_META.function.label],
  sequence: [DIAGRAM_META.usecase.label, DIAGRAM_META.analysis.label],
  class: [DIAGRAM_META.class.label, DESIGN_DIAGRAM_META.sequence.label],
  navigation: [DIAGRAM_META.prototype.label, DESIGN_DIAGRAM_META.sequence.label],
  table: [DESIGN_DIAGRAM_META.class.label],
  component: [DESIGN_DIAGRAM_META.class.label],
  deployment: [DIAGRAM_META.deployment.label, DESIGN_DIAGRAM_META.component.label],
};

export function buildDesignDiagramTraceBadge(diagram: DesignDiagramType) {
  return DESIGN_UPSTREAM_BADGES[diagram];
}
