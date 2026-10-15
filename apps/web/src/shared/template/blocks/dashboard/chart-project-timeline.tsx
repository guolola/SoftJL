// AdminCN/shadcn-studio chart-project-timeline; ported and made data-driven for the workbench.
// Adaptation: the original hardcoded a Jan-Aug day-of-year axis; here the Gantt domain and ticks
// are derived from the supplied start/end dates so real project timelines render correctly.
'use client'

import { useMemo } from 'react'

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import { SmartphoneIcon, LaptopMinimalIcon, CreditCardIcon, PencilRulerIcon, EllipsisVerticalIcon } from 'lucide-react'

import { Avatar, AvatarFallback } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/shared/ui/chart'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown-menu'

import { cn } from '@/shared/ui/utils'

const listItems = ['Share', 'Update', 'Refresh']

export type ProjectTimelineEntry = {
  name: string
  project: string
  startDate: string
  endDate: string
  fill: string
}

export type ProjectListIconKind = 'mobile' | 'web' | 'card' | 'design'

export type ProjectListItem = {
  iconKind: ProjectListIconKind
  title: string
  tasks: string
  colorClassName: string
}

export type ProjectTimelineProps = {
  className?: string
  title?: string
  description?: string
  timeline: ProjectTimelineEntry[]
  projectListTitle?: string
  projectListDescription?: string
  projects: ProjectListItem[]
}

const projectTimelineChartConfig = {
  range: {
    label: 'Timeline'
  }
} satisfies ChartConfig

const MS_PER_DAY = 1000 * 60 * 60 * 24

// Days since unix epoch — keeps the Gantt scale linear and year-agnostic.
const toDay = (dateString: string): number => Math.floor(new Date(dateString).getTime() / MS_PER_DAY)

const dayToMonthLabel = (day: number): string =>
  new Date(day * MS_PER_DAY).toLocaleDateString('en-US', { month: 'short' })

export function buildTimelineAxis(days: number[]): { domain: [number, number]; ticks: number[] } {
  if (days.length === 0) return { domain: [0, 1], ticks: [] }
  const min = Math.min(...days)
  const max = Math.max(...days)
  const span = Math.max(max - min, 1)
  // Use at most one tick per day so short project timelines never repeat axis keys.
  const stepCount = Math.min(6, span)
  const ticks = Array.from({ length: stepCount + 1 }, (_, index) => Math.round(min + (span * index) / stepCount))
  return { domain: [min, min + span], ticks }
}

const iconByKind: Record<ProjectListIconKind, typeof SmartphoneIcon> = {
  mobile: SmartphoneIcon,
  web: LaptopMinimalIcon,
  card: CreditCardIcon,
  design: PencilRulerIcon
}

const ProjectTimelineCard = ({
  className,
  title = 'Project Timeline',
  description,
  timeline,
  projectListTitle = 'Project List',
  projectListDescription,
  projects
}: ProjectTimelineProps) => {
  const chartData = useMemo(
    () => timeline.map(item => ({ ...item, range: [toDay(item.startDate), toDay(item.endDate)] })),
    [timeline]
  )

  const { domain, ticks } = useMemo(() => {
    const days = chartData.flatMap(item => item.range as [number, number])
    return buildTimelineAxis(days)
  }, [chartData])

  return (
    <Card className={cn('grid gap-0 py-0 lg:grid-cols-3', className)}>
      <Card className='gap-4 rounded-none shadow-none ring-0 max-lg:border-b lg:col-span-2 lg:border-r'>
        <CardHeader>
          <CardTitle className='text-lg font-semibold'>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className='flex flex-1'>
          <ChartContainer
            config={projectTimelineChartConfig}
            className='max-h-80 w-full flex-1 max-[400px]:h-60 max-[400px]:max-w-71'
          >
            <BarChart
              accessibilityLayer
              data={chartData}
              layout='vertical'
              barSize={22}
              margin={{
                left: -10,
                right: 2
              }}
            >
              <CartesianGrid strokeDasharray='6' strokeWidth={1} horizontal={false} stroke='var(--border)' />
              <XAxis
                type='number'
                domain={domain}
                tickFormatter={value => dayToMonthLabel(Number(value))}
                ticks={ticks}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted-foreground)' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                dataKey='name'
                tickMargin={10}
                type='category'
                tick={{ fill: 'var(--muted-foreground)' }}
              />
              <ChartTooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload

                    return (
                      <div className='bg-background rounded-md border p-3 shadow-lg'>
                        <p className='font-medium'>{data.project}</p>
                        <p className='text-muted-foreground text-sm'>{data.name}</p>
                        <p className='text-sm'>
                          {new Date(data.startDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}{' '}
                          -{' '}
                          {new Date(data.endDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    )
                  }

                  return null
                }}
              />
              <Bar dataKey='range' radius={12}>
                {chartData.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={entry.fill || 'var(--chart-1)'} />
                ))}
                <LabelList dataKey='project' position='inside' fill='var(--primary-foreground)' />
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card className='gap-8 rounded-none shadow-none ring-0'>
        <CardHeader className='flex justify-between'>
          <div className='flex flex-col gap-1'>
            <CardTitle className='text-lg font-semibold'>{projectListTitle}</CardTitle>
            {projectListDescription ? (
              <CardDescription className='text-muted-foreground'>{projectListDescription}</CardDescription>
            ) : null}
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
        <CardContent className='grow'>
          <div className='flex h-full flex-col justify-between gap-6'>
            {projects.map((project, index) => {
              const Icon = iconByKind[project.iconKind]

              return (
                <div key={index} className='flex items-center gap-3'>
                  <Avatar className='rounded-sm after:border-0'>
                    <AvatarFallback
                      className={cn(
                        'bg-primary/10 text-primary shrink-0 rounded-sm [&>svg]:size-4',
                        project.colorClassName
                      )}
                    >
                      <Icon />
                    </AvatarFallback>
                  </Avatar>
                  <div className='flex flex-col gap-1'>
                    <span className='text-sm'>{project.title}</span>
                    <span className='text-muted-foreground text-xs'>{project.tasks}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </Card>
  )
}

export default ProjectTimelineCard
