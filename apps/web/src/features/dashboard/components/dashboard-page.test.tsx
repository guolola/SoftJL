// Verifies the real dashboard loading/error states, project table and existing route navigation.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './dashboard-page'
import { dashboardApi } from '../services/dashboard-api'
import { dashboardFixture } from '../testing/dashboard-fixture'
import { i18n } from '@/shared/i18n'
vi.mock('../services/dashboard-api', () => ({ dashboardApi: { getSummary: vi.fn() } }))

describe('DashboardPage shell-06', () => {
  beforeEach(async () => { await i18n.changeLanguage('zh-CN'); vi.mocked(dashboardApi.getSummary).mockResolvedValue(dashboardFixture()) })
  afterEach(() => vi.resetAllMocks())
  it('renders the supplied six-column content grid with real summary fields and working project/history links', async () => {
    const navigate = vi.fn(); render(<DashboardPage onNavigate={navigate} />)
    expect(screen.getByTestId('dashboard-shell')).toHaveAttribute('aria-busy', 'true')
    const grid = await screen.findByTestId('dashboard-06-grid')
    expect(grid).toHaveClass('grid', 'grid-cols-6', 'gap-6')
    expect(grid.children).toHaveLength(12)
    expect(grid.parentElement).toHaveClass('mx-auto', 'max-w-360', 'px-4', 'sm:px-6')
    const performance = screen.getByText('协作与任务活动').closest('[data-slot="card"]')!
    const tabs = performance.querySelector('[data-slot="tabs"]')!
    expect(tabs).toHaveClass('flex-col')
    expect(tabs.querySelector('[data-slot="tabs-list"]')).toHaveClass('w-full', 'h-9')
    fireEvent.click(within(performance as HTMLElement).getByRole('tab', { name: '月度任务' }))
    expect(within(performance as HTMLElement).getByRole('tab', { name: '月度任务' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(within(performance as HTMLElement).getByRole('tab', { name: '协作成员' }))
    expect(screen.getByText('文档生成任务')).toBeInTheDocument()
    const duration = screen.getAllByText('平均生成耗时')[0].closest('[data-slot="card"]')!
    expect(within(duration as HTMLElement).getAllByText('需求规格说明书').length).toBeGreaterThan(0)
    expect(within(duration as HTMLElement).getAllByText('实现方案').length).toBeGreaterThan(0)
    expect(within(duration as HTMLElement).queryByText('66.7%')).not.toBeInTheDocument()
    expect(screen.queryByText('Total Profit')).not.toBeInTheDocument()
    expect(screen.queryByText('仪表盘')).not.toBeInTheDocument()
    expect(screen.getByText('与上月持平')).toBeInTheDocument()
    expect(screen.queryByText('0 pp')).not.toBeInTheDocument()
    expect(screen.queryByText('有效完成样本 · 生成至产物就绪 · 不含任务排队')).not.toBeInTheDocument()
    expect(screen.queryByText('完成 ÷ 已结束任务')).not.toBeInTheDocument()
    expect(screen.getByText('参与项目协作的成员')).toBeInTheDocument()
    expect(screen.queryByText('活跃协作成员按用户去重')).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('table', { name: '项目列表' })).getByRole('button', { name: '图书馆系统' }))
    expect(navigate).toHaveBeenCalledWith('/projects/p-0')
    const recent = screen.getByText('最近生成任务').closest('[data-slot="card"]')!
    fireEvent.click(within(recent as HTMLElement).getByRole('button', { name: '图书馆系统' }))
    expect(navigate).toHaveBeenCalledWith('/projects/p-0/history')
  })
  it('filters, paginates, selects and sorts projects; an unstarted workflow shows zero progress', async () => {
    render(<DashboardPage onNavigate={() => {}} />); await screen.findByTestId('dashboard-06-grid')
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getByText('项目 6')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: '项目列表' })).getByText('0/20')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索项目' }), { target: { value: '图书馆' } })
    expect(screen.getByRole('checkbox', { name: '选择项目 图书馆系统' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: '选择项目 图书馆系统' }))
    expect(screen.getByRole('checkbox', { name: '选择项目 图书馆系统' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '平均生成耗时' }))
    expect(screen.getByRole('columnheader', { name: '平均生成耗时' })).toHaveAttribute('aria-sort', 'descending')
    fireEvent.change(screen.getByRole('textbox', { name: '搜索项目' }), { target: { value: 'no-match' } })
    expect(screen.getByText('第 0–0 条，共 0 条')).toBeInTheDocument()
  })
  it('shows stage completion instead of generation success and sorts by numeric workflow progress', async () => {
    const summary = dashboardFixture(3)
    summary.projects[1].progress = { completed: 20, total: 20, percentage: 100 }
    summary.projects[2].progress = { completed: 5, total: 20, percentage: 25 }
    vi.mocked(dashboardApi.getSummary).mockResolvedValue(summary)
    render(<DashboardPage onNavigate={() => {}} />); await screen.findByTestId('dashboard-06-grid')
    const table = screen.getByRole('table', { name: '项目列表' })
    expect(within(table).getByRole('columnheader', { name: '进度' })).toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: '生成成功率' })).not.toBeInTheDocument()
    const row = within(table).getByRole('button', { name: '图书馆系统' }).closest('tr')!
    expect(within(row).getByText('15/20')).toBeInTheDocument()
    expect(within(row).getByRole('progressbar', { name: '进度' })).toHaveAttribute('aria-valuenow', '75')
    expect(within(row).getByText('15/20').parentElement).toHaveAttribute('title', '可行性分析: 3/3 · 需求模型: 7/7 · 设计模型: 5/7 · 说明书: 0/3')
    fireEvent.click(within(table).getByRole('button', { name: '进度' }))
    expect(within(table).getByRole('columnheader', { name: '进度' })).toHaveAttribute('aria-sort', 'descending')
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('项目 1')
    fireEvent.click(within(table).getByRole('button', { name: '进度' }))
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('项目 2')
  })
  it('retains all cards when empty and offers project creation', async () => {
    vi.mocked(dashboardApi.getSummary).mockResolvedValue(dashboardFixture(0))
    const navigate = vi.fn(); render(<DashboardPage onNavigate={navigate} />)
    expect(await screen.findByTestId('dashboard-06-grid')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新建项目' }))
    expect(navigate).toHaveBeenCalledWith('/projects/new')
    expect(screen.getByText('暂无生成任务')).toBeInTheDocument()
  })
  it('shows errors and retries instead of displaying sample data', async () => {
    vi.mocked(dashboardApi.getSummary).mockRejectedValueOnce(new Error('Unavailable'))
    render(<DashboardPage onNavigate={() => {}} />)
    expect(await screen.findByText('Unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-06-grid')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await screen.findByTestId('dashboard-06-grid')
    await waitFor(() => expect(dashboardApi.getSummary).toHaveBeenCalledTimes(2))
  })
  it('drills down to named artifacts and resets pagination when searching', async () => {
    const user = userEvent.setup()
    render(<DashboardPage onNavigate={() => {}} />); await screen.findByTestId('dashboard-06-grid')
    await user.click(screen.getByRole('combobox', { name: '耗时统计维度' }))
    await user.click(await screen.findByRole('option', { name: '按具体产物' }))
    expect(await screen.findByRole('button', { name: '耗时下一页' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '耗时下一页' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索产物名称或类型' }), { target: { value: '需求说明书 0' } })
    expect(screen.getByRole('button', { name: '需求说明书 0.docx' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '耗时下一页' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索产物名称或类型' }), { target: { value: 'no-match' } })
    expect(screen.getByText('暂无匹配产物或有效耗时记录')).toBeInTheDocument()
  })
})
