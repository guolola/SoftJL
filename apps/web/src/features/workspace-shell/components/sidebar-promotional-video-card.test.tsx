// Verifies sidebar placement, deferred playback, close behavior and translated labels.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../../shared/i18n';
import { SidebarProvider } from '../../../shared/ui/sidebar';
import { PlatformSidebar } from './platform-sidebar';
import { SidebarPromotionalVideoCard } from './sidebar-promotional-video-card';

describe('sidebar promotional video card', () => {
  beforeEach(async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    await i18n.changeLanguage('zh-CN');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage('zh-CN');
  });

  it('places the card in the platform footer above the account menu without loading media', () => {
    const { container } = render(
      <SidebarProvider><PlatformSidebar path='/projects' onOpenAccount={vi.fn()} onNavigate={vi.fn()} /></SidebarProvider>,
    );
    const footer = container.querySelector('[data-slot="sidebar-footer"]')!;
    expect(footer).toContainElement(screen.getByText('产品宣传视频'));
    expect(footer.children[0]).toContainElement(screen.getByRole('button', { name: '观看', exact: true }));
    expect(footer.children[1]).toContainElement(screen.getByRole('button', { name: `${i18n.t('auth.account')}：${i18n.t('auth.login')}` }));
    expect(document.querySelector('video, source')).toBeNull();
  });

  it('opens the existing promotional video with accessible controls, then pauses and restores focus', async () => {
    const user = userEvent.setup();
    render(<SidebarPromotionalVideoCard />);
    const trigger = screen.getByRole('button', { name: '观看', exact: true });
    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: '产品宣传视频' })).toBeInTheDocument();
    const video = screen.getByLabelText('产品宣传视频', { selector: 'video' }) as HTMLVideoElement;
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('autoplay');
    expect(video.querySelector('source')).toHaveAttribute('src', 'https://tuolola.oss-cn-chengdu.aliyuncs.com/video/bilibili.mp4');
    video.currentTime = 15;
    await user.click(screen.getByRole('button', { name: '关闭视频' }));

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video).toHaveAttribute('preload', 'none');
    await waitFor(() => expect(video).not.toBeVisible());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    expect(screen.getByLabelText('产品宣传视频', { selector: 'video' })).toBe(video);
    expect(video.currentTime).toBe(15);
    expect(video.play).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(video.pause).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps manual playback available when the browser rejects resume', async () => {
    const user = userEvent.setup();
    render(<SidebarPromotionalVideoCard />);
    const trigger = screen.getByRole('button', { name: '观看', exact: true });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: '关闭视频' }));
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Playback blocked'));
    await user.click(trigger);
    expect(screen.getByLabelText('产品宣传视频', { selector: 'video' })).toHaveAttribute('controls');
  });

  it('also plays from the cover and returns focus to that cover on close', async () => {
    const user = userEvent.setup();
    render(<SidebarPromotionalVideoCard />);
    const cover = screen.getByRole('button', { name: '播放产品宣传视频' });
    await user.click(cover);
    expect(screen.getByRole('dialog', { name: '产品宣传视频' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭视频' }));
    await waitFor(() => expect(cover).toHaveFocus());
  });

  it('translates the card and dialog when the interface language changes', async () => {
    render(<SidebarPromotionalVideoCard />);
    await userEvent.click(screen.getByRole('button', { name: '观看', exact: true }));
    await i18n.changeLanguage('en');
    expect(await screen.findByRole('dialog', { name: 'Product video' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close video' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close video' }));
    expect(screen.getByRole('button', { name: 'Watch', exact: true })).toBeInTheDocument();
  });
});
