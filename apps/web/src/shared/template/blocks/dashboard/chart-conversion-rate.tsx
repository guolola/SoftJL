// AdminCN/shadcn-studio chart-conversion-rate; verbatim port (imports adapted to the shared UI boundary).
'use client'

import { Area, AreaChart } from 'recharts'
import { EllipsisVerticalIcon, ChevronUpIcon, ChevronDownIcon, ArrowUpIcon, ArrowDownIcon } from 'lucide-react'

import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/shared/ui/chart'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown-menu'

import { cn } from '@/shared/ui/utils'

const listItems = ['Share', 'Update', 'Refresh']

export type ConversionRateProps = {
  title: string
  subTitle: string
  totalConversion: number
  conversionTrend: 'up' | 'down'
  percentageChange: number
  conversionData: {
    title: string
    stat: string
    trend: string
    percentageChange: number
  }[]
  chartData: {
    month: string
    conversion: number
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
  className
}: ConversionRateProps) => {
  return (
    <Card className={cn('gap-4 text-base', className)}>
      <CardHeader className='flex justify-between'>
        <div className='flex flex-col gap-1'>
          <span className='text-lg font-semibold'>{title}</span>
          <span className='text-muted-foreground text-sm'>{subTitle}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant='ghost' size='icon' className='text-muted-foreground size-6 rounded-full' />}
          >
            <EllipsisVerticalIcon />
            <span className='sr-only'>Menu</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuGroup>
              {listItems.map((item, index) => (
                <DropdownMenuItem key={index}>{item}</DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col justify-between gap-4'>
        <div className='flex items-center gap-4'>
          <div className='flex items-center gap-3'>
            <span className='text-3xl font-semibold'>{totalConversion}%</span>
            <div className='flex items-center gap-1'>
              {conversionTrend === 'up' ? <ChevronUpIcon className='size-4' /> : <ChevronDownIcon className='size-4' />}
              <span className='text-sm'>{percentageChange}%</span>
            </div>
          </div>
          <ChartContainer config={conversionRateChartConfig} className='h-20 w-full'>
            <AreaChart
              data={chartData}
              margin={{
                left: 4,
                right: 4
              }}
            >
              <defs>
                <linearGradient id='fillConversionRate' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='10%' stopColor='var(--chart-2)' stopOpacity={0.3} />
                  <stop offset='90%' stopColor='var(--chart-2)' stopOpacity={0} />
                </linearGradient>
              </defs>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Area
                dataKey='conversion'
                type='natural'
                fill='url(#fillConversionRate)'
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
              {campaign.trend === 'up' ? <ArrowUpIcon className='size-4' /> : <ArrowDownIcon className='size-4' />}
              <span className='text-sm'>{campaign.percentageChange}%</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default ConversionRateCard
