// Adapts existing shadcn-studio workbench blocks to the homepage benefits preview frame.
'use client'

import { ActivityIcon, CpuIcon, FolderKanbanIcon, UsersIcon } from 'lucide-react'

import ConversionRateCard from '@/shared/template/blocks/dashboard/chart-conversion-rate'
import PerformanceCard from '@/shared/template/blocks/dashboard/chart-performance'
import WeeklyOverviewCard from '@/shared/template/blocks/dashboard/chart-weekly-overview'
import { demoWorkbenchData } from '@/shared/template/blocks/dashboard/demo-workbench-data'
import StatisticsCard from '@/shared/template/blocks/dashboard/statistics-card-03'

export type BenefitStudioPreviewKind = 'overview' | 'models' | 'workflow' | 'history'

const KPI_ICONS = [FolderKanbanIcon, UsersIcon, ActivityIcon, CpuIcon]

export function BenefitStudioPreview({
  kind,
  label
}: {
  kind: BenefitStudioPreviewKind
  label: string
}) {
  let preview

  if (kind === 'overview') {
    preview = (
      <div className='grid w-full max-w-118 grid-cols-2 gap-3'>
        {demoWorkbenchData.kpis.map((kpi, index) => {
          const Icon = KPI_ICONS[index]

          return (
            <StatisticsCard
              key={kpi.kind}
              className='min-h-40 gap-4 p-4'
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
    )
  } else if (kind === 'models') {
    preview = (
      <ConversionRateCard
        className='w-full max-w-118'
        title={demoWorkbenchData.conversion.title}
        subTitle={demoWorkbenchData.conversion.subTitle}
        totalConversion={demoWorkbenchData.conversion.totalConversion}
        conversionTrend={demoWorkbenchData.conversion.conversionTrend}
        percentageChange={demoWorkbenchData.conversion.percentageChange}
        conversionData={demoWorkbenchData.conversion.conversionData}
        chartData={demoWorkbenchData.conversion.chartData}
      />
    )
  } else if (kind === 'workflow') {
    preview = (
      <WeeklyOverviewCard
        className='w-full max-w-118'
        title={demoWorkbenchData.weekly.title}
        data={demoWorkbenchData.weekly.data}
        barLabel={demoWorkbenchData.weekly.barLabel}
        lineLabel={demoWorkbenchData.weekly.lineLabel}
        summaryValue={demoWorkbenchData.weekly.summaryValue}
        summaryLabel={demoWorkbenchData.weekly.summaryLabel}
      />
    )
  } else {
    preview = (
      <PerformanceCard
        className='w-full max-w-118'
        title={demoWorkbenchData.performance.title}
        members={demoWorkbenchData.performance.members}
        area={demoWorkbenchData.performance.area}
        bar={demoWorkbenchData.performance.bar}
      />
    )
  }

  return (
    <div
      role='img'
      aria-label={label}
      data-testid='benefit-studio-preview'
      data-preview-kind={kind}
      className='flex size-full items-center justify-center overflow-hidden p-4 sm:p-6'
    >
      <div aria-hidden='true' className='pointer-events-none flex size-full items-center justify-center'>
        {preview}
      </div>
    </div>
  )
}
