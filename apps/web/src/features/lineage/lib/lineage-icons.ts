// Resolves icons from durable type identifiers, independent of display language.
import { Scale, Target, Plug, AppWindow, Database, Gauge, Server, ShieldAlert, Orbit, GitFork, Route, UsersRound, Boxes, PanelsTopLeft, Network, ListOrdered, Layers3, ArrowRightLeft, Waypoints, Braces, Component, CloudCog, TableProperties, ListChecks, FileText, type LucideIcon } from 'lucide-react';
import type { RuleCategory } from '../../../entities/requirement-rule/model';
import type { DiagramKind, DesignDiagramKind } from '@uml-platform/contracts';
import type { LineageNode } from './lineage-graph-model';

export const RULE_ICONS: Record<RuleCategory, LucideIcon> = {
  '业务规则': Scale, '功能需求': Target, '外部接口': Plug, '界面需求': AppWindow,
  '数据需求': Database, '非功能需求': Gauge, '部署需求': Server, '异常处理': ShieldAlert,
};
export const REQUIREMENT_ICONS: Record<DiagramKind, LucideIcon> = {
  context: Orbit, function: GitFork, activity: Route, usecase: UsersRound,
  class: Boxes, prototype: PanelsTopLeft, deployment: Network, analysis: ListOrdered,
};
export const DESIGN_ICONS: Record<DesignDiagramKind, LucideIcon> = {
  architecture: Layers3, sequence: ArrowRightLeft, navigation: Waypoints, class: Braces,
  component: Component, deployment: CloudCog, table: TableProperties,
};
export function lineageIcon(node: Pick<LineageNode, 'kind' | 'payload'>): LucideIcon {
  if (node.kind === 'rule') return RULE_ICONS[node.payload?.ruleCategory as RuleCategory] ?? ListChecks;
  if (node.kind === 'requirement-model') return REQUIREMENT_ICONS[node.payload?.diagramKind as DiagramKind] ?? Network;
  if (node.kind === 'design-model') return DESIGN_ICONS[node.payload?.designDiagramKind as DesignDiagramKind] ?? Layers3;
  return FileText;
}
