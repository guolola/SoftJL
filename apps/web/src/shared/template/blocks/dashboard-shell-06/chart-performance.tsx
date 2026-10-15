// Direct port of dashboard-shell-06 from the supplied block; presentation classes are retained.
'use client'

import type { PerformanceProps } from '@/shared/template/blocks/dashboard/chart-performance'
import { Area, AreaChart, Bar, BarChart, XAxis } from 'recharts'
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from '@/shared/ui/avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/shared/ui/chart'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { ChartColumnBigIcon, EllipsisVerticalIcon, ActivityIcon, ArrowRightIcon, UsersIcon } from 'lucide-react'

import { DashboardBlockMenu, type DashboardBlockActions } from './dashboard-block-menu'
import { useDashboardLabels } from './dashboard-shell-labels'

const PerformanceCard = ({ className, title, members, area, bar, ...actions }: PerformanceProps & DashboardBlockActions) => {
  const { t } = useDashboardLabels()
  const avatars = members.members.map(member => ({ src: member.src, fallback: member.initials, name: member.name }))
  const physicalProductsChartData = area.chartData.map(point => ({ month: point.label, sales: point.value }))
  const dailySalesChartData = bar.chartData.map(point => ({ day: point.label, sales: point.value }))
  const physicalProductsChartConfig = { sales: { label: area.chartLabel } } satisfies ChartConfig
  const dailySalesChartConfig = { sales: { label: bar.chartLabel } } satisfies ChartConfig
  return (
    <Card className={className}>
      <CardHeader className='flex justify-between'>
        <div className='flex items-center gap-2'>
          <ChartColumnBigIcon className='size-6' />
          <span className='text-lg font-semibold'>{title}</span>
        </div>
        <DashboardBlockMenu {...actions} />
      </CardHeader>
      {/* The platform Tabs primitive uses different orientation selectors than the block.
          Keep the template's full-width tab rail above its panels explicitly. */}
      <Tabs defaultValue='new-users' className='flex-1 flex-col gap-6'>
        <TabsList variant='line' className='h-9 w-full justify-start gap-0 border-b p-0'>
          <TabsTrigger
            value='new-users'
            className='rounded-none border-0 after:inset-x-0 after:bottom-[-0.5px] after:h-0.5'
          >
            {members.tabLabel}
          </TabsTrigger>
          <TabsTrigger
            value='online-sales'
            className='rounded-none border-0 after:inset-x-0 after:bottom-[-0.5px] after:h-0.5'
          >
            {area.tabLabel}
          </TabsTrigger>
          <TabsTrigger
            value='daily-sales'
            className='rounded-none border-0 after:inset-x-0 after:bottom-[-0.5px] after:h-0.5'
          >
            {bar.tabLabel}
          </TabsTrigger>
        </TabsList>

        <CardContent>
          <TabsContent value='new-users' className='flex flex-col justify-between gap-4 text-base'>
            <div className='flex items-center gap-4 rounded-xl border px-4 py-2'>
              <Avatar className='size-10.5'>
                <AvatarImage src={members.person.src} alt={members.person.name} />
                <AvatarFallback className='text-xs'>{members.person.initials}</AvatarFallback>
              </Avatar>
              <div className='flex flex-col'>
                <span className='text-muted-foreground'>{members.person.role}</span>
                <span className='text-lg font-medium'>{members.person.name}</span>
              </div>
            </div>

            <div className='flex items-center justify-between rounded-xl border px-4 py-3'>
              <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary h-6 border-none px-3 py-1 focus-visible:outline-none'>
                {members.badgeLabel}
              </Badge>
              <span className='text-xl font-medium'>{members.badgeValue}</span>
            </div>

            <div className='flex flex-col gap-4 rounded-xl border px-5 py-3.5'>
              <div className='flex items-center justify-between'>
                <div className='flex flex-col gap-1'>
                  <span className='text-muted-foreground'>{members.highlightLabel}</span>
                  <span className='text-xl font-semibold'>{members.highlightValue}</span>
                </div>
                <div className='flex items-center gap-2.5'>
                  <Avatar className='size-6.5 after:border-0'>
                    <AvatarFallback className='bg-primary/10 text-primary shrink-0'>
                      <ActivityIcon className='size-4' />
                    </AvatarFallback>
                  </Avatar>
                  <span className='text-xl font-semibold'>{members.highlightPct}</span>
                </div>
              </div>
              <div className='flex items-center justify-between'>
                <AvatarGroup>
                  {avatars.map((avatar, index) => (
                    <Tooltip key={index}>
                      <TooltipTrigger
                        render={
                          <Avatar className='ring-background ring-2 transition-all duration-300 ease-in-out hover:z-1 hover:-translate-y-1 hover:shadow-md' />
                        }
                      >
                        <AvatarImage src={avatar.src} alt={avatar.name} />
                        <AvatarFallback className='text-xs'>{avatar.fallback}</AvatarFallback>
                      </TooltipTrigger>
                      <TooltipContent>{avatar.name}</TooltipContent>
                    </Tooltip>
                  ))}
                </AvatarGroup>
                <Button
                  onClick={actions.onDetails}
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
              <span className='text-muted-foreground text-sm'>
                {members.footerText}
              </span>
            </p>
          </TabsContent>

          <TabsContent value='online-sales' className='flex flex-col justify-between gap-4 text-base'>
            <div className='flex items-center justify-between rounded-xl border px-4 py-3'>
              <div className='flex flex-col gap-1'>
                <span className='text-muted-foreground'>{area.leftStat.label}</span>
                <div className='flex items-center gap-2.5'>
                  <Avatar size='sm' className='after:border-0'>
                    <AvatarFallback className='bg-primary/10 text-primary shrink-0'>
                      <ActivityIcon className='size-4' />
                    </AvatarFallback>
                  </Avatar>
                  <span className='text-lg font-medium'>{area.leftStat.value}</span>
                </div>
              </div>
              <div className='flex flex-col gap-1'>
                <span className='text-muted-foreground'>{area.rightStat.label}</span>
                <div className='flex items-center gap-2.5'>
                  <Avatar size='sm' className='after:border-0'>
                    <AvatarFallback className='bg-primary/10 text-primary shrink-0'>
                      <UsersIcon className='size-4' />
                    </AvatarFallback>
                  </Avatar>
                  <span className='text-lg font-medium'>{area.rightStat.value}</span>
                </div>
              </div>
            </div>

            <div className='space-y-5 rounded-xl border py-4'>
              <div className='flex items-center justify-between px-6'>
                <div className='flex flex-col gap-1'>
                  <span className='text-muted-foreground'>{area.headlineLabel}</span>
                  <span className='text-xl font-semibold'>{area.headlineValue}</span>
                </div>
                <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary rounded-sm border-none focus-visible:outline-none'>
                  <ActivityIcon className='size-4' />
                  {area.headlinePct}
                </Badge>
              </div>

              <ChartContainer config={physicalProductsChartConfig} className='h-30 w-full'>
                <AreaChart
                  data={physicalProductsChartData}
                  margin={{
                    left: 20,
                    right: 20,
                    top: 3
                  }}
                >
                  <defs>
                    <linearGradient id='dashboard06Performance' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor='var(--chart-2)' stopOpacity={0.4} />
                      <stop offset='90%' stopColor='var(--chart-2)' stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey='month'
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={value => value.slice(0, 3)}
                    tick={{ fill: 'var(--muted-foreground)' }}
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Area
                    dataKey='sales'
                    type='natural'
                    fill='url(#dashboard06Performance)'
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

          <TabsContent value='daily-sales' className='flex flex-col justify-between gap-4 text-base'>
            <div className='flex items-center justify-between rounded-xl border px-4 py-3'>
              <div className='flex flex-col gap-1'>
                <span className='text-muted-foreground'>{bar.leftStat.label}</span>
                <div className='flex items-center gap-2.5'>
                  <Avatar size='sm' className='after:border-0'>
                    <AvatarFallback className='bg-primary/10 text-primary shrink-0'>
                      <ActivityIcon className='size-4' />
                    </AvatarFallback>
                  </Avatar>
                  <span className='text-lg font-medium'>{bar.leftStat.value}</span>
                </div>
              </div>
              <div className='flex flex-col gap-1'>
                <span className='text-muted-foreground'>{bar.rightStat.label}</span>
                <div className='flex items-center gap-2.5'>
                  <Avatar size='sm' className='after:border-0'>
                    <AvatarFallback className='bg-primary/10 text-primary shrink-0'>
                      <UsersIcon className='size-4' />
                    </AvatarFallback>
                  </Avatar>
                  <span className='text-lg font-medium'>{bar.rightStat.value}</span>
                </div>
              </div>
            </div>

            <div className='space-y-5 rounded-xl border py-4'>
              <div className='flex items-center justify-between px-6'>
                <div className='flex flex-col gap-1'>
                  <span className='text-muted-foreground'>{bar.headlineLabel}</span>
                  <span className='text-xl font-semibold'>{bar.headlineValue}</span>
                </div>
                <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary rounded-sm border-none focus-visible:outline-none'>
                  <UsersIcon className='size-4' />
                  {bar.headlinePct}
                </Badge>
              </div>

              <ChartContainer config={dailySalesChartConfig} className='h-32.5 w-full px-1.5'>
                <BarChart
                  accessibilityLayer
                  data={dailySalesChartData}
                  barSize={12}
                  margin={{
                    left: 0,
                    right: 0
                  }}
                >
                  <Bar
                    dataKey='sales'
                    fill='var(--chart-1)'
                    background={{ fill: 'color-mix(in oklab, var(--primary) 10%, transparent)', radius: 12 }}
                    radius={12}
                  />
                  <XAxis
                    dataKey='day'
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={value => value.slice(0, 3)}
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
