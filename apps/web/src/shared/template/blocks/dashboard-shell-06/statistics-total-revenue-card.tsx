// Direct port of dashboard-shell-06 from the supplied block; presentation classes are retained.
'use client'
import { useDashboardLabels } from './dashboard-shell-labels'

import { Bar, BarChart } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/shared/ui/chart'

import { cn } from '@/shared/ui/utils'

// Revenue chart data
const revenueChartConfig = {
  desktop: {
    label: 'Desktop',
    color: 'var(--chart-2)'
  },
  mobile: {
    label: 'Mobile',
    color: 'color-mix(in oklab, var(--chart-2) 20%, transparent)'
  }
} satisfies ChartConfig

const StatisticsTotalRevenueCard = ({ className, title, description, changePercentage, value, chartData: revenueChartData }: { className?: string; title: string; description: string; changePercentage: string; value?: string; chartData: { month: string; desktop: number; mobile: number }[] }) => {
  const { t } = useDashboardLabels()
  const StatisticsCardData = {
  title,
  description,
  children: (
    <>
      <ChartContainer config={{ desktop: { ...revenueChartConfig.desktop, label: t('requirements') }, mobile: { ...revenueChartConfig.mobile, label: t('design') } }} className='h-31 w-full'>
        <BarChart
          accessibilityLayer
          data={revenueChartData}
          barSize={12}
          margin={{
            left: 0,
            right: 0
          }}
          barGap={0}
        >
          <Bar dataKey='desktop' fill='var(--color-desktop)' radius={[12, 12, 0, 0]} />
          <Bar dataKey='mobile' fill='var(--color-mobile)' radius={[12, 12, 0, 0]} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        </BarChart>
      </ChartContainer>
    </>
  ),
  changePercentage
}


  return (
    <Card className={cn('justify-between', className)}>
      <CardHeader>
        <div className='flex items-center gap-2'>
          <CardTitle className='text-lg font-semibold'>{StatisticsCardData.title}</CardTitle>
          <span className='text-base'>{StatisticsCardData.changePercentage}</span>
        </div>
        <CardDescription className='text-muted-foreground text-base'>{StatisticsCardData.description}</CardDescription>
      </CardHeader>
      <CardContent>{StatisticsCardData.children}</CardContent>
    </Card>
  )
}

export default StatisticsTotalRevenueCard
