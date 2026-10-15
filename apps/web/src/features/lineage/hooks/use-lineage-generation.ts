// Loads provenance independently of canvas rendering and cancels reads when its view leaves.
import { useEffect, useMemo, useState } from 'react';
import type { PlatformDocument, PlatformProjectMember, PlatformRunSummary } from '../../user-platform/services/platform-api';
import { projectLineageGeneration, type GenerationWorkspace, type LineageRunDetail } from '../lib/lineage-generation';
import type { LineageGraph } from '../lib/lineage-graph-model';
import { lineageRunCache } from '../services/lineage-run-cache';
export function useLineageGeneration(projectId: string | undefined, graph: LineageGraph, workspace: GenerationWorkspace, runs: PlatformRunSummary[], members: PlatformProjectMember[], documents: PlatformDocument[]) {
  const [loaded, setLoaded] = useState<{ projectId?: string; details: LineageRunDetail[] }>({ details: [] });
  // Overview polling supplies revisions, rather than creating a second polling loop here.
  const revisions = JSON.stringify(runs.map(run => [run.runId, run.status, run.updatedAt, run.completedAt, run.documentVersion, run.snapshotAvailable]));
  useEffect(() => {
    const controller = new AbortController();
    if (!projectId) return;
    const unique = [...new Map(runs.filter(run => run.snapshotAvailable !== false && (!run.projectId || run.projectId === projectId)).map(run => [run.runId, run])).values()];
    const availableIds = new Set(unique.map(run => run.runId));
    setLoaded(current => ({ projectId, details: current.projectId === projectId ? current.details.filter(detail => availableIds.has(detail.run.runId)) : [] }));
    for (const run of unique) void lineageRunCache.read(projectId, run, controller.signal).then(detail => {
      if (!controller.signal.aborted) setLoaded(current => ({ projectId, details: [...current.details.filter(item => item.run.runId !== run.runId), detail] }));
    }).catch(() => { /* Missing history or cancelled reads must not block the graph. */ });
    return () => controller.abort();
  }, [projectId, revisions, runs, workspace.rules, workspace.svgArtifacts, workspace.designSvgArtifacts]);
  return useMemo(() => projectLineageGeneration(graph, workspace, loaded.projectId === projectId ? loaded.details : [], members, documents), [graph, workspace, loaded, projectId, members, documents]);
}
