// Checks that persisted failures use shared notifications once per run, despite repeated state refreshes.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStandardProjectState, type StandardProjectState } from '@uml-platform/contracts';
import { useStandardProject } from './use-standard-project';
import { standardApi } from '../services/standard-api';
import { floatingAlert } from '../../../shared/ui/floating-alert';
import { ApiClientError } from '../../../services/api-client/index';
import { retainCommand, pendingCommand } from '../services/command-recovery';
import { saveConversationDraft } from './use-conversation-draft';
import { playCompletionChime, primeCompletionChime } from '../../../shared/lib/completion-chime';
import { resetGenerationCompletionChimeForTests } from '../../../shared/lib/generation-completion-chime';

vi.mock('../services/standard-api', () => ({ standardApi: { read: vi.fn(), start: vi.fn(), cancel: vi.fn() } }));
vi.mock('../../../shared/lib/completion-chime', () => ({ playCompletionChime: vi.fn(), primeCompletionChime: vi.fn() }));
beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); resetGenerationCompletionChimeForTests(); });
afterEach(() => vi.restoreAllMocks());
it('primes the shared audio before starting and chimes once when polling confirms the whole generation finished', async () => {
  let state = createStandardProjectState();
  vi.mocked(standardApi.read).mockImplementation(async () => ({ state: structuredClone(state) }));
  vi.mocked(standardApi.start).mockImplementation(async () => {
    expect(primeCompletionChime).toHaveBeenCalledOnce();
    state = { ...state, run: { id: 'generated-run', operation: 'chat', status: 'running', startedAt: 'now', work: { ids: ['usecase'] } } };
    return { state: structuredClone(state) };
  });
  const { result } = renderHook(() => useStandardProject('p', true));
  await waitFor(() => expect(result.current.state).not.toBeNull());
  await act(() => result.current.start({ operation: 'chat', message: '生成用例图' }));
  expect(playCompletionChime).not.toHaveBeenCalled();
  state = { ...state, run: { ...state.run!, status: 'completed' } };
  await act(() => result.current.refresh());
  await act(() => result.current.refresh());
  expect(playCompletionChime).toHaveBeenCalledOnce();
});

it('does not repeat a failed run notification when refreshing the same saved state', async () => {
  const state = createStandardProjectState();
  state.run = { id: 'run-a', operation: 'chat', status: 'failed', error: 'Provider failed', startedAt: 'now' };
  vi.mocked(standardApi.read).mockImplementation(async () => ({ state: structuredClone(state) }));
  const notify = vi.spyOn(floatingAlert, 'error').mockReturnValue('alert');
  const { result } = renderHook(() => useStandardProject('p', true));
  await waitFor(() => expect(notify).toHaveBeenCalledOnce());
  await act(() => result.current.refresh());
  await act(() => result.current.refresh());
  expect(notify).toHaveBeenCalledOnce();
  state.run.id = 'run-b';
  await act(() => result.current.refresh());
  expect(notify).toHaveBeenCalledTimes(2);
});

it('reconnects by reading the same task, never starting or cancelling generation', async () => {
  const state = createStandardProjectState('requirements');
  state.run = { id: 'same-run', operation: 'chat', status: 'running', startedAt: 'now' };
  vi.mocked(standardApi.read).mockResolvedValue({ state });
  const { result } = renderHook(() => useStandardProject('p', true));
  await waitFor(() => expect(result.current.running).toBe(true));
  vi.mocked(standardApi.read).mockRejectedValueOnce(new ApiClientError('offline', 0));
  await act(() => result.current.refresh());
  expect(result.current.connection).toBe('dropped');
  expect(result.current.state?.run?.id).toBe('same-run');
  await act(() => result.current.reconnect());
  expect(result.current.connection).toBe('resumed');
  expect(standardApi.start).not.toHaveBeenCalled(); expect(standardApi.cancel).not.toHaveBeenCalled();
});

it('reconciles a lost start acknowledgement with one POST and the persisted request identifier', async () => {
  let state = createStandardProjectState();
  vi.mocked(standardApi.read).mockImplementation(async () => ({ state }));
  vi.mocked(standardApi.start).mockImplementation(async (_, command) => {
    state = { ...state, run: { id: 'accepted', requestId: command.requestId, operation: 'chat', status: 'running', startedAt: 'now' } };
    throw new ApiClientError('connection lost after acceptance', 0);
  });
  const { result } = renderHook(() => useStandardProject('p', true));
  await waitFor(() => expect(result.current.state).not.toBeNull());
  let accepted;
  await act(async () => { accepted = await result.current.start({ operation: 'chat', message: 'requirements' }); });
  expect(accepted).toBe(true); expect(result.current.state?.run?.id).toBe('accepted'); expect(standardApi.start).toHaveBeenCalledOnce();
  await act(() => result.current.refresh());
  expect(standardApi.start).toHaveBeenCalledOnce();
});

it('keeps the command identifier for an explicit retry when acceptance remains unknown', async () => {
  const state = createStandardProjectState();
  vi.mocked(standardApi.read).mockResolvedValue({ state });
  vi.mocked(standardApi.start).mockRejectedValue(new ApiClientError('offline', 0));
  const { result } = renderHook(() => useStandardProject('p', true));
  await waitFor(() => expect(result.current.state).not.toBeNull());
  await act(async () => { await result.current.start({ operation: 'chat', message: 'requirements' }); });
  await act(async () => { await result.current.start({ operation: 'chat', message: 'requirements' }); });
  expect(standardApi.start).toHaveBeenCalledTimes(2);
  expect(vi.mocked(standardApi.start).mock.calls[0][1].requestId).toBe(vi.mocked(standardApi.start).mock.calls[1][1].requestId);
});

