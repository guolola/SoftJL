// Verifies the marketing header shares the workspace palette and light/dark theme state.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppI18nProvider } from '@/app/providers/i18n-provider'
import { ThemeProvider, themePresets } from '@/shared/ui/theme-provider'

import { TooltipProvider } from '../ui/tooltip'
import Header from './header'

vi.mock('@/features/user-platform/services/platform-api', () => ({
  AUTH_SESSION_CHANGED_EVENT: 'uml-platform-auth-session-changed',
  notifyAuthSessionChanged: vi.fn(),
  platformApi: {
    logout: vi.fn(async () => undefined),
    me: vi.fn(async () => ({ user: null })),
  },
}))

const presetCssVariables = new Set(
  Object.values(themePresets).flatMap((preset) =>
    Object.values(preset.styles).flatMap((styles) => Object.keys(styles)),
  ),
)

function renderHeader() {
  return render(
    <AppI18nProvider>
      <ThemeProvider>
        <TooltipProvider>
          <Header navigationData={[]} />
        </TooltipProvider>
      </ThemeProvider>
    </AppI18nProvider>,
  )
}

beforeEach(() => {
  localStorage.setItem('admincn-ui-theme', 'light')
  localStorage.setItem('uml-lab-locale-preference', 'zh-CN')
})

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('light', 'dark')
  for (const key of presetCssVariables) {
    document.documentElement.style.removeProperty(`--${key}`)
  }
})

describe('marketing header theme controls', () => {
  it('links to the GitHub repository immediately before the palette', async () => {
    renderHeader()

    const githubLink = screen.getByRole('link', { name: 'GitHub' })
    const paletteButton = await screen.findByRole('button', { name: '主题色板' })

    expect(githubLink).toHaveAttribute('href', 'https://github.com/guolola/SoftJL')
    expect(githubLink).toHaveAttribute('target', '_blank')
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(githubLink).toHaveAttribute('title', 'GitHub')
    expect(paletteButton).toHaveAttribute('title', '主题色板')
    for (const control of [githubLink, paletteButton]) {
      expect(control).toHaveClass('hover:bg-muted', 'hover:text-foreground', 'dark:hover:bg-muted/50')
    }
    expect(githubLink).toHaveClass('size-10', 'rounded-lg', '-mr-1', 'sm:-mr-2', 'lg:-mr-3')
    expect(githubLink.nextElementSibling).toBe(paletteButton)
    expect(githubLink.parentElement).toHaveClass('items-center', 'gap-1', 'sm:gap-4', 'lg:gap-6')
    expect(githubLink.querySelector('svg')).toHaveClass('size-5')
    expect(paletteButton.querySelector('svg')).toHaveClass('size-5')
  })

  it('renders the shared palette immediately before the light/dark toggle', async () => {
    renderHeader()

    expect(screen.getByRole('link', { name: 'SoftJL' })).toHaveAttribute('href', '/#home')
    const paletteButton = await screen.findByRole('button', { name: '主题色板' })
    const modeButton = screen.getByRole('button', { name: '切换明暗主题' })

    expect(
      paletteButton.compareDocumentPosition(modeButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(paletteButton).toHaveClass('size-10', 'rounded-lg')

    await userEvent.click(paletteButton)
    expect(await screen.findAllByRole('menuitemradio')).toHaveLength(13)
    expect(screen.getByRole('menuitemradio', { name: '默认' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Caffeine' })).toBeInTheDocument()
  })

  it('applies one palette to the marketing header and its dark-mode branch', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(await screen.findByRole('button', { name: '主题色板' }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Caffeine' }))

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--primary'))
        .toBe(themePresets.caffeine.styles.light.primary)
    })
    expect(localStorage.getItem('admincn-ui-theme-preset')).toBe('caffeine')

    const modeButton = screen.getByRole('button', { name: '切换明暗主题' })
    const icons = modeButton.querySelectorAll('svg')
    expect(icons).toHaveLength(2)
    expect(icons[0]).toHaveClass('scale-100', 'dark:scale-0')
    expect(icons[1]).toHaveClass('scale-0', 'dark:scale-100')

    await user.click(modeButton)
    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark')
      expect(document.documentElement.style.getPropertyValue('--primary'))
        .toBe(themePresets.caffeine.styles.dark.primary)
    })
    expect(localStorage.getItem('admincn-ui-theme')).toBe('dark')
  })
})
