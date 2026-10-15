// Composes the ported shadcn-studio dashboard blocks into the workbench layout (dashboard-shell-09 /
// AdminCN productivity). Reused by the authenticated DashboardPage (real data, fully revealed) and
// the marketing hero (demo data, progressively revealed via revealStage as the user scrolls).
import { Activity, Cpu, FolderKanban, Users, type LucideIcon } from 'lucide-react'

import { Card } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import { cn } from '@/shared/ui/utils'

import StatisticsCard from '@/shared/template/blocks/dashboard/statistics-card-03'
import ProjectTimelineCard from '@/shared/template/blocks/dashboard/chart-project-timeline'
import WeeklyOverviewCard from '@/shared/template/blocks/dashboard/chart-weekly-overview'
import ConversionRateCard from '@/shared/template/blocks/dashboard/chart-conversion-rate'
import PerformanceCard from '@/shared/template/blocks/dashboard/chart-performance'
import UserDatatable from '@/shared/template/blocks/dashboard/datatable-user'
import type { WorkbenchData, WorkbenchKpiKind } from '@/shared/template/blocks/dashboard/workbench-data'

// 0 = nothing revealed, 4 = fully revealed. The hero maps scrollProgress onto these stages.
export type WorkbenchRevealStage = 0 | 1 | 2 | 3 | 4

const KPI_ICONS: Record<WorkbenchKpiKind, LucideIcon> = {
  projects: FolderKanban,
  members: Users,
  runs: Activity,
  models: Cpu
}

export function WorkbenchDashboard({
  data,
  revealStage = 4,
  className
}: {
  data: WorkbenchData
  revealStage?: WorkbenchRevealStage
  className?: string
}) {
  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-4', className)}>
      {/* KPI row */}
      {revealStage >= 1 ? (
        <div className='grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
          {data.kpis.map((kpi) => {
            const Icon = KPI_ICONS[kpi.kind]

            return (
              <StatisticsCard
                key={kpi.kind}
                icon={<Icon />}
                value={kpi.value}
                title={kpi.title}
                trend={kpi.trend}
                changePercentage={kpi.changePercentage}
                badgeContent={kpi.badgeContent}
              />
            )
          })}
        </div>
      ) : (
        <div className='grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className='h-44 w-full rounded-xl' />
          ))}
        </div>
      )}

      {/* Timeline + weekly overview */}
      {revealStage >= 2 ? (
        <div className='grid min-w-0 gap-4 xl:grid-cols-5'>
          <ProjectTimelineCard
            className='min-w-0 xl:col-span-3'
            title={data.timeline.title}
            description={data.timeline.description}
            timeline={data.timeline.entries}
            projectListTitle={data.timeline.listTitle}
            projectListDescription={data.timeline.listDescription}
            projects={data.timeline.projects}
          />
          <WeeklyOverviewCard
            className='min-w-0 xl:col-span-2'
            title={data.weekly.title}
            data={data.weekly.data}
            barLabel={data.weekly.barLabel}
            lineLabel={data.weekly.lineLabel}
            summaryValue={data.weekly.summaryValue}
            summaryLabel={data.weekly.summaryLabel}
          />
        </div>
      ) : (
        <div className='grid min-w-0 gap-4 xl:grid-cols-5'>
          <Skeleton className='h-80 w-full rounded-xl xl:col-span-3' />
          <Skeleton className='h-80 w-full rounded-xl xl:col-span-2' />
        </div>
      )}

      {/* Conversion + performance */}
      {revealStage >= 3 ? (
        <div className='grid min-w-0 gap-4 xl:grid-cols-5'>
          <ConversionRateCard
            className='min-w-0 xl:col-span-2'
            title={data.conversion.title}
            subTitle={data.conversion.subTitle}
            totalConversion={data.conversion.totalConversion}
            conversionTrend={data.conversion.conversionTrend}
            percentageChange={data.conversion.percentageChange}
            conversionData={data.conversion.conversionData}
            chartData={data.conversion.chartData}
          />
          <PerformanceCard
            className='min-w-0 xl:col-span-3'
            title={data.performance.title}
            members={data.performance.members}
            area={data.performance.area}
            bar={data.performance.bar}
          />
        </div>
      ) : (
        <div className='grid min-w-0 gap-4 xl:grid-cols-5'>
          <Skeleton className='h-96 w-full rounded-xl xl:col-span-2' />
          <Skeleton className='h-96 w-full rounded-xl xl:col-span-3' />
        </div>
      )}

      {/* Bottom datatable */}
      {revealStage >= 4 ? (
        <Card className='min-w-0 overflow-hidden py-0 shadow-none'>
          <UserDatatable data={data.tableRows} />
        </Card>
      ) : (
        <Skeleton className='h-72 w-full rounded-xl' />
      )}
    </div>
  )
}
