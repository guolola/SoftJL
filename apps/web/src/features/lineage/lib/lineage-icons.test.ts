// Verifies all durable category mappings and locale-independent generic fallbacks.
import { describe, expect, it } from 'vitest';
import { Scale, Target, Gauge, ShieldCheck, Database, LayoutPanelTop, Plug, TriangleAlert, Network, Layers3, ListChecks } from 'lucide-react';
import { REQUIREMENT_DIAGRAM_ICON, DESIGN_DIAGRAM_ICON } from '../../../entities/diagram/model-icons';
import { lineageIcon } from './lineage-icons';
import type { LineageNode } from './lineage-graph-model';
describe('lineage icons', () => {
  it.each(Object.entries({ 'business-rule': Scale, functional: Target, quality: Gauge, operations: ShieldCheck, data: Database, interaction: LayoutPanelTop, interface: Plug, exception: TriangleAlert }))('maps raw rule category %s', (ruleKind, icon) => expect(lineageIcon({ kind: 'rule', payload: { ruleKind } } as unknown as LineageNode)).toBe(icon));
  it.each(Object.entries(REQUIREMENT_DIAGRAM_ICON))('shares the requirement category icon for %s', (diagramKind, icon) => expect(lineageIcon({ kind: 'requirement-model', payload: { diagramKind } } as unknown as LineageNode)).toBe(icon));
  it.each(Object.entries(DESIGN_DIAGRAM_ICON))('shares the design category icon for %s', (designDiagramKind, icon) => expect(lineageIcon({ kind: 'design-model', payload: { designDiagramKind } } as unknown as LineageNode)).toBe(icon));
  it('uses generic fallbacks for unknown types and ignores translated names', () => {
    expect(lineageIcon({ kind: 'rule', payload: { ruleKind: 'unknown' } } as unknown as unknown as LineageNode)).toBe(ListChecks);
    expect(lineageIcon({ kind: 'requirement-model', payload: {} })).toBe(Network);
    expect(lineageIcon({ kind: 'design-model', payload: {} })).toBe(Layers3);
    expect(lineageIcon({ kind: 'requirement-model', label: '功能结构图', payload: { diagramKind: 'function' } } as unknown as LineageNode)).toBe(lineageIcon({ kind: 'requirement-model', label: 'Function structure', payload: { diagramKind: 'function' } } as unknown as LineageNode));
  });
});
