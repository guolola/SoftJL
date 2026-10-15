// Verifies the header user menu presents the same ordered account and platform destinations as the sidebar.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../../shared/i18n';
import { ProfileDropdown } from './profile-dropdown';

describe('header profile dropdown', () => {
  it('shows the community entries in order and opens each destination', async () => {
    const onAccount = vi.fn();
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<I18nextProvider i18n={i18n}>
      <ProfileDropdown user={{ id: 'user-1', username: 'header-user', displayName: '顶栏用户', email: 'header@example.test', status: 'active', emailVerified: true, mfaEnabled: false }} onAccount={onAccount} onNavigate={onNavigate} />
    </I18nextProvider>);
    const openMenu = async () => {
      await user.click(screen.getByRole('button', { name: i18n.t('auth.account') }));
      return screen.findByRole('menu');
    };
    let menu = await openMenu();
    expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      i18n.t('auth.account'), i18n.t('nav.dashboard'), i18n.t('nav.projects'),
      i18n.t('nav.exam'), i18n.t('nav.tutorial'),
    ]);
    await user.click(within(menu).getByRole('menuitem', { name: i18n.t('auth.account') }));
    expect(onAccount).toHaveBeenCalledOnce();
    for (const [label, path] of [
      ['nav.dashboard', '/dashboard'], ['nav.projects', '/projects'],
      ['nav.exam', '/exam'], ['nav.tutorial', '/tutorial'],
    ]) {
      menu = await openMenu();
      await user.click(within(menu).getByRole('menuitem', { name: i18n.t(label) }));
      expect(onNavigate).toHaveBeenLastCalledWith(path);
    }
  });
});
