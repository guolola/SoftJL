// Verifies all durable category mappings and locale-independent generic fallbacks.
import { describe, expect, it } from 'vitest';
import { Scale, Target, Plug, AppWindow, Database, Gauge, Server, ShieldAlert, Orbit, GitFork, Route, UsersRound, Boxes, PanelsTopLeft, Network, ListOrdered, Layers3, ArrowRightLeft, Waypoints, Braces, Component, CloudCog, TableProperties, ListChecks } from 'lucide-react';
import { lineageIcon } from './lineage-icons';
import type { LineageNode } from './lineage-graph-model';
describe('lineage icons', () => {
  it.each(Object.entries({ '业务规则': Scale, '功能需求': Target, '外部接口': Plug, '界面需求': AppWindow, '数据需求': Database, '非功能需求': Gauge, '部署需求': Server, '异常处理': ShieldAlert }))('maps raw rule category %s', (ruleCategory, icon) => expect(lineageIcon({ kind: 'rule', payload: { ruleCategory } } as LineageNode)).toBe(icon));
  it.each(Object.entries({ context: Orbit, function: GitFork, activity: Route, usecase: UsersRound, class: Boxes, prototype: PanelsTopLeft, deployment: Network, analysis: ListOrdered }))('maps requirement kind %s', (diagramKind, icon) => expect(lineageIcon({ kind: 'requirement-model', payload: { diagramKind } } as LineageNode)).toBe(icon));
  it.each(Object.entries({ architecture: Layers3, sequence: ArrowRightLeft, navigation: Waypoints, class: Braces, component: Component, deployment: CloudCog, table: TableProperties }))('maps design kind %s', (designDiagramKind, icon) => expect(lineageIcon({ kind: 'design-model', payload: { designDiagramKind } } as LineageNode)).toBe(icon));
  it('uses generic fallbacks for unknown types and ignores translated names', () => {
    expect(lineageIcon({ kind: 'rule', payload: { ruleCategory: 'unknown' } } as unknown as LineageNode)).toBe(ListChecks);
    expect(lineageIcon({ kind: 'requirement-model', payload: {} })).toBe(Network);
    expect(lineageIcon({ kind: 'design-model', payload: {} })).toBe(Layers3);
    expect(lineageIcon({ kind: 'requirement-model', label: '功能结构图', payload: { diagramKind: 'function' } } as LineageNode)).toBe(lineageIcon({ kind: 'requirement-model', label: 'Function structure', payload: { diagramKind: 'function' } } as LineageNode));
  });
});
