// Projects provenance only when the current artifact and its own timed generation events agree.
import { runEventSchema, type RunEvent } from '@uml-platform/contracts';
import type { PlatformDocument, PlatformProjectMember, PlatformRunSummary } from '../../user-platform/services/platform-api';
import type { RunHistorySnapshot } from '../../../entities/run-history';
import type { WorkspaceSessionState } from '../../workspace-session/model/session-state';
import type { LineageGraph, LineageNode } from './lineage-graph-model';

export type LineageRunDetail = { run: PlatformRunSummary; snapshot?: RunHistorySnapshot; events?: unknown[] };
export type GenerationInfo = {
  instanceId: string; label: string; generated: boolean; updatedAt?: string;
  runId?: string; userId?: string; member?: PlatformProjectMember;
  startedAt?: string; completedAt?: string; durationMs?: number;
  scope: 'instance' | 'rules-batch' | 'document';
};
export type NodeGenerationInfo = { representative?: GenerationInfo; instances: GenerationInfo[] };
export type GenerationWorkspace = Pick<WorkspaceSessionState, 'rules' | 'models' | 'svgArtifacts' | 'designModels' | 'designSvgArtifacts' | 'historyItems'>;
type Model = { modelId?: string; diagramKind: string; title: string };
type Svg = { modelId?: string; diagramKind: string; svg: string; renderMeta?: { generatedAt?: string } };
type Target = GenerationInfo & { diagramKind?: string; model?: Model; svg?: Svg; singleInstance?: boolean; documentId?: string; documentVersion?: number };
const time = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined;
// Canonical object keys let snapshots compare reliably without relying on translated labels.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => JSON.stringify(key) + ':' + canonical(entry)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
function batch(rules: GenerationWorkspace['rules']) { return canonical([...rules].sort((a, b) => a.id.localeCompare(b.id))); }
function targets(node: LineageNode, workspace: GenerationWorkspace, documents: PlatformDocument[]): Target[] {
  if (node.kind === 'rule') return workspace.rules?.some(rule => rule.id === node.payload?.ruleId)
    ? [{ instanceId: node.payload!.ruleId!, label: node.label, generated: true, scope: 'rules-batch' }] : [];
  if (node.kind === 'document') {
    const history = workspace.historyItems?.find(item => (item.documentKind ?? (item.snapshot && 'documentKind' in item.snapshot ? item.snapshot.documentKind : undefined)) === node.payload?.documentKind && (item.status ?? item.snapshot?.status) === 'completed');
    const snapshot = history?.snapshot;
    const documentId = history?.documentId ?? (snapshot && 'documentId' in snapshot ? snapshot.documentId : undefined);
    if (!node.hasViewableArtifact || !documentId) return [];
    const document = documents.find(item => item.id === documentId);
    return [{ instanceId: documentId, documentId, documentVersion: document?.version ?? history?.documentVersion ?? undefined, label: node.label, generated: true, scope: 'document', updatedAt: document?.updatedAt ?? document?.createdAt ?? undefined }];
  }
  const design = node.kind === 'design-model';
  const kind = design ? node.payload?.designDiagramKind : node.payload?.diagramKind;
  const models = Object.values((design ? workspace.designModels : workspace.models) ?? {}).filter((model): model is NonNullable<typeof model> => !!model && model.diagramKind === kind);
  const svgs = Object.values((design ? workspace.designSvgArtifacts : workspace.svgArtifacts) ?? {}).filter((svg): svg is NonNullable<typeof svg> => !!svg && svg.diagramKind === kind);
  const ids = new Set([...models, ...svgs].map(item => item.modelId ?? item.diagramKind));
  return [...ids].map(instanceId => {
    const model = models.find(item => (item.modelId ?? item.diagramKind) === instanceId);
    const svg = svgs.find(item => (item.modelId ?? item.diagramKind) === instanceId);
    return { instanceId, label: model?.title ?? node.label, diagramKind: kind, model, svg, singleInstance: ids.size === 1, generated: true, scope: 'instance', updatedAt: svg?.renderMeta?.generatedAt };
  });
}
function snapshotMatches(node: LineageNode, target: Target, workspace: GenerationWorkspace, detail: LineageRunDetail) {
  const snapshot = detail.snapshot;
  if (!snapshot) return false;
  if (node.kind === 'document') return !!target.documentId && 'documentKind' in snapshot && snapshot.documentKind === node.payload?.documentKind && snapshot.documentId === target.documentId && (!target.documentVersion || detail.run.documentVersion === target.documentVersion);
  if (node.kind === 'rule') return 'rules' in snapshot && !('designModelTraceability' in snapshot) && batch(snapshot.rules) === batch(workspace.rules);
  if (!('models' in snapshot) || (node.kind === 'design-model') !== ('designModelTraceability' in snapshot)) return false;
  const model = snapshot.models.find(item => (item.modelId ?? item.diagramKind) === target.instanceId && item.diagramKind === target.diagramKind);
  const svg = snapshot.svgArtifacts.find(item => (item.modelId ?? item.diagramKind) === target.instanceId && item.diagramKind === target.diagramKind);
  return (!target.model || canonical(model) === canonical(target.model)) && (!target.svg || (svg?.svg === target.svg.svg && svg?.renderMeta?.generatedAt === target.svg.renderMeta?.generatedAt));
}
function ownEvent(event: RunEvent, target: Target, starting = false) {
  if (!('diagramKind' in event) || event.diagramKind !== target.diagramKind) return false;
  if ('modelId' in event && event.modelId) return event.modelId === target.instanceId;
  if ('subtaskId' in event && event.subtaskId) return event.subtaskId === target.instanceId || ((target.instanceId === target.diagramKind || (starting && target.singleInstance)) && event.subtaskId === target.diagramKind);
  return target.instanceId === target.diagramKind || !!(starting && target.singleInstance);
}
function timing(target: Target, events: RunEvent[]) {
  const starts = events.filter(event => target.scope === 'instance'
    ? event.type === 'stage_progress' && ownEvent(event, target, true) && event.subtaskStatus === 'running' && (event.stage === 'generate_models' || event.stage === 'generate_design_models' || event.stage === 'generate_design_sequence')
    : event.type === 'stage_started' && event.stage === (target.scope === 'rules-batch' ? 'extract_rules' : 'generate_document_text'));
  const ends = events.filter(event => event.type === 'artifact_ready' && (target.scope === 'instance'
    ? event.artifactKind === (target.svg ? 'svg' : 'model') && ownEvent(event, target)
    : event.artifactKind === (target.scope === 'rules-batch' ? 'rules' : 'document')));
  // Untimed legacy events must not imply ownership or a fabricated zero duration.
  // Events arrive in emission order. A later repair/progress timestamp cannot replace a missing first start.
  const start = starts[0]?.createdAt;
  const end = ends.at(-1)?.createdAt;
  if (time(start) === undefined || time(end) === undefined || Date.parse(end!) < Date.parse(start!)) return undefined;
  // A copied SVG in a later run is not a new artifact, even if that run emits generic readiness.
  const updated = time(target.updatedAt);
  if (target.scope === 'instance' && updated !== undefined && (updated < Date.parse(start!) || updated > Date.parse(end!))) return undefined;
  return { startedAt: start!, completedAt: end!, durationMs: Date.parse(end!) - Date.parse(start!) };
}
export function projectLineageGeneration(graph: LineageGraph, workspace: GenerationWorkspace, details: LineageRunDetail[], members: PlatformProjectMember[], documents: PlatformDocument[] = []): Record<string, NodeGenerationInfo> {
  const parsed = details.map(detail => ({ detail, events: (detail.events ?? []).flatMap(value => { const result = runEventSchema.safeParse(value); return result.success ? [result.data] : []; }) }));
  return Object.fromEntries(graph.nodes.map(node => {
    const current = targets(node, workspace, documents);
    if (!current.length && node.hasViewableArtifact) current.push({ instanceId: node.id, label: node.label, generated: true, scope: node.kind === 'rule' ? 'rules-batch' : node.kind === 'document' ? 'document' : 'instance' });
    const instances: GenerationInfo[] = current.map(target => {
      const matches = parsed.flatMap(({ detail, events }) => {
        if (!snapshotMatches(node, target, workspace, detail)) return [];
        const clock = timing(target, events);
        return clock ? [{ detail, clock }] : [];
      }).sort((a, b) => Date.parse(b.clock.completedAt) - Date.parse(a.clock.completedAt));
      const match = matches[0];
      const { model: _model, svg: _svg, singleInstance: _single, diagramKind: _kind, documentId: _document, documentVersion: _version, ...info } = target;
      if (!match) return info;
      const userId = match.detail.run.createdByUserId ?? undefined;
      return { ...info, ...match.clock, updatedAt: info.updatedAt ?? match.clock.completedAt, runId: match.detail.run.runId, userId, member: members.find(member => !!userId && member.userId === userId) };
    });
    const representative = [...instances].sort((a, b) => (time(b.updatedAt) ?? -1) - (time(a.updatedAt) ?? -1))[0];
    return [node.id, { instances, representative }];
  }));
}
export function formatGenerationDuration(durationMs: number, locale: string) {
  if (durationMs < 60_000) return new Intl.NumberFormat(locale, { maximumFractionDigits: durationMs < 1000 ? 3 : 1 }).format(durationMs / 1000) + 's';
  const seconds = Math.floor(durationMs / 1000);
  return seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s`;
}
