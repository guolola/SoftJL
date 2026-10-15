// Verifies the trimmed waitlist content and live language switching on the examination page.
import { act, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/shared/i18n'
import { ExamPage } from './exam-page'

describe('ExamPage', () => {
  afterEach(async () => { await i18n.changeLanguage('zh-CN') })

  it.each([
    { locale: 'zh-CN', page: '考试', titles: ['准备好迎接', '创新体验'],
      description: '考试模块正在建设中，后续将支持课程测评、题目生成与评分，帮助你检验学习成果。',
      units: ['天', '小时', '分钟', '秒'] },
    { locale: 'en', page: 'Exams', titles: ['Get ready to', 'experience innovation'],
      description: 'The exams module is under construction. It will support course assessments, question generation, and grading to help you evaluate your learning.',
      units: ['Days', 'Hours', 'Minutes', 'Seconds'] },
  ])('renders the exam announcement in $locale without branding, user counts, or email signup', async copy => {
    await i18n.changeLanguage(copy.locale)
    render(<I18nextProvider i18n={i18n}><ExamPage /></I18nextProvider>)

    expect(screen.getByRole('main', { name: copy.page })).toBeInTheDocument()
    for (const title of copy.titles) expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    const firstTitle = screen.getByRole('heading', { name: copy.titles[0] })
    const secondTitle = screen.getByRole('heading', { name: copy.titles[1] })
    const titleGap = firstTitle.nextElementSibling!
    const countdown = titleGap.querySelector('[data-slot="exam-countdown"]')!
    expect(countdown).toHaveAttribute('data-slot', 'exam-countdown')
    expect(titleGap.nextElementSibling).toBe(secondTitle)
    expect(screen.getByText(copy.description)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/2K\+/)).not.toBeInTheDocument()
    expect(screen.queryByText(/候补名单|Join Waitlist/)).not.toBeInTheDocument()
    for (const unit of copy.units) expect(screen.getByText(unit)).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.queryByText('shadcn/studio')).not.toBeInTheDocument()
    expect(screen.queryByText('Early access')).not.toBeInTheDocument()
  })

  it('updates the exam copy in both directions without remounting the countdown', async () => {
    await i18n.changeLanguage('zh-CN')
    render(<I18nextProvider i18n={i18n}><ExamPage /></I18nextProvider>)
    const countdown = screen.getByText('秒').parentElement!

    await act(async () => { await i18n.changeLanguage('en') })
    expect(screen.getByRole('heading', { name: 'Get ready to' })).toBeInTheDocument()
    expect(screen.getByText('Seconds').parentElement).toBe(countdown)
    expect(screen.getByText(/The exams module is under construction/)).toBeInTheDocument()
    expect(screen.queryByText('天')).not.toBeInTheDocument()

    await act(async () => { await i18n.changeLanguage('zh-CN') })
    expect(screen.getByRole('heading', { name: '准备好迎接' })).toBeInTheDocument()
    expect(screen.getByText('秒').parentElement).toBe(countdown)
    expect(screen.getByText(/考试模块正在建设中/)).toBeInTheDocument()
    expect(screen.queryByText('Days')).not.toBeInTheDocument()
  })
})
