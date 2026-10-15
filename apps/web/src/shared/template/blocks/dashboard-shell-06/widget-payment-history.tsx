// Direct port of dashboard-shell-06 from the supplied block; presentation classes are retained.
import { ActivityIcon, FileTextIcon, ShapesIcon } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

import { cn } from '@/shared/ui/utils'
import { EllipsisVerticalIcon } from 'lucide-react'

import { DashboardBlockMenu, type DashboardBlockActions } from './dashboard-block-menu'
import { useDashboardLabels } from './dashboard-shell-labels'

type Props = DashboardBlockActions & {
  title: string
  paymentData: { id: string; projectName: string; type: string; kind: string; date: string; status: string; duration: string; onOpen: () => void }[]
  className?: string
}

const PaymentHistoryCard = ({ title, paymentData, className, ...actions }: Props) => {
  const { t } = useDashboardLabels()
  return (
    <Card className={cn('justify-between', className)}>
      <CardHeader className='flex items-center justify-between px-6'>
        <span className='text-lg font-semibold'>{title}</span>
        <DashboardBlockMenu {...actions} />
      </CardHeader>
      <CardContent className='px-0'>
        <Table>
          <TableHeader>
            <TableRow className='hover:bg-transparent'>
              <TableHead className='pl-6'>{t('recentProject')}</TableHead>
              <TableHead>{t('createdAt')}</TableHead>
              <TableHead className='pr-6 text-end'>{t('statusDuration')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paymentData.map((payment, index) => (
              <TableRow key={payment.id} className='border-none hover:bg-transparent'>
                <TableCell className='pl-6 first:pt-4'>
                  <div className='flex items-center gap-2'>
                    <div className='bg-muted flex size-10.5 items-center justify-center rounded-sm'>
                      {payment.kind === 'document' ? <FileTextIcon className='size-6' /> : payment.kind === 'design' ? <ShapesIcon className='size-6' /> : <ActivityIcon className='size-6' />}
                    </div>
                    <div className='flex flex-col gap-0.5'>
                      <button type='button' className='text-base font-medium text-left' onClick={payment.onOpen}>{payment.projectName}</button>
                      <span className='text-muted-foreground text-sm'>{payment.type}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className='text-muted-foreground text-xs'>{payment.date}</TableCell>
                <TableCell className='pr-6'>
                  <div className='flex flex-col items-end'>
                    <span className='text-sm'>{payment.status}</span>
                    <span className='text-muted-foreground text-xs'>{payment.duration}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {paymentData.length === 0 && <TableRow><TableCell colSpan={3} className='h-24 text-center'>{t('noTasks')}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export default PaymentHistoryCard
