// AdminCN full-navbar 1.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import * as React from 'react'
import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { motion, useReducedMotion } from 'motion/react'

import { cn } from '@/shared/ui/utils'

export type SwitchSize = 'default' | 'sm' | 'md' | 'lg'

const Switch = React.forwardRef(function Switch({
  className,
  size = 'default',
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: SwitchSize
}, ref: React.ForwardedRef<HTMLButtonElement>) {
  const reduceMotion = useReducedMotion()
  const resolvedSize = size === 'default' ? 'md' : size

  return (
    <SwitchPrimitive.Root
      data-slot='switch'
      data-size={resolvedSize}
      className={cn(
        'peer group/switch focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 relative inline-flex shrink-0 items-center justify-start rounded-full border border-transparent p-px shadow-xs transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 aria-invalid:ring-3 data-checked:justify-end data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=lg]:h-6 data-[size=lg]:w-11 data-[size=md]:h-[18.4px] data-[size=md]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 motion-reduce:transition-none',
        className
      )}
      ref={ref} {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot='switch-thumb'
        className='bg-background dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground pointer-events-none block rounded-full ring-0 group-data-[size=lg]/switch:size-5 group-data-[size=md]/switch:size-4 group-data-[size=sm]/switch:size-3'
        render={(
          <motion.span
            layout={reduceMotion ? false : 'position'}
            transition={reduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 500, damping: 30 }}
          />
        )}
      />
    </SwitchPrimitive.Root>
  )
});

export { Switch }
