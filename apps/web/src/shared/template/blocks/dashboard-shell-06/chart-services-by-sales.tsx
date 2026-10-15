// Direct port of dashboard-shell-06 from the supplied block; presentation classes are retained.
'use client'

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/shared/ui/chart'

import { cn } from '@/shared/ui/utils'
import { CircleIcon } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

import { DashboardBlockMenu, type DashboardBlockActions } from './dashboard-block-menu'
import { useDashboardLabels } from './dashboard-shell-labels'

export type ArtifactDurationCardData = {
  items: { key: string; sr: number; name: string; subtitle: string; projectId: string; samples: number; seconds: number | null; duration: string; fill: string }[]
  projects: { id: string; name: string }[]
  mode: string; projectId: string; query: string; page: number; pageCount: number; total: number; hasSamples: boolean; family: string
  onFamilyChange: (value: string) => void
  onModeChange: (mode: string) => void; onProjectChange: (id: string) => void; onQueryChange: (query: string) => void; onPageChange: (page: number) => void
}
const ServicesBySalesCard = ({ className, data, onProject, ...actions }: DashboardBlockActions & { className?: string; data: ArtifactDurationCardData; onProject: (id: string) => void }) => {
  const { t } = useDashboardLabels()
  const salesChartData = data.items
  const maxSeconds = Math.max(0, ...salesChartData.map(item => item.seconds ?? 0))
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className='flex justify-between'>
        <span className='text-lg font-semibold'>{t('artifactDuration')}</span>
        <DashboardBlockMenu {...actions} />
      </CardHeader>
      <div className='flex flex-wrap gap-2 px-6'>
        <Select value={data.mode} onValueChange={value => value && data.onModeChange(value)}>
          <SelectTrigger aria-label={t('durationDimension')} size='sm'><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value='type'>{t('byArtifactType')}</SelectItem><SelectItem value='artifact'>{t('byArtifact')}</SelectItem></SelectContent>
        </Select>
        <Select value={data.family} onValueChange={value => value && data.onFamilyChange(value)}>
          <SelectTrigger aria-label={t('artifactFamily')} size='sm'><SelectValue /></SelectTrigger>
          <SelectContent>{[['all', 'allArtifacts'], ['requirements', 'requirementArtifacts'], ['design', 'designArtifacts'], ['document', 'documentArtifacts'], ['feasibility', 'feasibilityArtifacts']].map(([value, label]) => <SelectItem key={value} value={value}>{t(label)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={data.projectId} onValueChange={value => value && data.onProjectChange(value)}>
          <SelectTrigger aria-label={t('durationProject')} size='sm' className='max-w-48'><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value='all'>{t('allProjects')}</SelectItem>{data.projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input aria-label={t('searchArtifacts')} placeholder={t('searchArtifacts')} value={data.query} onChange={event => data.onQueryChange(event.target.value)} className='h-8 min-w-0 flex-1 basis-36' />
      </div>
      <CardContent className='grid grid-cols-1 gap-4 px-0 lg:grid-cols-2'>
        <div className='p-6'>
          <ChartContainer config={{ seconds: { label: t('artifactDuration') } }} className='h-full min-h-60 w-full max-lg:max-h-70 lg:max-w-95'>
            <BarChart
              accessibilityLayer
              data={salesChartData}
              layout='vertical'
              barSize={24}
              margin={{ left: -35, right: 12 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray='4' stroke='var(--border)' />
              <XAxis
                type='number'
                dataKey='seconds'
                domain={[0, 'auto']}
                allowDecimals={true}
                tickFormatter={value => maxSeconds > 0 && maxSeconds < 1 ? `${Math.round(Number(value) * 1000)}ms` : `${value}s`}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              />
              <YAxis
                dataKey='sr'
                type='category'
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={(_value, _name, item) => <div className='flex flex-col gap-1'><span>{item.payload.name}</span><span>{item.payload.duration} · {t('durationSamples', { count: item.payload.samples })}</span></div>} />} />
              <Bar dataKey='seconds' radius={[0, 10, 10, 0]}>
                <LabelList dataKey='name' position='middle' fill='var(--primary-foreground)' className='text-sm' formatter={value => String(value).length > 18 ? `${String(value).slice(0, 17)}…` : value} />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
        <div className='grid grid-cols-2 gap-x-23 gap-y-12 px-8 max-lg:gap-x-8 lg:py-10'>
          {salesChartData.map((service, index) => (
            <div key={service.key} className='flex min-w-0 gap-3 px-2'>
              <div className='flex size-4.5 items-center justify-center'>
                <CircleIcon fill={service.fill} stroke={service.fill} className='size-2.5' />
              </div>
              <div className='flex min-w-0 flex-col gap-2'>
                {service.projectId ? <button type='button' title={service.name} onClick={() => onProject(service.projectId)} className='text-muted-foreground text-sm text-left break-words line-clamp-2'>{service.name}</button> : <span title={service.name} className='text-muted-foreground text-sm break-words line-clamp-2'>{service.name || '—'}</span>}
                {service.subtitle && <span title={service.subtitle} className='text-muted-foreground text-xs truncate'>{service.subtitle}</span>}
                <span className='text-lg font-medium'>{service.seconds === null ? t('noData') : service.duration}</span>
                {service.name && <span className='text-muted-foreground text-xs'>{t('durationSamples', { count: service.samples })}</span>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      {(!data.hasSamples || data.pageCount > 1) && <div className='flex flex-wrap items-center justify-between gap-2 px-6 text-muted-foreground text-xs'>
        {!data.hasSamples && <span>{t('noDurationData')}</span>}
        {data.pageCount > 1 && <div className='ml-auto flex items-center gap-2'>
          <Button size='sm' variant='outline' aria-label={t('durationPrevious')} disabled={data.page === 0} onClick={() => data.onPageChange(data.page - 1)}>{t('previous')}</Button>
          <span>{data.page + 1} / {data.pageCount}</span>
          <Button size='sm' variant='outline' aria-label={t('durationNext')} disabled={data.page === data.pageCount - 1} onClick={() => data.onPageChange(data.page + 1)}>{t('next')}</Button>
        </div>}
      </div>}
    </Card>
  )
}

export default ServicesBySalesCard
