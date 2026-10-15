// Verifies the new marketing hero's localized copy, real links, retained background, and static motion option.
import { readFileSync } from 'node:fs'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/shared/i18n'
import HeroSection from './platform-hero-section'

const reducedMotion = vi.hoisted(() => ({ value: false }))
vi.mock('motion/react', async importOriginal => ({
  ...await importOriginal<typeof import('motion/react')>(),
  useReducedMotion: () => reducedMotion.value
}))

describe('marketing hero', () => {
  beforeEach(async () => {
    reducedMotion.value = false
    await i18n.changeLanguage('zh-CN')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows platform content and keeps the existing grid background', () => {
    const { container } = render(<HeroSection />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/用 AI 辅助\s*毕业设计/u)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('设计有依据')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('修改有方向')
    expect(screen.getByText('面向毕设与课程设计的工程实践工作台')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('🚀')
    expect(screen.getByText(/从需求规则关联 UML/u)).toHaveTextContent('检查覆盖缺口，查看修改影响，梳理答辩依据')
    expect(screen.getByText(/从需求规则关联 UML/u)).toHaveTextContent('在自己的仓库中运行和验证')
    expect(screen.queryByRole('link', { name: '开始项目' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '开始我的项目' })).toHaveAttribute('href', '/projects')
    expect(screen.getByRole('link', { name: '阅读指南' })).toHaveAttribute('href', 'https://jianglisoftware.com/tutorial')
    const socialProof = screen.getByTestId('hero-social-proof')
    expect(socialProof).toHaveTextContent('检查覆盖 · 查看更新影响 · 梳理答辩依据')
    expect(container.textContent).not.toContain('示例')
    expect(socialProof).toHaveTextContent('4.5')
    expect(socialProof.querySelectorAll('[data-slot="avatar"]')).toHaveLength(4)
    expect(socialProof.querySelectorAll('[data-slot="rating-star"]')).toHaveLength(5)
    expect(screen.getByRole('img', { name: '评分：满分 5 分中的 4.5 分' })).toBeInTheDocument()
    for (const number of [11, 12, 13, 14]) {
      const asset = readFileSync(`public/marketing/avatars/avatar-${number}.png`)
      expect(asset.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    }
    expect(screen.getByTestId('hero-capability-card-left')).toHaveTextContent('需求 → UML 模型')
    expect(screen.getByTestId('hero-capability-card-right')).toHaveTextContent('设计 → 文档与编码依据')
    const orbit = screen.getByTestId('hero-orbit')
    const centerLogo = orbit.querySelector('[data-slot="product-logo"]')
    expect(centerLogo).toHaveClass('size-full')
    expect(centerLogo).toHaveAttribute('data-variant', 'badge')
    expect(centerLogo?.parentElement).not.toHaveClass('bg-card', 'border', 'rounded-2xl')
    expect(orbit).toHaveClass('pointer-events-none')
    const brandMarks = orbit.querySelectorAll('[data-brand-name]')
    expect(brandMarks).toHaveLength(12)
    expect(Array.from(brandMarks, mark => mark.getAttribute('data-brand-name'))).toEqual([
      'Codex', 'Claude Code', 'Cursor', 'WorkBuddy', 'Qoder', 'TRAE',
      'GitHub Copilot', 'Cline', 'Windsurf', 'Roo Code', 'OpenCode', 'VS Code'
    ])
    expect(orbit.querySelectorAll('[data-brand-name] img')).toHaveLength(12)
    for (const logo of orbit.querySelectorAll('[data-brand-name] img')) expect(logo).not.toHaveClass('grayscale')
    for (const brand of ['Codex', 'Claude Code', 'WorkBuddy', 'Qoder', 'TRAE', 'VS Code']) {
      const logo = orbit.querySelector('[data-brand-name="' + brand + '"] img')
      expect(logo).not.toHaveClass('dark:invert')
    }
    expect(orbit.querySelector('[data-brand-name="Qoder"] img')?.parentElement).toHaveClass('bg-white')
    for (const brand of ['Cursor', 'GitHub Copilot', 'Cline', 'Windsurf', 'Roo Code', 'OpenCode']) {
      expect(orbit.querySelector('[data-brand-name="' + brand + '"] img')).toHaveClass('dark:invert')
    }
    expect(orbit.querySelectorAll('[data-brand-name] svg')).toHaveLength(0)
    expect(orbit.querySelector('img[src="/marketing/logos/github.svg"]')).toBeNull()
    expect(container.querySelectorAll('#home .cell').length).toBeGreaterThan(0)
    expect(container.querySelector('img[src^="/help/images/workbench-"]')).toBeNull()
    expect(container.textContent).not.toContain('1000+')
  })

  it('renders the same hero in English', async () => {
    await i18n.changeLanguage('en')
    render(<HeroSection />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Build capstone projects with AI')
    expect(screen.getByText('An engineering workspace for capstone and course projects')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Trace your designs,')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('guide your revisions')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('🚀')
    expect(screen.getByRole('link', { name: 'Start my project' })).toHaveAttribute('href', '/projects')
    expect(screen.getByRole('link', { name: 'Read the guide' })).toHaveAttribute('href', 'https://jianglisoftware.com/tutorial')
    expect(screen.getByText(/Connect requirement rules to UML/u)).toHaveTextContent('Review coverage gaps, follow change impacts')
    expect(screen.getByText(/Connect requirement rules to UML/u)).toHaveTextContent('implementation and verification')
    expect(screen.queryByRole('link', { name: 'Start your project' })).not.toBeInTheDocument()
    expect(screen.getByTestId('hero-social-proof')).toHaveTextContent('Review coverage · Follow changes · Explain your work')
    expect(screen.getByTestId('hero-social-proof')).not.toHaveTextContent(/example/i)
    expect(screen.getByRole('img', { name: 'Rating: 4.5 out of 5' })).toBeInTheDocument()
  })

  it('keeps the changing headline still when reduced motion is requested', () => {
    reducedMotion.value = true
    vi.useFakeTimers()
    render(<HeroSection />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('毕业设计')
    act(() => { vi.advanceTimersByTime(4_000) })
    expect(heading).toHaveTextContent('毕业设计')
  })
})
