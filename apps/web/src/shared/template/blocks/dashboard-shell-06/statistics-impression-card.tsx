// Direct port of dashboard-shell-06 from the supplied block; presentation classes are retained.
'use client'
import { useDashboardLabels } from './dashboard-shell-labels'

import { Line, LineChart } from 'recharts'

import { Card, CardDescription, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/shared/ui/chart'

// Impression chart data
const impressionChartConfig = {
  impression: {
    label: 'Impressions',
    color: 'var(--chart-5)'
  }
} satisfies ChartConfig

const StatisticsImpressionCard = ({ className, title, description, changePercentage, value, chartData: impressionChartData }: { className?: string; title: string; description: string; changePercentage: string; value?: string; chartData: { month: string; impression: number }[] }) => {
  const { t } = useDashboardLabels()
  const StatisticsCardData = {
  title,
  description,
  children: (
    <>
      <ChartContainer config={{ impression: { ...impressionChartConfig.impression, label: t('document') } }} className='h-21 w-full'>
        <LineChart
          accessibilityLayer
          data={impressionChartData}
          margin={{
            left: 4,
            right: 4
          }}
        >
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Line dataKey='impression' type='linear' dot={false} stroke='var(--color-impression)' strokeWidth={3} />
        </LineChart>
      </ChartContainer>
    </>
  ),
  value,
  changePercentage
}


  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className='text-lg font-semibold'>{StatisticsCardData.title}</CardTitle>
        <CardDescription className='text-muted-foreground text-base'>{StatisticsCardData.description}</CardDescription>
      </CardHeader>
      <CardContent>{StatisticsCardData.children}</CardContent>

      <CardContent className='flex items-center justify-between'>
        <span className='text-xl font-semibold'>{StatisticsCardData.value}</span>
        <span className='text-primary text-base'>{StatisticsCardData.changePercentage}</span>
      </CardContent>
    </Card>
  )
}

export default StatisticsImpressionCard
