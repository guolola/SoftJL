// Resolves icons from durable type identifiers, independent of display language.
import { Network, Layers3, ListChecks, FileText, type LucideIcon } from 'lucide-react';
import { REQUIREMENT_DIAGRAM_ICON, DESIGN_DIAGRAM_ICON } from '../../../entities/diagram/model-icons';
import type { RequirementRuleType } from '@uml-platform/contracts';
import { RULE_KIND_ICON as RULE_ICONS } from '../../../entities/requirement-rule/model-icons';
import type { DiagramKind, DesignDiagramKind } from '@uml-platform/contracts';
import type { LineageNode } from './lineage-graph-model';

export { RULE_KIND_ICON as RULE_ICONS } from '../../../entities/requirement-rule/model-icons';
export const REQUIREMENT_ICONS = REQUIREMENT_DIAGRAM_ICON;
export const DESIGN_ICONS = DESIGN_DIAGRAM_ICON;
export function lineageIcon(node: Pick<LineageNode, 'kind' | 'payload'>): LucideIcon {
  if (node.kind === 'rule') return RULE_ICONS[node.payload?.ruleKind as RequirementRuleType] ?? ListChecks;
  if (node.kind === 'requirement-model') return REQUIREMENT_ICONS[node.payload?.diagramKind as DiagramKind] ?? Network;
  if (node.kind === 'design-model') return DESIGN_ICONS[node.payload?.designDiagramKind as DesignDiagramKind] ?? Layers3;
  return FileText;
}
