// Verifies adapting real dependency stages and status filters to the template canvas.
import { describe, expect, it } from 'vitest';
import { layoutLineageNodes, lineageFilterIds } from './lineage-canvas-layout';
import type { LineageGraph, LineageNode } from './lineage-graph-model';
const node = (id: string, stage: LineageNode['stage'], status: LineageNode['status'], upstreamIds: string[] = [], downstreamIds: string[] = []): LineageNode => ({ id, stage, status, kind: stage === 'requirement-rules' ? 'rule' : 'requirement-model', stageLabel: stage, label: id, eyebrow: '', description: '', reason: '', actionLabel: 'View', hasViewableArtifact: true, upstreamIds, downstreamIds, recentEvents: [] });
const graph: LineageGraph = {
  nodes: [node('rule', 'requirement-rules', 'current', [], ['model']), node('model', 'requirement-models', 'stale', ['rule'], ['design']), node('other', 'requirement-models', 'error'), node('design', 'design-models', 'current', ['model'], ['doc']), node('doc', 'documents', 'current', ['design'])],
  edges: [{ id: '1', source: 'rule', target: 'model', status: 'stale' }, { id: '2', source: 'model', target: 'design', status: 'stale' }, { id: '3', source: 'design', target: 'doc', status: 'default' }],
  summary: { total: 5, current: 3, stale: 1, error: 1, interrupted: 0, running: 0, notGenerated: 0 }, defaultSelectedNodeId: 'rule'
};
describe('lineage canvas adapter', () => {
  it('keeps stages in dependency order and leaves room between sibling nodes', () => {
    const positions = layoutLineageNodes(graph);
    expect(positions.rule.x).toBeLessThan(positions.model.x);
    expect(positions.model.x).toBeLessThan(positions.design.x);
    expect(positions.design.x).toBeLessThan(positions.doc.x);
    expect(positions.model.x).toBe(positions.other.x);
    expect(Math.abs(positions.model.y - positions.other.y)).toBeGreaterThan(100);
  });
  it('filters stale and failed nodes without changing dependency data', () => {
    expect([...lineageFilterIds(graph, 'stale', null)]).toEqual(['model']);
    expect([...lineageFilterIds(graph, 'error', null)]).toEqual(['other']);
    expect(graph.edges).toHaveLength(3);
  });
  it('highlights the complete upstream and downstream path, excluding unrelated siblings', () => {
    expect(lineageFilterIds(graph, 'impact', 'model')).toEqual(new Set(['rule', 'model', 'design', 'doc']));
    expect(lineageFilterIds(graph, 'impact', null).size).toBe(5);
  });
});
