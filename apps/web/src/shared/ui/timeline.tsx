// AdminCN original component; imports adapted to the shared UI boundary.
'use client'

import * as React from 'react'

import { cva, type VariantProps } from 'class-variance-authority'

import { CheckIcon, CircleIcon, XIcon } from 'lucide-react'

import { cn } from '@/shared/ui/utils'

const timelineVariants = cva('grid', {
  variants: {
    positions: {
      left: '[&>li]:grid-cols-[0_min-content_1fr]',
      right: '[&>li]:grid-cols-[1fr_min-content]',
      center: '[&>li]:grid-cols-[1fr_min-content_1fr]'
    }
  },
  defaultVariants: {
    positions: 'left'
  }
})

interface TimelineProps extends React.HTMLAttributes<HTMLUListElement>, VariantProps<typeof timelineVariants> {}

const Timeline = React.forwardRef<HTMLUListElement, TimelineProps>(
  ({ children, className, positions, ...props }, ref) => {
    return (
      <ul className={cn(timelineVariants({ positions }), className)} ref={ref} {...props}>
        {children}
      </ul>
    )
  }
)

Timeline.displayName = 'Timeline'

const timelineItemVariants = cva('grid items-center gap-x-2', {
  variants: {
    status: {
      done: 'text-primary',
      default: 'text-muted-foreground'
    }
  },
  defaultVariants: {
    status: 'default'
  }
})

interface TimelineItemProps extends React.HTMLAttributes<HTMLLIElement>, VariantProps<typeof timelineItemVariants> {}

const TimelineItem = React.forwardRef<HTMLLIElement, TimelineItemProps>(({ className, status, ...props }, ref) => (
  <li className={cn(timelineItemVariants({ status }), className)} ref={ref} {...props} />
))

TimelineItem.displayName = 'TimelineItem'

const timelineDotVariants = cva(
  'col-start-2 col-end-3 row-start-1 row-end-1 flex items-center justify-center rounded-full border border-current',
  {
    variants: {
      status: {
        default: 'size-4 [&>*]:hidden',
        current:
          'size-4 [&>*:not(.timeline-icon-circle)]:hidden [&>.timeline-icon-circle>svg]:fill-current [&>.timeline-icon-circle>svg]:text-current',
        done: 'border-success bg-success/10 [&>.timeline-icon-check>svg]:text-success size-4 [&>*:not(.timeline-icon-check)]:hidden',
        error:
          'border-destructive bg-destructive/10 [&>.timeline-icon-x>svg]:text-destructive size-4 [&>*:not(.timeline-icon-x)]:hidden',
        custom: 'border-none [&>*:not(:nth-child(4))]:hidden [&>*:nth-child(4)]:block'
      }
    },
    defaultVariants: {
      status: 'default'
    }
  }
)

type TimelineDotProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof timelineDotVariants> &
  (
    | {
        status?: 'custom'
        children: React.ReactNode
      }
    | {
        status?: Exclude<VariantProps<typeof timelineDotVariants>['status'], 'custom'>
        children?: never
      }
  )

const TimelineDot = React.forwardRef<HTMLDivElement, TimelineDotProps>(
  ({ className, status, children, ...props }, ref) => (
    <div role='status' className={cn('timeline-dot', timelineDotVariants({ status }), className)} ref={ref} {...props}>
      <span className='timeline-icon-circle flex items-center justify-center'>
        <CircleIcon className='size-2.5' />
      </span>
      <span className='timeline-icon-check flex items-center justify-center'>
        <CheckIcon className='size-3' />
      </span>
      <span className='timeline-icon-x flex items-center justify-center'>
        <XIcon className='size-3' />
      </span>
      {children}
    </div>
  )
)

TimelineDot.displayName = 'TimelineDot'

const timelineTagVariants = cva('row-start-1 row-end-1 flex items-center', {
  variants: {
    side: {
      left: 'col-start-1 col-end-2 justify-end whitespace-nowrap',
      right: 'col-start-3 col-end-4 justify-start'
    }
  },
  defaultVariants: {
    side: 'left'
  }
})

interface TimelineTagProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof timelineTagVariants> {}

const TimelineTag = React.forwardRef<HTMLDivElement, TimelineTagProps>(
  ({ className, side, children, ...props }, ref) => (
    <div className={cn(timelineTagVariants({ side }), className)} ref={ref} {...props}>
      {children}
    </div>
  )
)

TimelineTag.displayName = 'TimelineTag'

const timelineContentVariants = cva('text-card-foreground row-start-2 row-end-2 pb-8', {
  variants: {
    side: {
      right: 'col-start-3 col-end-4 mr-auto text-left',
      left: 'col-start-1 col-end-2 ml-auto text-right'
    }
  },
  defaultVariants: {
    side: 'right'
  }
})

interface TimelineContentProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof timelineContentVariants> {}

const TimelineContent = React.forwardRef<HTMLDivElement, TimelineContentProps>(({ className, side, ...props }, ref) => (
  <div className={cn(timelineContentVariants({ side }), className)} ref={ref} {...props} />
))

TimelineContent.displayName = 'TimelineContent'

const timelineHeadingVariants = cva('row-start-1 row-end-1 line-clamp-1 max-w-full truncate', {
  variants: {
    side: {
      right: 'col-start-3 col-end-4 mr-auto text-left',
      left: 'col-start-1 col-end-2 ml-auto text-right'
    },
    variant: {
      primary: 'text-primary text-base font-medium',
      secondary: 'text-muted-foreground text-sm font-light'
    }
  },
  defaultVariants: {
    side: 'right',
    variant: 'primary'
  }
})

interface TimelineHeadingProps
  extends React.HTMLAttributes<HTMLParagraphElement>, VariantProps<typeof timelineHeadingVariants> {}

const TimelineHeading = React.forwardRef<HTMLParagraphElement, TimelineHeadingProps>(
  ({ className, side, variant, ...props }, ref) => (
    <p
      role='heading'
      aria-level={variant === 'primary' ? 2 : 3}
      className={cn(timelineHeadingVariants({ side, variant }), className)}
      ref={ref}
      {...props}
    />
  )
)

TimelineHeading.displayName = 'TimelineHeading'

interface TimelineLineProps extends React.HTMLAttributes<HTMLHRElement> {
  done?: boolean
}

const TimelineLine = React.forwardRef<HTMLHRElement, TimelineLineProps>(
  ({ className, done = false, ...props }, ref) => {
    return (
      <hr
        role='separator'
        aria-orientation='vertical'
        className={cn(
          'col-start-2 col-end-3 row-start-2 row-end-2 mx-auto flex h-full min-h-16 w-0.5 justify-center rounded-full',
          done ? 'bg-primary' : 'bg-muted',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)

TimelineLine.displayName = 'TimelineLine'

export { Timeline, TimelineDot, TimelineItem, TimelineContent, TimelineHeading, TimelineLine, TimelineTag }