it('reconciles an accepted edit without clearing a matching unsent new-message draft', async () => {
  const state = createStandardProjectState();
  state.run = { id: 'edit-run', requestId: 'edit-request', operation: 'edit', status: 'running', startedAt: 'now' };
  retainCommand('p', { operation: 'edit', requestId: 'edit-request', messageId: 'u', expectedHeadId: 'a', message: 'matching text' });
  saveConversationDraft('p', 'matching text');
  vi.mocked(standardApi.read).mockResolvedValue({ state });
  const { result } = renderHook(() => useStandardProject('p', true));
  await waitFor(() => expect(result.current.state?.run?.id).toBe('edit-run'));
  expect(pendingCommand('p')).toBeNull();
  expect(JSON.parse(sessionStorage.getItem('uml-standard-draft:p')!).text).toBe('matching text');
  expect(standardApi.start).not.toHaveBeenCalled();
});

it('shows a pending chat before acknowledgement and replaces it once without losing it to stale snapshots', async () => {
  const state = createStandardProjectState();
  state.conversation = [{ id: 'old', role: 'user', text: '你好', status: 'completed', createdAt: 'now' }];
  vi.mocked(standardApi.read).mockResolvedValue({ state });
  let finish!: (response: { state: StandardProjectState }) => void;
  vi.mocked(standardApi.start).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useStandardProject('p', true));
  await waitFor(() => expect(result.current.state).not.toBeNull());
  let sent!: Promise<boolean | undefined>;
  act(() => { sent = result.current.start({ operation: 'chat', message: '你好' }); });
  const requestId = vi.mocked(standardApi.start).mock.calls[0][1].requestId!;
  const pendingId = `user:${requestId}`;
  expect(result.current.pending).toBe(true);
  expect(result.current.state?.conversation?.map(message => message.id)).toEqual(['old', pendingId]);
  await act(async () => { await result.current.start({ operation: 'chat', message: '你好' }); });
  expect(standardApi.start).toHaveBeenCalledOnce();
  expect(result.current.state?.conversation?.at(-1)?.id).toBe(pendingId);
  await act(() => result.current.refresh());
  expect(result.current.state?.conversation?.length).toBe(2);
  const acknowledged = { ...state, conversation: [...state.conversation!, { id: pendingId, role: 'user' as const, text: '你好', status: 'completed' as const, createdAt: 'server-time' }] };
  await act(async () => { finish({ state: acknowledged }); await sent; });
  expect(result.current.state?.conversation?.length).toBe(2);
  expect(result.current.state?.conversation?.at(-1)?.createdAt).toBe('server-time');
});

it('removes a rejected pending message and preserves the unsent draft', async () => {
  const state = createStandardProjectState();
  vi.mocked(standardApi.read).mockResolvedValue({ state });
  let reject!: (error: Error) => void;
  vi.mocked(standardApi.start).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const { result } = renderHook(() => useStandardProject('p', true));
  await waitFor(() => expect(result.current.state).not.toBeNull());
  saveConversationDraft('p', '你好');
  let sent!: Promise<boolean | undefined>;
  act(() => { sent = result.current.start({ operation: 'chat', message: '你好' }); });
  expect(result.current.state?.conversation?.at(-1)?.text).toBe('你好');
  await act(async () => { reject(new ApiClientError('rejected', 400)); expect(await sent).toBe(false); });
  expect(result.current.state?.conversation).toBeUndefined();
  expect(JSON.parse(sessionStorage.getItem('uml-standard-draft:p')!).text).toBe('你好');
});

it('rejects saved preparation commands without rewriting them into current chat commands', () => {
  const raw = JSON.stringify({ requestId: 'old-command', operation: 'prepare', description: '旧需求' });
  sessionStorage.setItem('uml-standard-pending:p', raw);
  expect(pendingCommand('p')).toBeNull();
  expect(sessionStorage.getItem('uml-standard-pending:p')).toBe(raw);
});

it('keeps pending attachments, quotes and conversation isolated from another project', async () => {
  const state = createStandardProjectState('原始需求');
  state.conversation = [{ id: 'user', role: 'user', text: '原始需求', status: 'completed', createdAt: 'now' }];
  state.run = { id: 'previous', operation: 'chat', status: 'completed', startedAt: 'now' };
  vi.mocked(standardApi.read).mockImplementation(async id => ({ state: id === 'p' ? state : createStandardProjectState() }));
  let finish!: (response: { state: StandardProjectState }) => void;
  vi.mocked(standardApi.start).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = renderHook(({ id }) => useStandardProject(id, true), { initialProps: { id: 'p' } });
  await waitFor(() => expect(result.current.state).not.toBeNull());
  const attachments = [{ id: 'file', type: 'document' as const, name: 'scope.txt', contentType: 'text/plain' as const, text: '附件内容' }];
  let sent!: Promise<boolean | undefined>;
  act(() => { sent = result.current.start({ operation: 'chat', attachments, quote: { text: '引用内容' } }); });
  expect(result.current.state?.conversation?.[0]?.text).toBe('原始需求');
  expect(result.current.state?.conversation?.at(-1)).toMatchObject({ attachments, quote: { text: '引用内容' } });
  rerender({ id: 'other' });
  await waitFor(() => expect(result.current.state?.description).toBe(''));
  await act(async () => { finish({ state }); await sent; });
  expect(result.current.state?.conversation).toBeUndefined();
});
