// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import * as React from 'react'

import { Separator as SeparatorPrimitive } from 'radix-ui'

import { cn } from '@/shared/ui/utils'

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot='separator'
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'bg-border shrink-0 data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch',
        className
      )}
      {...props}
    />
  )
}

export { Separator }
