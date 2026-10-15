// AdminCN full-navbar 1.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import type { MotionStyle, Transition } from 'motion/react'
import { motion } from 'motion/react'

import { cn } from '@/shared/ui/utils'

interface BorderBeamProps {
  size?: number
  duration?: number
  delay?: number
  colorFrom?: string
  colorTo?: string
  transition?: Transition
  className?: string
  style?: React.CSSProperties
  reverse?: boolean
  initialOffset?: number
  borderWidth?: number
  reducedMotion?: boolean
}

function BorderBeam({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = 'var(--destructive)',
  colorTo = 'var(--primary)',
  transition,
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
  reducedMotion = false
}: BorderBeamProps) {
  return (
    <div
      data-slot='border-beam'
      className='pointer-events-none absolute inset-0 rounded-[inherit] border-(length:--border-beam-width) border-transparent mask-[linear-gradient(transparent,transparent),linear-gradient(#000,#000)] mask-intersect [mask-clip:padding-box,border-box]'
      style={
        {
          '--border-beam-width': `${borderWidth}px`
        } as React.CSSProperties
      }
    >
      <motion.div
        className={cn(
          'absolute aspect-square',
          'rounded-full bg-linear-to-l from-[var(--color-from)] via-[var(--color-to)] to-transparent',
          className
        )}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            '--color-from': colorFrom,
            '--color-to': colorTo,
            ...style
          } as MotionStyle
        }
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={{
          offsetDistance: reducedMotion ? `${initialOffset}%` : reverse
            ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
            : [`${initialOffset}%`, `${100 + initialOffset}%`]
        }}
        transition={{
          repeat: reducedMotion ? 0 : Infinity,
          ease: 'linear',
          duration: reducedMotion ? 0 : duration,
          delay: -delay,
          ...transition
        }}
      />
    </div>
  )
}

export { BorderBeam, type BorderBeamProps }
