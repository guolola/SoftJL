// Covers current-version provenance across parallel branches, retries, and preserved artifacts.
import { describe, expect, it } from 'vitest';
import { runSnapshotSchema, designRunSnapshotSchema, documentRunSnapshotSchema } from '@uml-platform/contracts';
import { projectLineageGeneration, formatGenerationDuration, type GenerationWorkspace, type LineageRunDetail } from './lineage-generation';
import type { LineageGraph, LineageNode } from './lineage-graph-model';
import type { PlatformProjectMember } from '../../user-platform/services/platform-api';
const at = (ms: number) => new Date(Date.UTC(2026, 9, 9) + ms).toISOString();
const member: PlatformProjectMember = { id: 'member', projectId: 'project', userId: 'alice', displayName: 'Alice Wang', email: 'alice@example.test', avatarUrl: '/avatar.png', role: 'owner', status: 'active' };
const node = (overrides: Partial<LineageNode> = {}): LineageNode => ({ id: 'node', kind: 'requirement-model', stage: 'requirement-models', stageLabel: '', label: 'Function', eyebrow: '', description: '', status: 'current', reason: '', actionLabel: '', hasViewableArtifact: true, upstreamIds: [], downstreamIds: [], recentEvents: [], payload: { diagramKind: 'function' }, ...overrides });
const graph = (entry = node()): LineageGraph => ({ nodes: [entry], edges: [], summary: { total: 1, current: 1, stale: 0, error: 0, interrupted: 0, running: 0, notGenerated: 0 }, defaultSelectedNodeId: null });
const rule = { id: 'r1', category: '功能需求' as const, text: 'Users log in', relatedDiagrams: ['function' as const] };
const empty: GenerationWorkspace = { rules: [], models: {}, svgArtifacts: {}, designModels: {}, designSvgArtifacts: {}, historyItems: [] };
function fixture(kind = 'function', id = kind, start = 100, finish = 1500) {
  const model = { diagramKind: kind, modelId: id, title: id, elements: [] };
  const svg = { diagramKind: kind, modelId: id, svg: `<svg>${id}-${finish}</svg>`, renderMeta: { engine: 'plantuml', generatedAt: at(finish - 10), sourceLength: 12, durationMs: 3 } };
  const snapshot = { ...runSnapshotSchema.parse({ runId: 'run', requirementText: '', rules: [], selectedDiagrams: [], models: [], plantUml: [], svgArtifacts: [], requirementModelTraceability: [], currentStage: null, status: 'completed', error: null }), models: [model], svgArtifacts: [svg] } as unknown as NonNullable<LineageRunDetail['snapshot']>;
  const detail: LineageRunDetail = { run: { runId: 'run', status: 'completed', createdByUserId: 'alice', runKind: 'requirements' }, snapshot, events: [
    { type: 'stage_progress', stage: 'generate_models', progress: 5, diagramKind: kind, modelId: id, subtaskId: id, subtaskStatus: 'running', createdAt: at(start) },
    { type: 'stage_progress', stage: 'generate_models', progress: 20, diagramKind: kind, modelId: id, subtaskStatus: 'repairing', createdAt: at(start + 100) },
    { type: 'artifact_ready', stage: 'render_svg', artifactKind: 'svg', diagramKind: kind, modelId: id, subtaskId: id, createdAt: at(finish) },
  ] };
  const workspace = { ...empty, models: { [id]: model }, svgArtifacts: { [id]: svg } } as unknown as GenerationWorkspace;
  return { detail, workspace, model, svg };
}
const info = (workspace: GenerationWorkspace, details: LineageRunDetail[], entry = node()) => projectLineageGeneration(graph(entry), workspace, details, [member]).node;
describe('lineage generation projection', () => {
  it('includes generation, retry, and rendering time instead of SVG render duration', () => {
    const { detail, workspace } = fixture();
    expect(info(workspace, [detail]).representative).toMatchObject({ runId: 'run', member, durationMs: 1400, startedAt: at(100), completedAt: at(1500), scope: 'instance' });
  });
  it.each(['running', 'failed', 'cancelled'])('preserves the old artifact owner during a newer %s attempt', status => {
    const { detail, workspace } = fixture();
    const newer = { ...detail, run: { ...detail.run, runId: 'new', status, createdByUserId: 'bob' }, events: [
      { type: 'stage_progress', stage: 'generate_models', progress: 5, diagramKind: 'function', subtaskId: 'function', subtaskStatus: 'running', createdAt: at(3000) },
      { type: 'artifact_ready', stage: 'render_svg', artifactKind: 'svg', diagramKind: 'function', subtaskId: 'function', createdAt: at(4000) },
    ] };
    expect(info(workspace, [newer, detail]).representative?.userId).toBe('alice');
    expect(info(workspace, [newer]).representative?.durationMs).toBeUndefined();
  });
  it('accepts a successful parallel node from an overall failed run and rejects mismatched versions', () => {
    const { detail, workspace } = fixture(); detail.run.status = 'failed';
    expect(info(workspace, [detail]).representative?.durationMs).toBe(1400);
    const changed = { ...workspace, svgArtifacts: { function: { ...workspace.svgArtifacts.function!, svg: '<svg>edited</svg>' } } };
    expect(info(changed, [detail]).representative?.runId).toBeUndefined();
  });
  it('never guesses duration or owner from untimed or unrelated events', () => {
    const { detail, workspace } = fixture();
    detail.events = (detail.events as Record<string, unknown>[]).map(({ createdAt: _at, ...event }) => event);
    expect(info(workspace, [detail]).representative).toMatchObject({ generated: true });
    expect(info(workspace, [detail]).representative?.durationMs).toBeUndefined();
    detail.events = fixture('usecase').detail.events;
    expect(info(workspace, [detail]).representative?.runId).toBeUndefined();
  });
  it('does not substitute a later repair or progress timestamp for a missing first start', () => {
    const { detail, workspace } = fixture();
    detail.events![0] = { ...(detail.events![0] as Record<string, unknown>), createdAt: undefined };
    detail.events!.splice(1, 0, { ...(fixture().detail.events![0] as Record<string, unknown>), createdAt: at(200) });
    expect(info(workspace, [detail]).representative?.durationMs).toBeUndefined();
    detail.events = [fixture().detail.events![1], fixture().detail.events![2]];
    expect(info(workspace, [detail]).representative?.durationMs).toBeUndefined();
  });
  it('uses the latest current instance as representative and retains every instance in details', () => {
    const first = fixture('analysis', 'analysis:one', 100, 1000);
    const second = fixture('analysis', 'analysis:two', 400, 2000);
    second.detail.run = { ...second.detail.run, runId: 'two', createdByUserId: 'unknown' };
    const workspace = { ...first.workspace, models: { ...first.workspace.models, ...second.workspace.models }, svgArtifacts: { ...first.workspace.svgArtifacts, ...second.workspace.svgArtifacts } };
    const result = info(workspace, [first.detail, second.detail], node({ payload: { diagramKind: 'analysis' } }));
    expect(result.instances.map(item => item.durationMs)).toEqual([900, 1600]);
    expect(result.representative).toMatchObject({ instanceId: 'analysis:two', durationMs: 1600, userId: 'unknown' });
    expect(result.representative?.member).toBeUndefined();
  });
  it('does not borrow a sibling instance clock for a missing start event', () => {
    const first = fixture('analysis', 'analysis:one'); const second = fixture('analysis', 'analysis:two');
    second.detail.events = [first.detail.events![0], second.detail.events![2]];
    expect(info(second.workspace, [second.detail], node({ payload: { diagramKind: 'analysis' } })).representative?.durationMs).toBeUndefined();
  });
  it('matches rule extraction as a batch and ignores snapshots that merely reuse its rules', () => {
    const { detail } = fixture();
    detail.snapshot = { ...detail.snapshot, rules: [rule] } as NonNullable<LineageRunDetail['snapshot']>;
    detail.events = [{ type: 'stage_started', stage: 'extract_rules', createdAt: at(10) }, { type: 'artifact_ready', stage: 'extract_rules', artifactKind: 'rules', createdAt: at(210) }];
    const entry = node({ kind: 'rule', payload: { ruleId: rule.id, ruleCategory: rule.category } });
    const workspace = { ...empty, rules: [rule] };
    expect(info(workspace, [detail], entry).representative).toMatchObject({ scope: 'rules-batch', durationMs: 200 });
    expect(info(workspace, [{ ...detail, events: [] }], entry).representative?.userId).toBeUndefined();
    expect(info({ ...workspace, rules: [{ ...rule, text: 'edited' }] }, [detail], entry).representative?.runId).toBeUndefined();
  });
  it('matches document ID and version rather than assigning an older document to a new run', () => {
    const snapshot = documentRunSnapshotSchema.parse({ runId: 'doc-run', documentKind: 'requirementsSpec', documentId: 'doc', requirementText: '', fileName: 'requirements.docx', mimeType: 'application/docx', currentStage: null, status: 'completed', error: null });
    const detail: LineageRunDetail = { run: { runId: 'doc-run', status: 'completed', documentVersion: 2, createdByUserId: 'alice' }, snapshot, events: [{ type: 'stage_started', stage: 'generate_document_text', createdAt: at(100) }, { type: 'artifact_ready', stage: 'render_document_file', artifactKind: 'document', createdAt: at(3000) }] };
    const workspace = { ...empty, historyItems: [{ id: 'doc-run', createdAt: at(3000), title: 'doc', providerModel: '', snapshot, documentVersion: 2 }] };
    expect(info(workspace, [detail], node({ kind: 'document', payload: { documentKind: 'requirementsSpec' } })).representative?.durationMs).toBe(2900);
    detail.run.documentVersion = 1;
    expect(info(workspace, [detail], node({ kind: 'document', payload: { documentKind: 'requirementsSpec' } })).representative?.durationMs).toBeUndefined();
  });
  it('supports custom design model IDs with a single-kind start and per-instance readiness', () => {
    const { detail, model, svg } = fixture('class', 'design-class');
    detail.snapshot = { ...designRunSnapshotSchema.parse({ runId: 'run', requirementText: '', rules: [], selectedDiagrams: [], requirementModels: [], requirementModelTraceability: [], models: [], designModelTraceability: [], plantUml: [], svgArtifacts: [], currentStage: null, status: 'completed', error: null }), models: [model], svgArtifacts: [svg] } as unknown as NonNullable<LineageRunDetail['snapshot']>;
    detail.events![0] = { type: 'stage_progress', stage: 'generate_design_models', progress: 5, diagramKind: 'class', subtaskId: 'class', subtaskStatus: 'running', createdAt: at(100) };
    const workspace = { ...empty, designModels: { 'design-class': model }, designSvgArtifacts: { 'design-class': svg } } as unknown as GenerationWorkspace;
    expect(info(workspace, [detail], node({ kind: 'design-model', payload: { designDiagramKind: 'class' } })).representative?.durationMs).toBe(1400);
  });
  it('distinguishes not generated from generated artifacts whose provenance is missing', () => {
    expect(info(empty, [], node({ hasViewableArtifact: false })).representative).toBeUndefined();
    expect(info(empty, [], node({ kind: 'document', payload: { documentKind: 'requirementsSpec' } })).representative).toMatchObject({ generated: true });
    expect(info(fixture().workspace, []).representative).toMatchObject({ generated: true });
  });
  it('handles legacy SVG artifacts with no render metadata without blocking the canvas', () => {
    const { workspace } = fixture();
    delete (workspace.svgArtifacts.function as unknown as { renderMeta?: unknown }).renderMeta;
    expect(info(workspace, []).representative).toMatchObject({ generated: true });
    expect(info(workspace, []).representative?.durationMs).toBeUndefined();
  });
  it.each([[200, '0.2s'], [1, '0.001s'], [2345, '2.3s'], [61_200, '1m 1s'], [3_661_000, '1h 1m 1s']])('formats %d milliseconds without a fake zero', (duration, expected) => {
    expect(formatGenerationDuration(duration, 'en')).toBe(expected);
  });
});
