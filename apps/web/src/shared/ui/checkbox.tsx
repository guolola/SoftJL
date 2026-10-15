// AdminCN full-navbar 1.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import * as React from 'react'
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { AnimatePresence, easeOut, motion, useReducedMotion } from 'motion/react'

import { CheckIcon } from 'lucide-react'

import { cn } from '@/shared/ui/utils'

const CONFETTI_COLORS = ['#ff3b30', '#34c759', '#007aff', '#ffcc00', '#af52de', '#32ade6'] as const

type ConfettiParticle = {
  color: string
  delay: number
  x: number
  y: number
}

function createConfettiParticles(): ConfettiParticle[] {
  return Array.from({ length: 12 }, (_, index) => {
    const angle = Math.random() * Math.PI * 2
    const distance = 30 + Math.random() * 20
    return {
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      delay: index * 0.05,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    }
  })
}

const Checkbox = React.forwardRef(function Checkbox({
  className,
  onCheckedChange,
  ...props
}: CheckboxPrimitive.Root.Props, ref: React.ForwardedRef<HTMLButtonElement>) {
  const reduceMotion = useReducedMotion()
  const [confetti, setConfetti] = React.useState<{
    id: number
    particles: ConfettiParticle[]
  } | null>(null)
  const burstIdRef = React.useRef(0)
  const clearTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => () => {
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current)
  }, [])

  const handleCheckedChange: NonNullable<CheckboxPrimitive.Root.Props['onCheckedChange']> = (
    checked,
    eventDetails,
  ) => {
    if (checked && !reduceMotion) {
      burstIdRef.current += 1
      setConfetti({ id: burstIdRef.current, particles: createConfettiParticles() })
      if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current)
      // A bounded timer keeps repeated checks replayable without leaving decorative nodes mounted.
      clearTimerRef.current = window.setTimeout(() => {
        setConfetti(null)
        clearTimerRef.current = null
      }, 800)
    }
    onCheckedChange?.(checked, eventDetails)
  }

  return (
    <CheckboxPrimitive.Root
      data-slot='checkbox'
      className={cn(
        'peer border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs transition-shadow outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3',
        className
      )}
      ref={ref}
      onCheckedChange={handleCheckedChange}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot='checkbox-indicator'
        className='grid place-content-center text-current transition-none [&>svg]:size-3.5'
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
      <AnimatePresence>
        {confetti && (
          <span
            key={confetti.id}
            data-slot='checkbox-confetti'
            aria-hidden='true'
            className='pointer-events-none absolute inset-0 overflow-visible motion-reduce:hidden'
          >
            {confetti.particles.map((particle, index) => (
              <motion.span
                key={`${confetti.id}-${index}`}
                data-slot='checkbox-confetti-particle'
                className='absolute left-1/2 top-1/2 size-1 rounded-full'
                style={{ backgroundColor: particle.color }}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: particle.x,
                  y: particle.y,
                  scale: [0, 1, 0],
                  opacity: [0, 1, 0],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, delay: particle.delay, ease: easeOut }}
              />
            ))}
          </span>
        )}
      </AnimatePresence>
    </CheckboxPrimitive.Root>
  )
});

export { Checkbox }
