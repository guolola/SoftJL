// Guards the sidebar footer after removing the promotional video card.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../../shared/i18n';
import { SidebarProvider } from '../../../shared/ui/sidebar';
import { PlatformSidebar } from './platform-sidebar';

describe('platform sidebar', () => {
  afterEach(async () => { await i18n.changeLanguage('zh-CN'); });

  it.each(['zh-CN', 'en'])('retains the account menu without a promotional card in %s', async language => {
    await i18n.changeLanguage(language);
    const { container } = render(
      <SidebarProvider><PlatformSidebar path='/projects' onOpenAccount={vi.fn()} onNavigate={vi.fn()} /></SidebarProvider>,
    );
    const footer = container.querySelector('[data-slot="sidebar-footer"]')!;
    expect(footer).toContainElement(screen.getByRole('button', { name: `${i18n.t('auth.account')}：${i18n.t('auth.login')}` }));
    expect(container.querySelector('[data-slot="sidebar-promotional-video-card"], video, source')).toBeNull();
    expect(screen.queryByText(/产品宣传视频|Product video/)).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/exam"]')).toBeNull();
    expect(screen.getByRole('link', { name: i18n.t('nav.projects') })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('link', { name: i18n.t('nav.dashboard') })).toHaveAttribute('href', '/dashboard');
  });
});
