// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';

import { GlobeIcon, StoreIcon, TrendingUpIcon } from 'lucide-react'

import { Bar, ComposedChart, Line, XAxis } from 'recharts'

import { Card, CardContent } from '@/features/marketing-site/template/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/features/marketing-site/template/components/ui/chart'
import { Separator } from '@/features/marketing-site/template/components/ui/separator'
import { MotionPreset } from '@/features/marketing-site/template/components/ui/motion-preset'

import StatCard from '@/features/marketing-site/template/components/blocks/features/stat-card'

const chartData = [
  { time: '09:00', uv: 88, pv: 88 },
  { time: '10:00', uv: 88, pv: 88 },
  { time: '11:00', uv: 144, pv: 144 },
  { time: '12:00', uv: 144, pv: 144 },
  { time: '13:00', uv: 109, pv: 109 },
  { time: '14:00', uv: 102, pv: 109 },
  { time: '15:00', uv: 62, pv: 62 },
  { time: '16:00', uv: 62, pv: 62 },
  { time: '17:00', uv: 128, pv: 144 },
  { time: '18:00', uv: 144, pv: 144 },
  { time: '19:00', uv: 183, pv: 200 },
  { time: '20:00', uv: 200, pv: 200 }
]

const totalEarningChartConfig = {
  uv: {
    label: <FlowCopy text='Online Store' />,
    color: 'color-mix(in oklab, var(--primary) 20%, var(--background))'
  },
  pv: {
    label: <FlowCopy text='Offline Store' />,
    color: 'var(--primary)'
  }
} satisfies ChartConfig

const SalesGrowthCard = () => {
  return (
    <Card className='h-full justify-between gap-11 shadow-none'>
      <div className='flex flex-col gap-8'>
        <MotionPreset
          fade
          slide={{ direction: 'down', offset: 35 }}
          delay={0.75}
          transition={{ duration: 0.5 }}
          className='px-6'
        >
          <StatCard
            avatarIcon={<TrendingUpIcon className='size-4' />}
            title='Total sales'
            statNumber='$2,150.00'
            percentage={5}
            className='w-full p-6 shadow-lg'
          />
        </MotionPreset>

        <MotionPreset
          fade
          slide={{ direction: 'down', offset: 35 }}
          delay={0.9}
          transition={{ duration: 0.5 }}
          className='text-muted-foreground flex flex-col gap-4 py-6 text-sm'
        >
          <CardContent className='flex flex-col gap-4'>
            <div className='flex flex-col gap-1'>
              <div className='flex items-center justify-between gap-2 py-2'>
                <div className='flex items-center gap-2'>
                  <GlobeIcon className='size-4' />
                  <span><FlowCopy text="Online store" /></span>
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'><FlowCopy text="$120k" /></span>
                  <span className='text-card-foreground'>+12.6%</span>
                </div>
              </div>
              <div className='flex items-center justify-between gap-2 py-2'>
                <div className='flex items-center gap-2'>
                  <StoreIcon className='size-4' />
                  <span><FlowCopy text="Offline store" /></span>
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'><FlowCopy text="$20k" /></span>
                  <span className='text-card-foreground'>-4.2%</span>
                </div>
              </div>
            </div>
            <div>
              <Separator />
            </div>
          </CardContent>
          <MotionPreset fade slide={{ direction: 'down', offset: 35 }} delay={1.05} transition={{ duration: 0.5 }}>
            <ChartContainer config={totalEarningChartConfig} className='h-39.25 w-full'>
              <ComposedChart data={chartData} margin={{ top: 4, right: 0, left: 0 }}>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <XAxis
                  dataKey='time'
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={15}
                  tick={{ fontSize: 14, fill: 'var(--muted-foreground)' }}
                />
                <Bar dataKey='uv' barSize={16} fill='var(--color-uv)' radius={2} />
                <Line type='linear' dataKey='pv' stroke='var(--color-pv)' dot={false} strokeWidth={3} />
              </ComposedChart>
            </ChartContainer>
          </MotionPreset>
        </MotionPreset>
      </div>

      <CardContent className='flex flex-col gap-4'>
        <MotionPreset
          component='h5'
          fade
          slide={{ direction: 'down', offset: 35 }}
          delay={1.2}
          inView={false}
          transition={{ duration: 0.5 }}
          className='text-2xl font-semibold'
        >
          <FlowCopy text="Sales & Growth" /></MotionPreset>
        <MotionPreset
          component='p'
          fade
          slide={{ direction: 'down', offset: 35 }}
          delay={1.35}
          inView={false}
          transition={{ duration: 0.5 }}
          className='text-muted-foreground text-base'
        >
          <FlowCopy text="Monitor product performance across stores orders, revenue and average order value in one place." /></MotionPreset>
      </CardContent>
    </Card>
  )
}

export default SalesGrowthCard
