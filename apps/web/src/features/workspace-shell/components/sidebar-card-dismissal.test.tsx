// Verifies each sidebar promotion stays independently dismissed for the current login session.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../../shared/i18n';
import { SidebarProvider } from '../../../shared/ui/sidebar';
import { AuthenticatedRouteSessionProvider } from '../../user-platform/components/authenticated-route-session';
import type { PlatformAccountProfileResponse } from '../../user-platform/services/platform-api';
import { SidebarCodingAgentCard } from './sidebar-coding-agent-card';

const profile: PlatformAccountProfileResponse = {
  user: { id: 'user-1', username: 'sidebar-user', displayName: '侧栏用户', email: 'sidebar@example.test', avatarUrl: null, status: 'active', emailVerified: true, mfaEnabled: false },
  session: { id: 'session-1', userId: 'user-1', createdAt: '', expiresAt: '', lastSeenAt: '', ipAddress: null, userAgent: null },
};

function Cards({ sessionId = 'session-1' }: { sessionId?: string }) {
  return <AuthenticatedRouteSessionProvider value={{ ...profile, session: { ...profile.session, id: sessionId } }}>
    <SidebarProvider><SidebarCodingAgentCard /></SidebarProvider>
  </AuthenticatedRouteSessionProvider>;
}

const cards = [
  { card: 'coding-agent', title: '设计做好了？', otherTitle: '产品宣传视频' },
];

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('zh-CN');
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
});

describe.each(cards)('$card dismissal', ({ card, title, otherTitle }) => {
  it('persists independently across remounts and restores on a fresh login for the same user', async () => {
    const user = userEvent.setup();
    const first = render(<Cards />);
    const cardElement = first.container.querySelector(`[data-slot="sidebar-${card}-card"]`)!;
    await user.click(within(cardElement as HTMLElement).getByRole('button', { name: '关闭' }));

    expect(screen.queryByText(title)).not.toBeInTheDocument();
    expect(screen.queryByText(otherTitle)).not.toBeInTheDocument();
    expect(document.querySelector('video, source')).toBeNull();
    first.unmount();

    // Recreating the components reads the persisted record, as page navigation or reload would.
    const next = render(<Cards />);
    expect(screen.queryByText(title)).not.toBeInTheDocument();
    expect(screen.queryByText(otherTitle)).not.toBeInTheDocument();
    next.rerender(<Cards sessionId='session-2' />);
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByText(otherTitle)).not.toBeInTheDocument();
  });

  it('can be closed with the keyboard even if storage writes fail', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
    const { container, rerender } = render(<Cards sessionId='restricted-storage-session' />);
    const cardElement = container.querySelector(`[data-slot="sidebar-${card}-card"]`)!;
    within(cardElement as HTMLElement).getByRole('button', { name: '关闭' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByText(title)).not.toBeInTheDocument();
    expect(screen.queryByText(otherTitle)).not.toBeInTheDocument();
    rerender(<Cards sessionId='next-login' />);
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it('reflects dismissals received from another tab in the same session', () => {
    render(<Cards />);
    const key = `uml-sidebar-card-dismissed:${card}`;
    act(() => {
      localStorage.setItem(key, 'session-1');
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: 'session-1' }));
    });
    expect(screen.queryByText(title)).not.toBeInTheDocument();
    expect(screen.queryByText(otherTitle)).not.toBeInTheDocument();
  });
});

it('translates the close control with the interface language', async () => {
  await i18n.changeLanguage('en');
  render(<Cards />);
  expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
});

it('keeps promotions usable when a restored profile has no login session metadata', async () => {
  const restored = { ...profile, session: undefined } as unknown as PlatformAccountProfileResponse;
  const { container } = render(<AuthenticatedRouteSessionProvider value={restored}>
    <SidebarProvider><SidebarCodingAgentCard /></SidebarProvider>
  </AuthenticatedRouteSessionProvider>);
  const card = container.querySelector('[data-slot="sidebar-coding-agent-card"]')!;
  await userEvent.click(within(card as HTMLElement).getByRole('button', { name: '关闭' }));
  expect(screen.queryByText('设计做好了？')).not.toBeInTheDocument();
});
