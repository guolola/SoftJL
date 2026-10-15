// Direct port of dashboard-shell-06 from the supplied block; presentation classes are retained.
'use client'
import { useDashboardLabels } from './dashboard-shell-labels'

import { Bar, BarChart } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/shared/ui/chart'

import { cn } from '@/shared/ui/utils'

// Profit chart data
const profitChartConfig = {
  cy: {
    label: 'Cy',
    color: 'var(--chart-4)'
  },
  py: {
    label: 'Py',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig

const StatisticsTotalProfitCard = ({ className, title, description, changePercentage, value, chartData: profitChartData }: { className?: string; title: string; description: string; changePercentage: string; value?: string; chartData: { name: string; cy: number; py: number }[] }) => {
  const { t } = useDashboardLabels()
  const StatisticsCardData = {
  title,
  description,
  children: (
    <>
      <ChartContainer config={{ cy: { ...profitChartConfig.cy, label: t('failed') }, py: { ...profitChartConfig.py, label: t('completed') } }} className='h-31 w-full'>
        <BarChart
          width={500}
          height={300}
          data={profitChartData}
          stackOffset='sign'
          margin={{
            right: -8,
            left: -7
          }}
          barSize={12}
        >
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={(value, name) => <span>{name === 'cy' ? t('failed') : t('completed')}: {Math.abs(Number(value))}</span>} />} />
          <Bar dataKey='py' fill='var(--color-py)' stackId='stack' radius={[12, 12, 0, 0]} />
          <Bar dataKey='cy' fill='var(--color-cy)' stackId='stack' radius={[12, 12, 0, 0]} />
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

export default StatisticsTotalProfitCard
