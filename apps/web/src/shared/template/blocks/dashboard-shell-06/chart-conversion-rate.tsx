// Direct port of dashboard-shell-06 from the supplied block; presentation classes are retained.
'use client'

import { Area, AreaChart } from 'recharts'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/shared/ui/chart'
import { cn } from '@/shared/ui/utils'
import { EllipsisVerticalIcon, ChevronUpIcon, ChevronDownIcon, ArrowUpIcon, ArrowDownIcon } from 'lucide-react'

import { DashboardBlockMenu, type DashboardBlockActions } from './dashboard-block-menu'
import { useDashboardLabels } from './dashboard-shell-labels'

type Props = DashboardBlockActions & {
  title: string
  subTitle: string
  totalConversion: number | null
  conversionTrend: 'up' | 'down' | null
  percentageChange: number | null
  conversionData: {
    title: string
    stat: string
    trend: string
    percentageChange: number | null
  }[]
  chartData: {
    month: string
    conversion: number | null
  }[]
  className?: string
}

const conversionRateChartConfig = {
  conversion: {
    label: 'Conversion'
  }
} satisfies ChartConfig

const ConversionRateCard = ({
  title,
  subTitle,
  totalConversion,
  conversionTrend,
  percentageChange,
  conversionData,
  chartData,
  className,
  ...actions
}: Props) => {
  const { t } = useDashboardLabels()
  return (
    <Card className={cn('gap-4 text-base', className)}>
      <CardHeader className='flex justify-between'>
        <div className='flex flex-col gap-1'>
          <span className='text-lg font-semibold'>{title}</span>
        </div>
        <DashboardBlockMenu {...actions} />
      </CardHeader>
      <CardContent className='flex flex-1 flex-col justify-between gap-4'>
        <div className='flex items-center gap-4'>
          <div className='flex items-center gap-3'>
            <span className='text-3xl font-semibold'>{totalConversion === null ? t('noData') : `${totalConversion}%`}</span>
            <div className='flex shrink-0 items-center gap-1' title={t('successChange')}>
              {percentageChange !== 0 && conversionTrend === 'up' ? (
                <ChevronUpIcon className='size-4' />
              ) : (
                percentageChange !== 0 && conversionTrend && <ChevronDownIcon className='size-4' />
              )}
              <span className='text-sm whitespace-nowrap'>{percentageChange === null ? '—' : percentageChange === 0 ? t('successUnchanged') : t('successPoints', { value: `${percentageChange > 0 ? '+' : ''}${percentageChange}` })}</span>
            </div>
          </div>
          <ChartContainer config={{ conversion: { label: t('success') } }} className='h-20 w-full'>
            <AreaChart
              data={chartData}
              margin={{
                left: 4,
                right: 4
              }}
            >
              <defs>
                <linearGradient id='fillSales' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='10%' stopColor='var(--chart-2)' stopOpacity={0.3} />
                  <stop offset='90%' stopColor='var(--chart-2)' stopOpacity={0} />
                </linearGradient>
              </defs>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Area
                dataKey='conversion'
                type='natural'
                fill='url(#fillSales)'
                stroke='var(--chart-2)'
                strokeWidth={2}
                stackId='a'
              />
            </AreaChart>
          </ChartContainer>
        </div>

        {conversionData.map((campaign, index) => (
          <div key={index} className='grid grid-cols-5 gap-2'>
            <div className='col-span-4 flex flex-col gap-0.5'>
              <span className='font-medium'>{campaign.title}</span>
              <span className='text-muted-foreground text-sm'>{campaign.stat}</span>
            </div>
            <div className='flex items-center justify-between gap-2'>
              {campaign.trend === 'up' ? (
                <ArrowUpIcon className='size-4' />
              ) : (
                campaign.trend === 'down' && <ArrowDownIcon className='size-4' />
              )}
              <span className='text-sm'>{campaign.percentageChange === null ? '—' : `${campaign.percentageChange}%`}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default ConversionRateCard
