// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';
import { Avatar, AvatarFallback } from '@/features/marketing-site/template/components/ui/avatar'
import { Button } from '@/features/marketing-site/template/components/ui/button'
import { Badge } from '@/features/marketing-site/template/components/ui/badge'
import { cn } from '@/shared/ui/utils'

type Props = {
  className?: string
  avatarIcon: React.ReactNode
  title: string
  statNumber: string
  percentage: number
}

const StatCard = ({ className, avatarIcon, title, statNumber, percentage }: Props) => {
  return (
    <div className={cn('flex w-71.5 flex-col gap-4 rounded-xl border p-4 shadow-sm', className)}>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <Avatar className='rounded-sm after:border-0'>
            <AvatarFallback className='bg-primary/10 text-primary shrink-0 rounded-sm'>{avatarIcon}</AvatarFallback>
          </Avatar>
          <span className='text-base'>{flowText(title)}</span>
        </div>
        <Button variant='outline' size='xs' asChild><a href="/tutorial">
          <FlowCopy text="Details" /></a></Button>
      </div>
      <div className='flex items-center gap-2'>
        <span className='text-2xl font-semibold'>{flowText(statNumber)}</span>
        <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary h-auto rounded-sm focus-visible:outline-none'>
          {percentage > 0 && '+'}
          {percentage}%
        </Badge>
      </div>
    </div>
  )
}

export default StatCard
