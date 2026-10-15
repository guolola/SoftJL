// AdminCN/shadcn-studio chart-weekly-overview; ported and made data-driven for the workbench.
// Adaptation: the original hardcoded a 0-90k axis and sales copy; the domain, ticks, labels and
// summary text are now derived from props so real run/activity counts render correctly.
'use client'

import { useMemo } from 'react'

import { Bar, CartesianGrid, ComposedChart, Line, YAxis } from 'recharts'
import { EllipsisVerticalIcon } from 'lucide-react'

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

const listItems = ['Share', 'Update', 'Refresh']

export type WeeklyOverviewPoint = {
  name: string
  uv: number
  pv: number
  fill?: string
}

export type WeeklyOverviewProps = {
  className?: string
  title?: string
  data: WeeklyOverviewPoint[]
  barLabel?: string
  lineLabel?: string
  summaryValue?: string
  summaryLabel?: string
  actionLabel?: string
  onAction?: () => void
}

// Round up to a 1/2/2.5/5 x 10^n step so the axis ticks land on readable values.
function niceCeiling(value: number): number {
  if (value <= 0) return 4
  const exponent = Math.floor(Math.log10(value))
  const base = Math.pow(10, exponent)
  const fraction = value / base
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10

  return niceFraction * base
}

const WeeklyOverviewCard = ({
  className,
  title = 'Weekly overview',
  data,
  barLabel = 'Sales',
  lineLabel = 'Profit',
  summaryValue,
  summaryLabel,
  actionLabel,
  onAction
}: WeeklyOverviewProps) => {
  const chartConfig = useMemo(
    () =>
      ({
        uv: {
          label: barLabel,
          color: 'var(--chart-2)'
        },
        pv: {
          label: lineLabel,
          color: 'var(--chart-2)'
        }
      }) satisfies ChartConfig,
    [barLabel, lineLabel]
  )

  const { maxValue, ticks, useThousands } = useMemo(() => {
    const peak = data.reduce((acc, item) => Math.max(acc, item.uv, item.pv), 0)
    const ceiling = niceCeiling(peak)
    const useK = ceiling >= 1000

    return {
      maxValue: ceiling,
      useThousands: useK,
      ticks: [0, ceiling / 4, ceiling / 2, (ceiling * 3) / 4, ceiling].map(value => Math.round(value))
    }
  }, [data])

  return (
    <Card className={className}>
      <CardHeader className='flex justify-between'>
        <span className='text-lg font-semibold'>{title}</span>
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
      <CardContent className='space-y-8'>
        <ChartContainer config={chartConfig} className='min-h-35 w-full flex-1'>
          <ComposedChart data={data} margin={{ left: -22, bottom: 10 }}>
            <CartesianGrid strokeDasharray='4' stroke='var(--border)' vertical={false} />
            <YAxis
              domain={[0, maxValue]}
              type='number'
              allowDataOverflow={false}
              ticks={ticks}
              tickFormatter={value => (useThousands ? `${Math.round(value / 1000)}k` : `${value}`)}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              tickMargin={8}
              scale='linear'
              includeHidden={false}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey='uv' barSize={20} fill='var(--chart-2)' fillOpacity={0.3} radius={12} />
            <Line type='linear' dataKey='pv' stroke='var(--color-pv)' strokeWidth={3} />
          </ComposedChart>
        </ChartContainer>
        {summaryValue || summaryLabel || actionLabel ? (
          <div className='flex flex-col items-stretch gap-4'>
            {summaryValue || summaryLabel ? (
              <div className='flex items-center gap-3'>
                {summaryValue ? <span className='text-2xl font-medium'>{summaryValue}</span> : null}
                {summaryLabel ? (
                  <span className='text-muted-foreground text-sm'>{summaryLabel}</span>
                ) : null}
              </div>
            ) : null}

            {actionLabel ? <Button onClick={onAction}>{actionLabel}</Button> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default WeeklyOverviewCard
