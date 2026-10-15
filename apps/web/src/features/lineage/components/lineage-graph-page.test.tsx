// Verifies the supplied canvas toolbar routes, generates, and filters without opening the card inspector.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../../shared/i18n';
import { useReactFlowTestLayout } from '../../../test/react-flow-test-layout';
import { LineageGraphPage } from './lineage-graph-page';
import { platformApi } from '../../user-platform/services/platform-api';
useReactFlowTestLayout();
const { session, shell, graph } = vi.hoisted(() => ({
  session: { generateRules: vi.fn(), generateDiagrams: vi.fn(), generateDesignDiagrams: vi.fn(), generateRequirementsSpec: vi.fn(), generateSoftwareDesignSpec: vi.fn(), generateFeasibilityStudy: vi.fn() },
  shell: { openSystemRequirements: vi.fn(), openRequirementsText: vi.fn(), openDiagram: vi.fn(), openDesignDiagram: vi.fn(), openDocumentsHome: vi.fn() },
  graph: {
    nodes: [
      { id: 'requirement-model:function', kind: 'requirement-model', stage: 'requirement-models', stageLabel: '', label: '', eyebrow: '', description: '', status: 'current', reason: '', actionLabel: '', hasViewableArtifact: true, upstreamIds: [], downstreamIds: [], recentEvents: [], payload: { diagramKind: 'function' } },
      { id: 'requirement-model:usecase', kind: 'requirement-model', stage: 'requirement-models', stageLabel: '', label: '', eyebrow: '', description: '', status: 'current', reason: '', actionLabel: '', hasViewableArtifact: true, upstreamIds: [], downstreamIds: [], recentEvents: [], payload: { diagramKind: 'usecase' } }
    ], edges: [], summary: { total: 2, current: 2, stale: 0, error: 0, interrupted: 0, running: 0, notGenerated: 0 }, defaultSelectedNodeId: 'requirement-model:function'
  }
}));
vi.mock('../../workspace-session/state', () => ({ useWorkspaceSession: () => session }));
vi.mock('../../workspace-shell/state', () => ({ useWorkspaceShell: () => shell }));
vi.mock('../lib/lineage-graph-model', async importOriginal => ({ ...await importOriginal<typeof import('../lib/lineage-graph-model')>(), buildLineageGraph: () => graph }));
beforeEach(async () => { vi.clearAllMocks(); graph.nodes[0].status = 'current'; graph.nodes[0].hasViewableArtifact = true; await i18n.changeLanguage('zh-CN'); });
async function setup() {
  const user = userEvent.setup(); const onViewArtifact = vi.fn();
  render(<I18nextProvider i18n={i18n}><LineageGraphPage onViewArtifact={onViewArtifact} /></I18nextProvider>);
  const card = await screen.findByTestId('lineage-node-requirement-model:function');
  await user.hover(card);
  await screen.findByRole('button', { name: i18n.t('lineage.canvas.openPage') });
  return { user, card, onViewArtifact };
}
describe('lineage node toolbar', () => {
  it('renders the canvas while metadata is loading and cancels the read on departure', async () => {
    let signal: AbortSignal | undefined;
    const request = vi.spyOn(platformApi, 'getProjectRun').mockImplementation((_project, _run, options) => { signal = options?.signal; return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })); });
    try {
      const { unmount } = render(<I18nextProvider i18n={i18n}><LineageGraphPage projectId='metadata-project' projectRuns={[{ runId: 'loading-run', status: 'running' }]} /></I18nextProvider>);
      expect(await screen.findByTestId('lineage-node-requirement-model:function')).toBeInTheDocument();
      expect(request).toHaveBeenCalledWith('metadata-project', 'loading-run', expect.objectContaining({ includeEvents: true }));
      expect(signal?.aborted).toBe(false); unmount(); expect(signal?.aborted).toBe(true);
    } finally { request.mockRestore(); }
  });
  it('keeps the graph usable when provenance loading fails', async () => {
    const request = vi.spyOn(platformApi, 'getProjectRun').mockRejectedValue(new Error('unavailable'));
    try {
      render(<I18nextProvider i18n={i18n}><LineageGraphPage projectId='failed-metadata-project' projectRuns={[{ runId: 'failed-read', status: 'completed' }]} /></I18nextProvider>);
      expect(await screen.findByTestId('lineage-node-requirement-model:function')).toBeInTheDocument();
      await waitFor(() => expect(request).toHaveBeenCalledOnce());
      expect(screen.getAllByText('耗时未记录').length).toBe(2);
    } finally { request.mockRestore(); }
  });
  it('keeps type icons identical in cards and details across language changes', async () => {
    await i18n.changeLanguage('en');
    const { card } = await setup();
    expect(card.querySelector('.lucide-git-fork')).not.toBeNull();
    fireEvent.click(card);
    expect(screen.getByRole('complementary', { name: 'Node details' }).querySelector('.lucide-git-fork')).not.toBeNull();
    await i18n.changeLanguage('zh-CN');
    expect(screen.getByRole('complementary', { name: '节点详情' }).querySelector('.lucide-git-fork')).not.toBeNull();
  });
  it('routes rules to system requirements instead of the requirement model page', async () => {
    const original = { ...graph.nodes[0] };
    Object.assign(graph.nodes[0], { kind: 'rule', payload: { ruleId: 'r1', ruleCategory: '功能需求' }, label: 'r1' });
    try {
      const { user, onViewArtifact } = await setup();
      await user.click(screen.getByRole('button', { name: '打开对应页面' }));
      expect(shell.openSystemRequirements).toHaveBeenCalledOnce(); expect(shell.openRequirementsText).not.toHaveBeenCalled();
      expect(onViewArtifact).toHaveBeenCalledOnce();
      expect(screen.queryByRole('complementary', { name: '节点详情' })).not.toBeInTheDocument();
    } finally { Object.assign(graph.nodes[0], original); }
  });
  it('navigates to the matching model page through the first icon without opening details', async () => {
    const { user, onViewArtifact } = await setup();
    await user.click(screen.getByRole('button', { name: '打开对应页面' }));
    expect(shell.openDiagram).toHaveBeenCalledWith('function', undefined, '功能结构图');
    expect(onViewArtifact).toHaveBeenCalledOnce();
    expect(screen.queryByRole('complementary', { name: '节点详情' })).not.toBeInTheDocument();
  });
  it('lets the first icon navigate even before the artifact is generated', async () => {
    graph.nodes[0].status = 'not-generated'; graph.nodes[0].hasViewableArtifact = false;
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: '打开对应页面' }));
    expect(shell.openDiagram).toHaveBeenCalledWith('function', undefined, '功能结构图');
    expect(screen.queryByRole('complementary', { name: '节点详情' })).not.toBeInTheDocument();
  });
  it('regenerates current artifacts through the second icon, without navigating or opening details', async () => {
    const { user, onViewArtifact } = await setup();
    await user.click(screen.getByRole('button', { name: '重新生成' }));
    expect(session.generateDiagrams).toHaveBeenCalledWith(['function']);
    expect(shell.openDiagram).not.toHaveBeenCalled(); expect(onViewArtifact).not.toHaveBeenCalled();
    expect(screen.queryByRole('complementary', { name: '节点详情' })).not.toBeInTheDocument();
  });
  it('retains the impact filter through the third icon and only opens details on a card click', async () => {
    const { user, card } = await setup();
    await user.click(screen.getByRole('button', { name: '影响路径' }));
    await waitFor(() => expect(screen.getByTestId('lineage-node-requirement-model:usecase').closest('.react-flow__node')).toHaveStyle({ opacity: '0.25' }));
    expect(screen.queryByRole('complementary', { name: '节点详情' })).not.toBeInTheDocument();
    expect(shell.openDiagram).not.toHaveBeenCalled(); expect(session.generateDiagrams).not.toHaveBeenCalled();
    fireEvent.click(card);
    expect(screen.getByRole('complementary', { name: '节点详情' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '收起节点详情' }));
    expect(screen.queryByRole('complementary', { name: '节点详情' })).not.toBeInTheDocument();
  });
  it('disables generation during an active run while preserving navigation and collapsed details', async () => {
    graph.nodes[0].status = 'running';
    const { user } = await setup();
    expect(screen.getByRole('button', { name: '查看进度' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '打开对应页面' }));
    expect(shell.openDiagram).toHaveBeenCalledOnce(); expect(session.generateDiagrams).not.toHaveBeenCalled();
    expect(screen.queryByRole('complementary', { name: '节点详情' })).not.toBeInTheDocument();
  });
});
