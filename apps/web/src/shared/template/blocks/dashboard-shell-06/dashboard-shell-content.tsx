// Composes the supplied dashboard-shell-06 main grid verbatim with business data passed by the feature.
import { Children, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { ActivityIcon, CpuIcon, FolderIcon, UsersIcon, FileTextIcon, ShapesIcon } from 'lucide-react'
import { Card } from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import StatisticsTotalProfitCard from './statistics-total-profit-card'
import StatisticsTotalRevenueCard from './statistics-total-revenue-card'
import StatisticsImpressionCard from './statistics-impression-card'
import StatisticsCard from './statistics-card-03'
import ServicesBySalesCard from './chart-services-by-sales'
import ConversionRateCard from './chart-conversion-rate'
import PerformanceCard from './chart-performance'
import EarningReportCard from './chart-earning-report'
import PaymentHistoryCard from './widget-payment-history'
import CourseDatatable from './datatable-course'
import type { PerformanceProps } from '@/shared/template/blocks/dashboard/chart-performance'

export type DashboardShellData = {
  mini: { completed: ComponentProps<typeof StatisticsTotalProfitCard>; types: ComponentProps<typeof StatisticsTotalRevenueCard>; documents: ComponentProps<typeof StatisticsImpressionCard> }
  kpis: { kind: string; title: string; value: string; badgeContent: string }[]
  conversion: Omit<ComponentProps<typeof ConversionRateCard>, 'onRefresh'>
  performance: PerformanceProps
  weekly: Omit<ComponentProps<typeof EarningReportCard>, 'statData' | 'onRefresh'> & { stats: (Omit<ComponentProps<typeof EarningReportCard>['statData'][number], 'icon'> & { kind: string })[] }
  recent: (Omit<ComponentProps<typeof PaymentHistoryCard>['paymentData'][number], 'onOpen'> & { projectId: string })[]
  table: Omit<ComponentProps<typeof CourseDatatable>['data'][number], 'projectIcon'>[]
}
const statClass = 'max-2xl:col-span-2 max-lg:col-span-3 max-sm:col-span-full'
const colors = ['bg-chart-2/10 text-chart-2', 'bg-chart-1/10 text-chart-1', 'bg-chart-3/10 text-chart-3']

export function DashboardShellSkeleton() {
  return <div className='grid grid-cols-6 gap-6' aria-busy='true'>
    {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className={`${statClass} h-60`} />)}
    <Skeleton className='col-span-full h-96 2xl:col-span-4' />
    {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className='col-span-full h-96 lg:col-span-3 2xl:col-span-2' />)}
    <Skeleton className='col-span-full h-96' />
  </div>
}

export function DashboardShellContent({ data, duration, onRefresh, onProject, onHistory, labels, renderCard }: { data: DashboardShellData; duration: ComponentProps<typeof ServicesBySalesCard>['data']; onRefresh: () => void; onProject: (id?: string) => void; onHistory: (id: string) => void; labels: { recent: string }; renderCard?: (card: ReactElement<{ className?: string }>, index: number) => ReactNode }) {
  const actions = { onRefresh, onDetails: () => onProject() }
  const icons = [FolderIcon, UsersIcon, CpuIcon]
  const content = <div className='grid grid-cols-6 gap-6' data-testid='dashboard-06-grid'>
    <StatisticsTotalProfitCard {...data.mini.completed} className={statClass} />
    <StatisticsTotalRevenueCard {...data.mini.types} className={statClass} />
    <StatisticsImpressionCard {...data.mini.documents} className={statClass} />
    {data.kpis.map((card, index) => { const Icon = icons[index]; return <StatisticsCard key={card.kind} {...card} icon={<Icon />} trend={null} changePercentage='—' iconClassName={colors[index]} className={statClass} /> })}
    <ServicesBySalesCard {...actions} data={duration} onProject={onProject} className='col-span-full 2xl:col-span-4' />
    <ConversionRateCard {...data.conversion} {...actions} className='col-span-full lg:col-span-3 2xl:col-span-2' />
    <PerformanceCard {...data.performance} {...actions} className='col-span-full lg:col-span-3 2xl:col-span-2' />
    <EarningReportCard {...data.weekly} {...actions} statData={data.weekly.stats.map((item, i) => ({ ...item, icon: item.kind === 'document' ? <FileTextIcon /> : item.kind === 'design' ? <ShapesIcon /> : <ActivityIcon />, iconClassName: colors[i] }))} className='col-span-full lg:col-span-3 2xl:col-span-2' />
    <PaymentHistoryCard {...actions} title={labels.recent} paymentData={data.recent.map(item => ({ ...item, onOpen: () => onHistory(item.projectId) }))} className='col-span-full lg:col-span-3 2xl:col-span-2' />
    <Card className='col-span-full py-0'><CourseDatatable data={data.table.map(item => ({ ...item, projectIcon: <FolderIcon /> }))} onProject={onProject} /></Card>
  </div>
  // Optional presentation decoration keeps the normal dashboard's exact grid and DOM unchanged.
  return renderCard ? cloneElement(content, undefined, Children.map(content.props.children, (card, index) =>
    isValidElement(card) ? renderCard(card as ReactElement<{ className?: string }>, index) : card)) : content
}
