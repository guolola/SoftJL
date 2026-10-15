// Guards the homepage composition and hosted guide entry points after removing the promotion.
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/shared/i18n'
import { saveLocalePreference } from '@/shared/i18n/locale'
import { AppI18nProvider } from '@/app/providers/i18n-provider'
import { ThemeProvider } from '@/shared/ui/theme-provider'
import { MarketingHomePage } from './marketing-home-page'

vi.mock('@/features/user-platform/services/platform-api', () => ({
  AUTH_SESSION_CHANGED_EVENT: 'uml-platform-auth-session-changed',
  platformApi: { me: vi.fn(async () => ({ user: null })) }
}))

describe('marketing homepage', () => {
  afterEach(async () => {
    saveLocalePreference('system')
    await i18n.changeLanguage('zh-CN')
  })

  it.each(['zh-CN', 'en'] as const)('shows the homepage without promotional media and links to the hosted guide in %s', async language => {
    saveLocalePreference(language)
    const { container } = render(
      <AppI18nProvider><ThemeProvider><MarketingHomePage onNavigate={vi.fn()} /></ThemeProvider></AppI18nProvider>
    )
    await screen.findByRole('link', { name: language === 'en' ? 'Login' : '登录' })
    const sections = Array.from(container.querySelectorAll('main > section'), section => section.id)
    expect(sections.slice(0, 2)).toEqual(['home', 'trusted-brands'])
    expect(container.querySelector('#product-video, video, source')).toBeNull()
    expect(screen.queryByRole('button', { name: /观看宣传视频|Watch promotional video/ })).not.toBeInTheDocument()

    // Exercise navigation, hero, details, benefits and footer links in the composed page.
    const guides = screen.getAllByRole('link', { name: /^(使用指南|阅读指南|查看使用指南|详细说明|Guide|Read the guide|Details)$/ })
    expect(guides.length).toBeGreaterThanOrEqual(5)
    for (const guide of guides) expect(guide).toHaveAttribute('href', 'https://jianglisoftware.com/tutorial')
    expect(container.querySelector('a[href="/tutorial"]')).toBeNull()
  })
})
