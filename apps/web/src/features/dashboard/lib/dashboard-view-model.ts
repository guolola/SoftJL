// Translates summary fields into the imported block's presentation props; statistics stay server-side.
import type { DashboardSummary } from '@uml-platform/contracts'
import { initialsFromName } from '@/features/user-platform/hooks/use-platform-workbench'
import type { PerformanceProps } from '@/shared/template/blocks/dashboard/chart-performance'

type Translate = (key: string, options?: Record<string, unknown>) => string
export function formatDashboardDuration(value: number | null) {
  if (value === null) return '—'
  const seconds = Math.round(value / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
export function buildDashboardViewModel(data: DashboardSummary, t: Translate, locale: string) {
  const count = (value: number) => value.toLocaleString(locale)
  const month = (key: string) => new Date(`${key}-01T00:00:00+08:00`).toLocaleDateString(locale, { month: 'short', timeZone: data.timezone })
  const day = (key: string) => new Date(`${key}T00:00:00+08:00`).toLocaleDateString(locale, { weekday: 'short', timeZone: data.timezone })
  const rate = (value: number | null) => value === null ? t('noData') : `${value}%`
  const latest = data.monthly[11], previous = data.monthly[10]
  const change = (current: number, baseline: number) => baseline > 0 ? `${current >= baseline ? '+' : ''}${Math.round((current - baseline) / baseline * 100)}%` : '—'
  const successChange = latest.successRate === null || previous.successRate === null ? null : Math.round((latest.successRate - previous.successRate) * 10) / 10
  const fills = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--primary)']
  const performance: PerformanceProps = {
    title: t('performance'),
    members: { tabLabel: t('collaboration'), person: { name: data.currentUser.displayName, role: t('currentUser'), initials: initialsFromName(data.currentUser.displayName), src: data.currentUser.avatarUrl || undefined },
      badgeLabel: t('projectLabel'), badgeValue: count(data.totals.projects), highlightLabel: t('memberLabel'), highlightValue: count(data.totals.members), highlightTrend: 'up', highlightPct: rate(data.totals.successRate),
      members: data.members.slice(0, 4).map(member => ({ name: member.displayName, initials: initialsFromName(member.displayName), src: member.avatarUrl || undefined })), viewAllLabel: t('viewProjects'), footerStrong: t('memberScope'), footerText: t('memberNote') },
    area: { tabLabel: t('monthly'), leftStat: { label: t('requirements'), value: count(data.monthly.slice(-7).reduce((sum, point) => sum + point.requirements, 0)), trend: 'up' }, rightStat: { label: t('design'), value: count(data.monthly.slice(-7).reduce((sum, point) => sum + point.design, 0)), trend: 'up' },
      headlineLabel: t('taskLabel'), headlineValue: count(data.monthly.slice(-7).reduce((sum, point) => sum + point.runs, 0)), headlineTrend: 'up', headlinePct: t('monthScope'), chartLabel: t('taskLabel'), chartData: data.monthly.slice(-7).map(point => ({ label: month(point.key), value: point.runs })), footerStrong: t('monthScope'), footerText: t('allProjects') },
    bar: { tabLabel: t('daily'), leftStat: { label: t('completedLabel'), value: count(data.daily.reduce((sum, point) => sum + point.completed, 0)), trend: 'up' }, rightStat: { label: t('failed'), value: count(data.daily.reduce((sum, point) => sum + point.failed, 0)), trend: 'down' },
      headlineLabel: t('average'), headlineValue: (data.daily.reduce((sum, point) => sum + point.runs, 0) / 7).toLocaleString(locale, { maximumFractionDigits: 1 }), headlineTrend: 'up', headlinePct: t('dayScope'), chartLabel: t('taskLabel'), chartData: data.daily.map(point => ({ label: day(point.key), value: point.runs })), footerStrong: t('dayScope'), footerText: t('allProjects') },
  }
  return {
    mini: {
      completed: { title: count(data.totals.completed), description: t('completed'), changePercentage: change(latest.completed, previous.completed), chartData: data.monthly.slice(-5).map(point => ({ name: month(point.key), py: point.completed, cy: -point.failed })) },
      types: { title: count(data.totals.requirements + data.totals.design), description: t('taskTypes'), changePercentage: change(latest.requirements + latest.design, previous.requirements + previous.design), chartData: data.monthly.slice(-5).map(point => ({ month: month(point.key), desktop: point.requirements, mobile: point.design })) },
      documents: { title: t('documents'), description: t('last12'), value: count(data.totals.document), changePercentage: change(latest.document, previous.document), chartData: data.monthly.map(point => ({ month: month(point.key), impression: point.document })) },
    },
    kpis: [ { kind: 'projects', title: t('projects'), value: count(data.totals.projects), badgeContent: t('allProjects') }, { kind: 'members', title: t('members'), value: count(data.totals.members), badgeContent: t('uniqueMembers') }, { kind: 'models', title: t('models'), value: count(data.totals.models), badgeContent: t('usedModels') } ],
    conversion: { title: t('success'), subTitle: t('successScope'), totalConversion: data.totals.successRate, conversionTrend: successChange === null ? null : successChange >= 0 ? 'up' as const : 'down' as const, percentageChange: successChange,
      conversionData: [ ['completed', data.totals.completed], ['failed', data.totals.failed], ['cancelled', data.totals.cancelled], ['active', data.totals.active] ].map(([key, value]) => ({ title: t(String(key)), stat: t('count', { count: value }), trend: '', percentageChange: data.totals.runs ? Math.round(Number(value) / data.totals.runs * 1000) / 10 : null })),
      chartData: data.monthly.slice(-7).map(point => ({ month: month(point.key), conversion: point.successRate })) },
    performance,
    weekly: { title: t('weekly'), subTitle: t('weekScope'), chartData: data.weekly.days.map((point, index) => ({ day: day(point.key), earning: point.runs, fill: fills[index % fills.length] })),
      stats: [ { kind: 'requirements', value: data.weekly.requirements }, { kind: 'design', value: data.weekly.design }, { kind: 'document', value: data.weekly.document } ].map(item => ({ kind: item.kind, title: t(item.kind), department: t('share'), value: count(item.value), trend: '', percentage: data.weekly.total ? Math.round(item.value / data.weekly.total * 1000) / 10 : null })) },
    recent: data.recentRuns.map(run => ({ id: run.runId, projectId: run.projectId, projectName: run.projectName, type: t(run.runKind === 'requirements' ? 'requirement' : run.runKind), kind: run.runKind, date: run.createdAt ? new Date(run.createdAt).toLocaleString(locale, { timeZone: data.timezone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—', status: t(`status.${run.status}`), duration: formatDashboardDuration(run.durationMs) })),
    table: data.projects.map(project => ({ id: project.id, project: project.name, owner: project.owner?.displayName || t('unknownOwner'), ownerImage: project.owner?.avatarUrl || '', ownerFallback: initialsFromName(project.owner?.displayName), time: formatDashboardDuration(project.averageDurationMs), averageDurationMs: project.averageDurationMs,
      progress: project.progress ? { ...project.progress, details: project.progress.stages?.map(stage => t('progressStageNames.' + stage.kind) + ': ' + stage.completed + '/' + stage.total).join(' · ') } : null,
      stats: { users: project.members, runs: project.runs, documents: project.documents } })),
  }
}
export type DashboardViewModel = ReturnType<typeof buildDashboardViewModel>
