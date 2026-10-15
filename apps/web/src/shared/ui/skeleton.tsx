// AdminCN full-navbar 1.0.0 template source; only runtime, content and business integration adaptations.
import { cn } from '@/shared/ui/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot='skeleton' className={cn('bg-muted animate-pulse rounded-md', className)} {...props} />
}

export { Skeleton }
