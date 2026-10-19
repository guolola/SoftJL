// Exercises the actual language menu across ordinary pages while preserving project-authored content.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStandardProjectState, type StandardProjectState } from '@uml-platform/contracts';
import { withWorkspaceProviders } from '../../../test/workspace-test-utils';
import { createMockWorkspaceRepository } from '../../../services/workspace-repository';
import { LanguagePreferenceMenu } from '../../../shared/i18n/components/language-preference-menu';
import { i18n } from '../../../shared/i18n';
import { standardProjectEn, standardProjectZh } from '../../../shared/i18n/standard-project-resources';
import { StandardWorkspace } from './standard-workspace';
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { standardApi } from '../services/standard-api';

vi.mock('../services/standard-api', () => ({ standardApi: { read: vi.fn(), start: vi.fn(), cancel: vi.fn() } }));
let state: StandardProjectState;
beforeEach(async () => {
  sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks(); await i18n.changeLanguage('zh-CN');
  patchUserSettings({ providerConfigId: 'provider', providerModelOptions: ['test-model'], defaultModel: 'test-model' });
  state = createStandardProjectState();
  vi.mocked(standardApi.read).mockImplementation(async () => ({ state: structuredClone(state) }));
});
afterEach(async () => { localStorage.clear(); await act(() => i18n.changeLanguage('zh-CN')); });
function mount() {
  const repository = createMockWorkspaceRepository(); repository.listDocuments = vi.fn(async () => []);
  return render(withWorkspaceProviders(<StandardWorkspace projectId="p" projectName="用户项目名称" canEdit header={<LanguagePreferenceMenu />} onNavigate={vi.fn()} onSettings={vi.fn()} onOpenAccount={vi.fn()} />, repository));
}

it('switches source and platform labels while preserving the draft', async () => {
  const user = userEvent.setup(); mount();
  await screen.findByRole('button', { name: 'UML 模型' });
  expect(screen.getByRole('button', { name: 'Agent 聊天' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('button', { name: '运行历史' })).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText('发送消息…')).toBeInTheDocument();
  await user.type(screen.getByPlaceholderText('发送消息…'), '保留我的输入');
  fireEvent.keyDown(screen.getByRole('button', { name: '切换界面语言' }), { key: 'ArrowDown' });
  await user.click(await screen.findByRole('menuitem', { name: 'English' }));
  expect(await screen.findByRole('button', { name: 'UML models' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Agent chat' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('button', { name: 'Run history' })).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText('Send a message...')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Send a message...')).toHaveValue('保留我的输入');
  fireEvent.keyDown(screen.getByRole('button', { name: 'Change interface language' }), { key: 'ArrowDown' });
  await user.click(await screen.findByRole('menuitem', { name: '中文' }));
  expect(await screen.findByRole('button', { name: 'UML 模型' })).toBeInTheDocument();
  expect(screen.getByPlaceholderText('发送消息…')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('发送消息…')).toHaveValue('保留我的输入');
  expect(standardApi.start).not.toHaveBeenCalled();
});

it('translates diagram operations and result pages while preserving saved content', async () => {
  state.description = '用户原始需求';
  state.conversation = [{ id: 'u', role: 'user', text: '只允许学生借阅', status: 'completed', createdAt: 'now' }];
  state.rounds = [{ questions: [{ id: 'role', title: '谁可以借阅？', options: ['学生', '老师'], recommendation: '学生', multiple: false }], answers: [] }];
  state.diagrams.flow = { id: 'flow', kind: 'activity', title: '借阅业务图', status: 'completed' };
  state.tests = [{ id: 't1', businessId: 'borrow', title: '用户保存的用例', preconditions: [], steps: ['确认借阅'], expected: '生成借阅记录' }];
  const user = userEvent.setup(); mount();
  await screen.findByRole('button', { name: 'UML 模型' });
  fireEvent.keyDown(screen.getByRole('button', { name: '切换界面语言' }), { key: 'ArrowDown' });
  await user.click(await screen.findByRole('menuitem', { name: 'English' }));
  expect(screen.getByText('只允许学生借阅')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: i18n.t('workspace.sidebar.expand', { label: standardProjectEn.uml }) }));
  await user.click(screen.getByRole('button', { name: i18n.t('workspace.sidebar.expand', { label: standardProjectEn.diagramKinds.activity }) }));
  await user.click(screen.getByRole('button', { name: '借阅业务图' }));
  expect(screen.getByRole('heading', { name: '借阅业务图' })).toBeInTheDocument();
  expect(screen.getByText('Business flow diagram', { selector: 'p' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Regenerate diagram' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Tests' }));
  expect(await screen.findByText('Unclassified')).toBeInTheDocument();
  expect(screen.getByText('Unspecified')).toBeInTheDocument();
  expect(screen.getByText('用户保存的用例')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: i18n.t('workspace.tabs.labels.documents') }));
  await waitFor(() => expect(screen.getByText(standardProjectEn.documentDescription)).toBeInTheDocument());
});

it('keeps both ordinary language bundles complete', () => {
  const keys = (value: Record<string, unknown>, prefix = ''): string[] => Object.entries(value).flatMap(([key, item]) => typeof item === 'string' ? [prefix + key] : keys(item as Record<string, unknown>, `${prefix}${key}.`));
  expect(keys(standardProjectEn).sort()).toEqual(keys(standardProjectZh).sort());
});
