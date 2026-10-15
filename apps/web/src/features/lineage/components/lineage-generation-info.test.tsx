// Verifies visible elapsed times, identity fallbacks, tooltips, and grouped instance details.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../../shared/i18n';
import { GenerationStamp, GenerationDetails } from './lineage-generation-info';
import type { GenerationInfo } from '../lib/lineage-generation';
const info: GenerationInfo = { instanceId: 'one', label: 'Login sequence', generated: true, scope: 'instance', durationMs: 200, member: { id: 'member', projectId: 'project', userId: 'alice', displayName: 'Alice Wang', email: 'alice@example.test', role: 'owner', status: 'active' } };
beforeEach(async () => { await i18n.changeLanguage('zh-CN'); });
describe('lineage generation information', () => {
  it('shows a person avatar fallback, sub-second elapsed time, and the name on hover', async () => {
    const user = userEvent.setup(); render(<I18nextProvider i18n={i18n}><GenerationStamp info={info} /></I18nextProvider>);
    expect(await screen.findByText('AW')).toBeInTheDocument(); expect(screen.getByText('0.2s')).toBeInTheDocument();
    await user.hover(screen.getByLabelText('Alice Wang'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Alice Wang');
  });
  it('shows missing time and unknown identity independently of not-generated nodes', async () => {
    const { rerender } = render(<I18nextProvider i18n={i18n}><GenerationStamp info={{ ...info, member: undefined, durationMs: undefined }} /></I18nextProvider>);
    expect(screen.getByText('耗时未记录')).toBeInTheDocument(); expect(screen.getByLabelText('生成人信息不可用')).toBeInTheDocument();
    rerender(<I18nextProvider i18n={i18n}><GenerationStamp /></I18nextProvider>);
    expect(screen.getByText('未生成')).toBeInTheDocument();
  });
  it('retains name initials when the avatar image fails to load', async () => {
    const OriginalImage = window.Image;
    const image = { onload: null as null | (() => void), onerror: null as null | (() => void), src: '', complete: false, naturalWidth: 0 };
    vi.stubGlobal('Image', class { constructor() { return image; } });
    try {
      render(<I18nextProvider i18n={i18n}><GenerationStamp info={{ ...info, member: { ...info.member!, avatarUrl: '/broken.png' } }} /></I18nextProvider>);
      await waitFor(() => expect(image.src).toBe('/broken.png'));
      act(() => image.onerror?.());
      expect(await screen.findByText('AW')).toBeInTheDocument();
    } finally { vi.stubGlobal('Image', OriginalImage); vi.unstubAllGlobals(); }
  });
  it('displays a loaded member avatar with their accessible name', async () => {
    const image = { onload: null as null | (() => void), onerror: null as null | (() => void), src: '', complete: false, naturalWidth: 0 };
    vi.stubGlobal('Image', class { constructor() { return image; } });
    try {
      render(<I18nextProvider i18n={i18n}><GenerationStamp info={{ ...info, member: { ...info.member!, avatarUrl: '/alice.png' } }} /></I18nextProvider>);
      await waitFor(() => expect(image.src).toBe('/alice.png'));
      act(() => image.onload?.());
      expect(await screen.findByRole('img', { name: 'Alice Wang' })).toHaveAttribute('src', '/alice.png');
    } finally { vi.unstubAllGlobals(); }
  });
  it('identifies the representative diagram and explicitly labels rule batch duration', async () => {
    const user = userEvent.setup(); render(<I18nextProvider i18n={i18n}><GenerationStamp info={{ ...info, scope: 'rules-batch' }} representative /></I18nextProvider>);
    await user.hover(screen.getByText('0.2s'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('规则批次耗时');
    expect(screen.getByRole('tooltip')).toHaveTextContent('代表图：Login sequence');
  });
  it('lists all current instances in details and localizes missing records', async () => {
    await i18n.changeLanguage('en');
    render(<I18nextProvider i18n={i18n}><GenerationDetails info={{ representative: info, instances: [info, { ...info, instanceId: 'two', label: 'Search sequence', durationMs: undefined }] }} /></I18nextProvider>);
    expect(screen.getByText('Login sequence')).toBeInTheDocument(); expect(screen.getByText('Search sequence')).toBeInTheDocument();
    expect(screen.getByText('Duration not recorded')).toBeInTheDocument();
  });
});
