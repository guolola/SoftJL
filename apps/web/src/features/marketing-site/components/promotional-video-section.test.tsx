// Guards deferred loading, buffered-player reuse, close/pause behavior and homepage placement.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/shared/i18n'
import { AppI18nProvider } from '@/app/providers/i18n-provider'
import { ThemeProvider } from '@/shared/ui/theme-provider'
import { MarketingHomePage } from './marketing-home-page'
import { PromotionalVideoSection } from './promotional-video-section'

vi.mock('../model/use-homepage-pricing', () => ({ useHomepagePricing: () => [] }))
vi.mock('@/features/user-platform/services/platform-api', () => ({
  AUTH_SESSION_CHANGED_EVENT: 'uml-platform-auth-session-changed',
  notifyAuthSessionChanged: vi.fn(),
  platformApi: { me: vi.fn(async () => ({ user: null })) }
}))

describe('homepage promotional video', () => {
  beforeEach(async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    await i18n.changeLanguage('zh-CN')
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await i18n.changeLanguage('zh-CN')
  })

  it('shows a watch button without loading any video source before opening', () => {
    render(<PromotionalVideoSection />)

    expect(screen.getByRole('region', { name: '看看平台如何助力工程实践' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '观看宣传视频' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('video, source')).toBeNull()
  })

  it('loads the video with native controls and starts playback only after opening', async () => {
    render(<PromotionalVideoSection />)
    await userEvent.click(screen.getByRole('button', { name: '观看宣传视频' }))

    expect(screen.getByRole('dialog', { name: '平台宣传视频' })).toBeInTheDocument()
    const video = screen.getByLabelText('平台宣传视频', { selector: 'video' })
    expect(video.tagName).toBe('VIDEO')
    expect(video).toHaveAttribute('controls')
    expect(video).toHaveAttribute('playsinline')
    expect(video).toHaveAttribute('preload', 'metadata')
    expect(video).toHaveAttribute('autoplay')
    expect(video).not.toHaveAttribute('loop')
    expect(video.querySelector('source')).toHaveAttribute('src', 'https://tuolola.oss-cn-chengdu.aliyuncs.com/video/bilibili.mp4')
    expect(video.querySelector('source')).toHaveAttribute('type', 'video/mp4')
  })

  it('pauses on close and reuses the same player and progress when reopened', async () => {
    const user = userEvent.setup()
    render(<PromotionalVideoSection />)
    const trigger = screen.getByRole('button', { name: '观看宣传视频' })
    await user.click(trigger)
    const firstVideo = screen.getByLabelText('平台宣传视频', { selector: 'video' }) as HTMLVideoElement
    firstVideo.currentTime = 15
    const firstSource = firstVideo.querySelector('source')
    await user.click(screen.getByRole('button', { name: '关闭视频' }))

    expect(firstVideo.pause).toHaveBeenCalledTimes(1)
    expect(firstVideo).toBeInTheDocument()
    expect(firstVideo).toHaveAttribute('preload', 'none')
    await waitFor(() => expect(firstVideo).not.toBeVisible())
    await waitFor(() => expect(trigger).toHaveFocus())
    await user.click(trigger)
    expect(screen.getByLabelText('平台宣传视频', { selector: 'video' })).toBe(firstVideo)
    expect(firstVideo.querySelector('source')).toBe(firstSource)
    expect(firstVideo.currentTime).toBe(15)
    expect(firstVideo.play).toHaveBeenCalledTimes(1)
    expect(firstVideo).toHaveAttribute('preload', 'metadata')
    await user.keyboard('{Escape}')
    expect(firstVideo.pause).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps native playback controls when resuming is rejected by the browser', async () => {
    const user = userEvent.setup()
    render(<PromotionalVideoSection />)
    const trigger = screen.getByRole('button', { name: '观看宣传视频' })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: '关闭视频' }))
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Playback blocked'))
    await user.click(trigger)

    expect(screen.getByRole('dialog', { name: '平台宣传视频' })).toBeInTheDocument()
    expect(screen.getByLabelText('平台宣传视频', { selector: 'video' })).toHaveAttribute('controls')
  })

  it('translates the section and player label into English', async () => {
    await i18n.changeLanguage('en')
    render(<PromotionalVideoSection />)

    expect(screen.getByRole('region', { name: 'See the platform in action' })).toBeInTheDocument()
    expect(screen.getByText('Product video')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Watch promotional video' }))
    expect(screen.getByRole('dialog', { name: 'Platform promotional video' })).toBeInTheDocument()
    expect(screen.getByLabelText('Platform promotional video', { selector: 'video' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close video' })).toBeInTheDocument()
  })

  it('places the video after the hero and before the brand section on the homepage', async () => {
    const { container } = render(
      <AppI18nProvider>
        <ThemeProvider>
          <MarketingHomePage onNavigate={vi.fn()} />
        </ThemeProvider>
      </AppI18nProvider>
    )
    await screen.findByRole('link', { name: '登录' })
    const sections = Array.from(container.querySelectorAll('main > section'), section => section.id)

    expect(sections.slice(0, 3)).toEqual(['home', 'product-video', 'trusted-brands'])
    expect(document.querySelector('video, source')).toBeNull()
    expect(screen.getAllByRole('link', { name: '开始我的项目' })[0]).toHaveAttribute('href', '/projects')
    await userEvent.click(screen.getByRole('button', { name: '观看宣传视频' }))
    expect(screen.getByRole('dialog', { name: '平台宣传视频' })).toBeInTheDocument()
    expect(document.querySelectorAll('video')).toHaveLength(1)
  })
})
