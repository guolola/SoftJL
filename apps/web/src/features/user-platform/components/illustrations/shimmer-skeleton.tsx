// Renders the loading tiles used by the supplied chat illustration.
'use client'

import { motion, type HTMLMotionProps } from 'motion/react'

import { cn } from '../../../../shared/ui/utils'

type ShimmerSkeletonProps = HTMLMotionProps<'div'>

function ShimmerSkeleton({ className, ...props }: ShimmerSkeletonProps) {
  return (
    <motion.div
      className={cn(
        'rounded-md bg-[linear-gradient(120deg,var(--muted)_calc(var(--shimmer-x)-25%),oklch(100%_0_0/0.4)_var(--shimmer-x),var(--muted)_calc(var(--shimmer-x)+25%))] [--shimmer-x:0%]',
        className
      )}
      initial={{
        '--shimmer-x': '-100%'
      }}
      animate={{
        '--shimmer-x': '200%'
      }}
      transition={{
        '--shimmer-x': {
          duration: 1.7,
          repeat: Infinity,
          ease: [0.445, 0.05, 0.55, 0.95]
        }
      }}
      {...props}
    />
  )
}

export { ShimmerSkeleton, type ShimmerSkeletonProps }
