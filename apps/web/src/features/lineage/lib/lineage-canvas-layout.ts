// Adapts derived lineage stages to the supplied template's left-to-right stage columns.
import { LINEAGE_STAGE_ORDER, collectLineagePath, type LineageGraph, type LineageNode } from './lineage-graph-model';
export type LineageFilter = 'all' | 'stale' | 'error' | 'impact';
export type CanvasPositions = Record<string, { x: number; y: number }>;
export function layoutLineageNodes(graph: LineageGraph): CanvasPositions {
  const positions: CanvasPositions = {};
  LINEAGE_STAGE_ORDER.forEach((stage, column) => {
    const nodes = graph.nodes.filter(node => node.stage === stage);
    nodes.forEach((node, row) => {
      positions[node.id] = { x: column * 380, y: row * 180 };
    });
  });
  return positions;
}
export function lineageFilterIds(graph: LineageGraph, filter: LineageFilter, selectedId: string | null): Set<string> {
  if (filter === 'impact' && selectedId) return collectLineagePath(graph, selectedId);
  return new Set(graph.nodes.filter((node: LineageNode) => filter === 'all' || filter === 'impact' || node.status === filter).map(node => node.id));
}
