// Guards the homepage brand assets and the original benefits/FAQ presentation behavior.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { i18n } from '@/shared/i18n'

import Benefits from './benefits/benefits'
import Features from './features/features'
import FAQ from './faq/faq'
import TrustedBrands from './trusted-brands/trusted-brands'
import Footer from '../layout/footer'
import { flowText } from '../../../model/flow-copy'
import { benefits } from '../../content/benefits'
import { faqItems } from '../../content/faqs'
import { logos, orbitLogos } from '../../content/trusted-brands'

describe('marketing homepage sections', () => {
  afterEach(async () => {
    await i18n.changeLanguage('zh-CN')
  })

  it('keeps the three stages in separate chart columns without example copy', () => {
    const { container } = render(<Features />)

    expect(screen.getByText('项目概览')).toBeInTheDocument()
    expect(screen.getByText('产物跟踪')).toBeInTheDocument()
    expect(screen.getByText('项目阶段目标')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '把需求、设计、测试和说明书关联起来' })).toBeInTheDocument()
    expect(container.textContent).not.toContain('示例')

    const stages = screen.getAllByTestId('feature-stage')
    expect(stages).toHaveLength(3)
    expect(stages[0].parentElement).toHaveClass('grid-cols-3')
    expect(stages[0]).toHaveTextContent('28%')
    expect(stages[1]).toHaveTextContent('78%')
    expect(stages[2]).toHaveTextContent('32%')
  })

  it('shows English project and artifact labels without example copy', async () => {
    await i18n.changeLanguage('en')
    const { container } = render(<Features />)

    expect(screen.getByText('Project overview')).toBeInTheDocument()
    expect(screen.getByText('Artifact tracking')).toBeInTheDocument()
    expect(screen.getByText('Project milestone')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Connect requirements, designs, tests and specifications' })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/example|sample/i)
  })

  it('shows seven distinct monochrome software brands with neutral copy', () => {
    const { container } = render(<TrustedBrands brandLogos={logos} />)

    expect(logos).toHaveLength(7)
    expect(orbitLogos).toHaveLength(12)
    expect(new Set([...orbitLogos, ...logos].map(logo => logo.name)).size).toBe(19)
    expect(screen.getByText('软件工程领域的工具与平台')).toBeInTheDocument()
    for (const logo of logos) {
      const renderedLogos = screen.getAllByAltText(flowText(logo.name))
      expect(renderedLogos.length).toBeGreaterThan(0)
      expect(renderedLogos[0]).toHaveAttribute('src', logo.image)
      expect(renderedLogos[0]).toHaveClass('grayscale', 'dark:invert')
    }
    expect(container.querySelectorAll('#trusted-brands img')).toHaveLength(7 * 4)
  })

  it('keeps the original sticky benefits layout while rendering shadcn-studio previews', () => {
    const { container } = render(<Benefits featuresList={benefits} />)

    expect(screen.getByRole('heading', { name: flowText('How Flow Helps You') })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看使用指南' })).toHaveAttribute('href', '/tutorial')
    for (const title of ['需求改了，哪些设计要更新？', '提交前，还有哪些需求没覆盖？', '图表和说明书，怎样一起核对？', '答辩时，怎么讲清设计依据？']) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0)
    }
    expect(container.querySelectorAll('#benefits .sticky')).not.toHaveLength(0)
    expect(screen.getAllByTestId('benefit-studio-preview')).toHaveLength(benefits.length * 2)
    for (const kind of ['overview', 'models', 'workflow', 'history']) {
      expect(container.querySelectorAll(`[data-preview-kind="${kind}"]`)).toHaveLength(2)
    }
    expect(container.querySelector('#benefits img')).not.toBeInTheDocument()
  })

  it('only swaps the FAQ illustration while preserving its layout and hover animation', () => {
    render(<FAQ faqItems={faqItems} />)
    expect(screen.getByRole('button', { name: '毕业设计和课程设计，可以用它做什么？' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '可以导出哪些毕设材料？' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '系统设计完成后，怎么衔接代码实现？' })).toBeInTheDocument()

    const preview = screen.getByTestId('faq-dashboard-preview')
    expect(preview).toHaveClass('max-w-148', 'lg:max-xl:max-h-95')
    expect(preview.parentElement).toHaveClass('lg:grid-cols-2')

    const images = preview.querySelectorAll('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', '/marketing/generated/workbench-dashboard-light.png')
    expect(images[1]).toHaveAttribute('src', '/marketing/generated/workbench-dashboard-dark.png')
    expect(images[0]).toHaveClass('scale-90', 'group-hover:scale-100')
    expect(images[1]).toHaveClass('scale-90', 'group-hover:scale-100')
  })

  it('shows the personal-site statement, contact and regulatory filing links', () => {
    render(<Footer />)

    expect(screen.getByText(/本站为个人技术分享网站/u)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '672250123@qq.com' })).toHaveAttribute(
      'href',
      'mailto:672250123@qq.com'
    )
    expect(screen.getByRole('link', { name: '闽ICP备2026024395号' })).toHaveAttribute(
      'href',
      'https://beian.miit.gov.cn/'
    )
    expect(screen.getByRole('link', { name: '闽公网安备35010402351938号' })).toHaveAttribute(
      'href',
      'https://beian.mps.gov.cn/#/query/webSearch?code=35010402351938'
    )
    expect(screen.queryByLabelText('Github Link')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Instagram Link')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Twitter Link')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Youtube Link')).not.toBeInTheDocument()
    for (const logo of logos) {
      const footerLogo = screen.getAllByAltText(flowText(logo.name)).at(-1)
      expect(footerLogo).toHaveAttribute('src', logo.image)
      expect(footerLogo).toHaveClass('grayscale', 'dark:invert')
    }
  })

  it.each(['zh-CN', 'en'] as const)('explains revisions and verification boundaries in the %s FAQ', async (locale) => {
    await i18n.changeLanguage(locale)
    const user = userEvent.setup()
    render(<FAQ faqItems={faqItems} />)

    await user.click(screen.getByRole('button', { name: flowText('How does Flow help my business?') }))
    expect(screen.getByText(flowText(faqItems[1].answer))).toBeVisible()
    expect(screen.getByText(flowText(faqItems[1].answer))).toHaveTextContent(
      locale === 'en' ? 'regenerate them in dependency order' : '按依赖顺序核对并重新生成'
    )

    await user.click(screen.getByRole('button', { name: flowText('Do I need technical knowledge to use it?') }))
    expect(screen.getByText(flowText(faqItems[3].answer))).toBeVisible()
    expect(screen.getByText(flowText(faqItems[3].answer))).toHaveTextContent(
      locale === 'en' ? 'business correctness requires runtime verification' : '代码的业务正确性需要实际运行验证'
    )

    await user.click(screen.getByRole('button', { name: flowText('Is my data safe with Flow?') }))
    expect(screen.getByText(flowText(faqItems[4].answer))).toBeVisible()
    expect(screen.getByText(flowText(faqItems[4].answer))).toHaveTextContent(
      locale === 'en' ? 'External coding assistant integration is not included' : '社区版不提供外部编程助手连接服务'
    )
  })
})
