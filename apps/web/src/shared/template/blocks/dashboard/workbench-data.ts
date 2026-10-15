// Serializable view-model contract for the workbench dashboard.
// Lives in the shared layer so both the authenticated DashboardPage (real data) and the marketing
// hero (static demo data) compose the same WorkbenchDashboard from one shape. Keep it free of
// ReactNode so demo data can be a plain constant.
import type { Item } from '@/shared/template/blocks/dashboard/datatable-user'
import type { ProjectListIconKind } from '@/shared/template/blocks/dashboard/chart-project-timeline'
import type { PerformanceProps } from '@/shared/template/blocks/dashboard/chart-performance'

export type WorkbenchKpiKind = 'projects' | 'members' | 'runs' | 'models'

export type WorkbenchKpi = {
  kind: WorkbenchKpiKind
  title: string
  value: string
  trend: 'up' | 'down'
  changePercentage: string
  badgeContent: string
}

export type WorkbenchTimelineEntry = {
  name: string
  project: string
  startDate: string
  endDate: string
  fill: string
}

export type WorkbenchProjectListItem = {
  iconKind: ProjectListIconKind
  title: string
  tasks: string
  colorClassName: string
}

export type WorkbenchWeeklyPoint = {
  name: string
  uv: number
  pv: number
}

export type WorkbenchConversion = {
  title: string
  subTitle: string
  totalConversion: number
  conversionTrend: 'up' | 'down'
  percentageChange: number
  conversionData: { title: string; stat: string; trend: string; percentageChange: number }[]
  chartData: { month: string; conversion: number }[]
}

export type WorkbenchPerformance = Pick<PerformanceProps, 'members' | 'area' | 'bar'> & { title?: string }

export type WorkbenchData = {
  kpis: WorkbenchKpi[]
  timeline: {
    title?: string
    description?: string
    entries: WorkbenchTimelineEntry[]
    listTitle?: string
    listDescription?: string
    projects: WorkbenchProjectListItem[]
  }
  weekly: {
    title?: string
    data: WorkbenchWeeklyPoint[]
    barLabel?: string
    lineLabel?: string
    summaryValue?: string
    summaryLabel?: string
  }
  conversion: WorkbenchConversion
  performance: WorkbenchPerformance
  tableRows: Item[]
  // False when the bounded per-project run fan-out was skipped or failed; run-derived widgets
  // then fall back to project-derived datasets so the dashboard still renders meaningfully.
  runsLoaded: boolean
}
