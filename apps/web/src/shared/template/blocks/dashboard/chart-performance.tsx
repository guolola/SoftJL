// AdminCN/shadcn-studio chart-performance; ported and made data-driven for the workbench.
// Adaptation: all marketing copy, figures, chart series and member avatars are now props, and the
// hardcoded /images/avatars/*.webp assets are dropped in favour of initials fallbacks (optional src).
'use client'

import { Area, AreaChart, Bar, BarChart, XAxis } from 'recharts'
import { ChartColumnBigIcon, EllipsisVerticalIcon, ArrowUpIcon, ArrowRightIcon, ArrowDownIcon } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from '@/shared/ui/avatar'
import { Badge } from '@/shared/ui/badge'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { cn } from '@/shared/ui/utils'

const listItems = ['Share', 'Update', 'Refresh']

export type PerformanceMember = { name: string; initials: string; src?: string }
export type PerformanceStat = { label: string; value: string; trend: 'up' | 'down' }
export type PerformanceChartPoint = { label: string; value: number }

export type PerformanceProps = {
  className?: string
  title?: string
  members: {
    tabLabel: string
    person: { name: string; role: string; initials: string; src?: string }
    badgeLabel: string
    badgeValue: string
    highlightLabel: string
    highlightValue: string
    highlightTrend: 'up' | 'down'
    highlightPct: string
    members: PerformanceMember[]
    viewAllLabel: string
    footerStrong: string
    footerText: string
  }
  area: {
    tabLabel: string
    leftStat: PerformanceStat
    rightStat: PerformanceStat
    headlineLabel: string
    headlineValue: string
    headlineTrend: 'up' | 'down'
    headlinePct: string
    chartLabel: string
    chartData: PerformanceChartPoint[]
    footerStrong: string
    footerText: string
  }
  bar: {
    tabLabel: string
    leftStat: PerformanceStat
    rightStat: PerformanceStat
    headlineLabel: string
    headlineValue: string
    headlineTrend: 'up' | 'down'
    headlinePct: string
    chartLabel: string
    chartData: PerformanceChartPoint[]
    footerStrong: string
    footerText: string
  }
}

function StatPair({ stat }: { stat: PerformanceStat }) {
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-muted-foreground'>{stat.label}</span>
      <div className='flex items-center gap-2.5'>
        <Avatar size='sm' className='after:border-0'>
          <AvatarFallback className='bg-primary/10 text-primary shrink-0'>
            {stat.trend === 'up' ? <ArrowUpIcon className='size-4' /> : <ArrowDownIcon className='size-4' />}
          </AvatarFallback>
        </Avatar>
        <span className='text-lg font-medium'>{stat.value}</span>
      </div>
    </div>
  )
}

