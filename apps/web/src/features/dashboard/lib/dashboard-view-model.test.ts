// Covers display semantics that differ from the template's demo sales and conversion data.
import { describe, expect, it } from 'vitest'
import { buildDashboardViewModel } from './dashboard-view-model'
import { dashboardFixture } from '../testing/dashboard-fixture'

const t = (key: string) => key
describe('dashboard view model', () => {
  it('keeps project workflow progress independent of success rates and task counts', () => {
    const summary = dashboardFixture()
    summary.projects[1].runs = 200
    summary.projects[1].successRate = 0
    const view = buildDashboardViewModel(summary, t, 'zh-CN')
    expect(view.conversion.totalConversion).toBe(66.7)
    expect(view.table.find(project => project.id === 'p-1')?.progress).toMatchObject({ completed: 15, total: 20, percentage: 75 })
    expect(view.table[1].progress?.details).toContain('progressStageNames.document: 0/3')
    expect(view.table[1].progress?.details).toContain('progressStageNames.design: 5/7')
  })
  it('does not substitute success rate when an older response lacks workflow progress', () => {
    const summary = dashboardFixture(1)
    delete summary.projects[0].progress
    expect(buildDashboardViewModel(summary, t, 'en').table[0].progress).toBeNull()
  })
  it('keeps absent rates null and does not fabricate growth against a zero baseline', () => {
    const summary = dashboardFixture(0)
    const view = buildDashboardViewModel(summary, t, 'en')
    expect(view.conversion.totalConversion).toBeNull()
    expect(view.conversion.percentageChange).toBeNull()
    expect(view.mini.completed.changePercentage).toBe('—')
    expect(view.conversion.chartData.every(point => point.conversion === null)).toBe(true)
  })
})
