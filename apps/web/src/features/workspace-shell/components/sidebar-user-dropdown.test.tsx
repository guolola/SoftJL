// Verifies sidebar account navigation, keyboard/mobile access, and successful/failed logout transitions.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../../shared/i18n/index';
import { DefaultSidebar } from '../../../shared/template/layout/default-sidebar';
import { SidebarProvider, useSidebar } from '../../../shared/ui/sidebar';
import { AuthenticatedRouteSessionProvider } from '../../user-platform/components/authenticated-route-session';
import { AUTH_SESSION_CHANGED_EVENT, platformApi, type PlatformAccountProfileResponse } from '../../user-platform/services/platform-api';
import { floatingAlert } from '../../../shared/ui/floating-alert';
import { SidebarUserDropdown } from './sidebar-user-dropdown';
const profile: PlatformAccountProfileResponse = {
  mfa: { enabled: false, enforcement: "totp" },
  user: { id: 'user-1', username: 'sidebar-user', displayName: '侧栏用户', avatarUrl: null, status: 'active', mfaEnabled: false },
  session: { id: 'session-1', userId: 'user-1', createdAt: '', expiresAt: '', lastSeenAt: '', ipAddress: null, userAgent: null },
};
function SidebarControls() {
    const { openMobile, setOpenMobile, setOpen } = useSidebar();
    return <>
    <button onClick={() => setOpen(false)}>折叠侧栏</button>
    <button onClick={() => setOpenMobile(true)}>打开手机侧栏</button>
    <output data-testid="mobile-open">{String(openMobile)}</output>
  </>;
}
function renderSidebar(session: PlatformAccountProfileResponse | null = profile) {
    const actions = { onOpenAccount: vi.fn(), onNavigate: vi.fn() };
    render(<I18nextProvider i18n={i18n}>
    <AuthenticatedRouteSessionProvider value={session}>
      <SidebarProvider>
        <SidebarControls />
        <DefaultSidebar footer={<SidebarUserDropdown {...actions}/>}>
          <span>侧栏导航</span>
        </DefaultSidebar>
      </SidebarProvider>
    </AuthenticatedRouteSessionProvider>
  </I18nextProvider>);
    return { ...actions, user: userEvent.setup() };
}
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: '账号：侧栏用户' }));
    return screen.findByRole('menu');
}
afterEach(() => {
    vi.restoreAllMocks();
    window.innerWidth = 1440;
});
describe('sidebar user dropdown', () => {
    it('uses the real user in the footer and opens all existing account destinations', async () => {
        const { user, onOpenAccount, onNavigate } = renderSidebar();
        const trigger = screen.getByRole('button', { name: '账号：侧栏用户' });
        expect(trigger.closest('[data-slot="sidebar-footer"]')).not.toBeNull();
        expect(within(trigger).getByText(profile.user.username)).toBeInTheDocument();
        let menu = await openMenu(user);
        expect(within(menu).getByText(profile.user.displayName)).toBeInTheDocument();
        expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual([
            i18n.t('auth.account'), i18n.t('nav.dashboard'), i18n.t('nav.projects'), i18n.t('mcp.title'),
            i18n.t('nav.tutorial'), i18n.t('account.logout'),
        ]);
        await user.click(within(menu).getByRole('menuitem', { name: '账号' }));
        expect(onOpenAccount).toHaveBeenCalledOnce();
        for (const [label, path] of [
            ['nav.dashboard', '/dashboard'], ['nav.projects', '/projects'], ['mcp.title', '/projects/connections'],

        ]) {
            menu = await openMenu(user);
            await user.click(within(menu).getByRole('menuitem', { name: i18n.t(label) }));
            expect(onNavigate).toHaveBeenLastCalledWith(path);
        }
    });
    it('keeps the collapsed avatar accessible from the keyboard', async () => {
        const { user } = renderSidebar();
        await user.click(screen.getByRole('button', { name: '折叠侧栏' }));
        const trigger = screen.getByRole('button', { name: '账号：侧栏用户' });
        expect(trigger.closest('[data-state]')).toHaveAttribute('data-state', 'collapsed');
        trigger.focus();
        await user.keyboard('{Enter}');
        expect(await screen.findByRole('menu')).toBeInTheDocument();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
        expect(trigger).toHaveFocus();
    });
    it('closes the mobile sidebar and opens the online guide without using the app router', async () => {
        window.innerWidth = 390;
        const { user, onNavigate } = renderSidebar();
        await user.click(screen.getByRole('button', { name: '打开手机侧栏' }));
        expect(screen.getByTestId('mobile-open')).toHaveTextContent('true');
        const menu = await openMenu(user);
        const guide = within(menu).getByRole('menuitem', { name: '使用文档' });
        expect(guide).toHaveAttribute('href', 'https://jianglisoftware.com/tutorial');
        expect(guide).toHaveAttribute('target', '_blank');
        expect(guide).toHaveAttribute('rel', 'noopener noreferrer');
        await user.click(guide);
        expect(onNavigate).not.toHaveBeenCalled();
        expect(screen.getByTestId('mobile-open')).toHaveTextContent('false');
    });
    it('waits for logout, prevents another request, then navigates and invalidates the session', async () => {
        let finishLogout!: (value: {
            message?: string;
        }) => void;
        const logout = vi.spyOn(platformApi, 'logout').mockReturnValue(new Promise(resolve => { finishLogout = resolve; }));
        const sessionChanged = vi.fn();
        window.addEventListener(AUTH_SESSION_CHANGED_EVENT, sessionChanged);
        try {
            const { user, onNavigate } = renderSidebar();
            const menu = await openMenu(user);
            await user.click(within(menu).getByRole('menuitem', { name: '退出登录' }));
            expect(logout).toHaveBeenCalledOnce();
            expect(onNavigate).not.toHaveBeenCalled();
            expect(screen.getByRole('button', { name: '账号：侧栏用户' })).toBeDisabled();
            await act(async () => finishLogout({}));
            expect(onNavigate).toHaveBeenCalledWith('/login');
            expect(sessionChanged).toHaveBeenCalledOnce();
        }
        finally {
            window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, sessionChanged);
        }
    });
    it('preserves the session and allows retry when logout fails', async () => {
        vi.spyOn(platformApi, 'logout').mockRejectedValue(new Error('offline'));
        const alert = vi.spyOn(floatingAlert, 'error').mockImplementation(() => undefined);
        const { user, onNavigate } = renderSidebar();
        const menu = await openMenu(user);
        await user.click(within(menu).getByRole('menuitem', { name: '退出登录' }));
        await waitFor(() => expect(alert).toHaveBeenCalledWith('退出登录失败'));
        expect(onNavigate).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: '账号：侧栏用户' })).toBeEnabled();
    });
    it('guards the menu while the verified account is unavailable', () => {
        renderSidebar(null);
        expect(screen.getByRole('button', { name: `账号：${i18n.t('auth.login')}` })).toBeDisabled();
    });
});