const PerformanceCard = ({ className, title = 'Project activity', members, area, bar }: PerformanceProps) => {
  const areaChartConfig = { value: { label: area.chartLabel } } satisfies ChartConfig
  const barChartConfig = { value: { label: bar.chartLabel } } satisfies ChartConfig

  return (
    <Card className={cn('min-w-0 overflow-hidden', className)}>
      <CardHeader className='flex justify-between'>
        <div className='flex items-center gap-2'>
          <ChartColumnBigIcon className='size-6' />
          <span className='text-lg font-semibold'>{title}</span>
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
      <Tabs defaultValue='members' className='min-w-0 w-full flex-1 flex-col gap-4 sm:gap-6'>
        <TabsList variant='line' className='w-full min-w-0 justify-start gap-0 overflow-x-auto border-b p-0'>
          <TabsTrigger
            value='members'
            className='flex-none rounded-none border-0 px-4 group-data-[orientation=horizontal]/tabs:after:bottom-[-0.5px]'
          >
            {members.tabLabel}
          </TabsTrigger>
          <TabsTrigger
            value='area'
            className='flex-none rounded-none border-0 px-4 group-data-[orientation=horizontal]/tabs:after:bottom-[-0.5px]'
          >
            {area.tabLabel}
          </TabsTrigger>
          <TabsTrigger
            value='bar'
            className='flex-none rounded-none border-0 px-4 group-data-[orientation=horizontal]/tabs:after:bottom-[-0.5px]'
          >
            {bar.tabLabel}
          </TabsTrigger>
        </TabsList>

        <CardContent className='min-w-0 w-full px-3 sm:px-6'>
          <TabsContent value='members' className='flex flex-col justify-between gap-4 text-base'>
            <div className='flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2 sm:gap-4 sm:px-4'>
              <Avatar className='size-10.5'>
                {members.person.src ? <AvatarImage src={members.person.src} alt={members.person.name} /> : null}
                <AvatarFallback className='text-xs'>{members.person.initials}</AvatarFallback>
              </Avatar>
              <div className='flex min-w-0 flex-col'>
                <span className='text-muted-foreground'>{members.person.role}</span>
                <span className='truncate text-lg font-medium'>{members.person.name}</span>
              </div>
            </div>

            <div className='flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-3 sm:px-4'>
              <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary h-6 border-none px-3 py-1 focus-visible:outline-none'>
                {members.badgeLabel}
              </Badge>
              <span className='text-xl font-medium'>{members.badgeValue}</span>
            </div>

            <div className='flex min-w-0 flex-col gap-4 rounded-xl border px-3 py-3.5 sm:px-5'>
              <div className='flex min-w-0 items-center justify-between gap-2'>
                <div className='flex flex-col gap-1'>
                  <span className='text-muted-foreground'>{members.highlightLabel}</span>
                  <span className='text-xl font-semibold'>{members.highlightValue}</span>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  <Avatar className='size-6.5 after:border-0'>
                    <AvatarFallback className='bg-primary/10 text-primary shrink-0'>
                      {members.highlightTrend === 'up' ? (
                        <ArrowUpIcon className='size-4' />
                      ) : (
                        <ArrowDownIcon className='size-4' />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <span className='text-xl font-semibold'>{members.highlightPct}</span>
                </div>
              </div>
              <div className='flex min-w-0 items-center justify-between gap-2'>
                <AvatarGroup>
                  {members.members.map((avatar, index) => (
                    <Tooltip key={index}>
                      <TooltipTrigger
                        render={
                          <Avatar className='ring-background ring-2 transition-all duration-300 ease-in-out hover:z-1 hover:-translate-y-1 hover:shadow-md' />
                        }
                      >
                        {avatar.src ? <AvatarImage src={avatar.src} alt={avatar.name} /> : null}
                        <AvatarFallback className='text-xs'>{avatar.initials}</AvatarFallback>
                      </TooltipTrigger>
                      <TooltipContent>{avatar.name}</TooltipContent>
                    </Tooltip>
                  ))}
                </AvatarGroup>
                <Button
                  size='sm'
                  className='bg-primary/10 text-primary hover:bg-primary/20 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40'
                >
                  {members.viewAllLabel}
                  <ArrowRightIcon />
                </Button>
              </div>
            </div>

            <p className='text-center'>
              <span className='font-medium'>{members.footerStrong}</span>{' '}
              <span className='text-muted-foreground text-sm'>{members.footerText}</span>
            </p>
          </TabsContent>

          <TabsContent value='area' className='flex flex-col justify-between gap-4 text-base'>
            <div className='flex items-center justify-between rounded-xl border px-4 py-3'>
              <StatPair stat={area.leftStat} />
              <StatPair stat={area.rightStat} />
            </div>

            <div className='space-y-5 rounded-xl border py-4'>
              <div className='flex items-center justify-between px-6'>
                <div className='flex flex-col gap-1'>
                  <span className='text-muted-foreground'>{area.headlineLabel}</span>
                  <span className='text-xl font-semibold'>{area.headlineValue}</span>
                </div>
                <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary rounded-sm border-none focus-visible:outline-none'>
                  {area.headlineTrend === 'up' ? (
                    <ArrowUpIcon className='size-4' />
                  ) : (
                    <ArrowDownIcon className='size-4' />
                  )}
                  {area.headlinePct}
                </Badge>
              </div>

              <ChartContainer config={areaChartConfig} className='h-30 w-full'>
                <AreaChart
                  data={area.chartData}
                  margin={{
                    left: 20,
                    right: 20,
                    top: 3
                  }}
                >
                  <defs>
                    <linearGradient id='fillPerformanceArea' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor='var(--chart-2)' stopOpacity={0.4} />
                      <stop offset='90%' stopColor='var(--chart-2)' stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey='label'
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={value => String(value).slice(0, 3)}
                    tick={{ fill: 'var(--muted-foreground)' }}
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Area
                    dataKey='value'
                    type='natural'
                    fill='url(#fillPerformanceArea)'
                    stroke='var(--chart-2)'
                    strokeWidth={3}
                    stackId='a'
                  />
                </AreaChart>
              </ChartContainer>
            </div>

            <p className='text-center'>
              <span className='font-medium'>{area.footerStrong}</span>{' '}
              <span className='text-muted-foreground text-sm'>{area.footerText}</span>
            </p>
          </TabsContent>

          <TabsContent value='bar' className='flex flex-col justify-between gap-4 text-base'>
            <div className='flex items-center justify-between rounded-xl border px-4 py-3'>
              <StatPair stat={bar.leftStat} />
              <StatPair stat={bar.rightStat} />
            </div>

            <div className='space-y-5 rounded-xl border py-4'>
              <div className='flex items-center justify-between px-6'>
                <div className='flex flex-col gap-1'>
                  <span className='text-muted-foreground'>{bar.headlineLabel}</span>
                  <span className='text-xl font-semibold'>{bar.headlineValue}</span>
                </div>
                <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary rounded-sm border-none focus-visible:outline-none'>
                  {bar.headlineTrend === 'up' ? (
                    <ArrowUpIcon className='size-4' />
                  ) : (
                    <ArrowDownIcon className='size-4' />
                  )}
                  {bar.headlinePct}
                </Badge>
              </div>

              <ChartContainer config={barChartConfig} className='h-32.5 w-full px-1.5'>
                <BarChart
                  accessibilityLayer
                  data={bar.chartData}
                  barSize={12}
                  margin={{
                    left: 0,
                    right: 0
                  }}
                >
                  <Bar
                    dataKey='value'
                    fill='var(--chart-1)'
                    background={{ fill: 'color-mix(in oklab, var(--primary) 10%, transparent)', radius: 12 }}
                    radius={12}
                  />
                  <XAxis
                    dataKey='label'
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={value => String(value).slice(0, 3)}
                    tick={{ fill: 'var(--muted-foreground)' }}
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                </BarChart>
              </ChartContainer>
            </div>

            <p className='text-center'>
              <span className='font-medium'>{bar.footerStrong}</span>{' '}
              <span className='text-muted-foreground text-sm'>{bar.footerText}</span>
            </p>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  )
}

export default PerformanceCard
