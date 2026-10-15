// AdminCN full-navbar 1.0.0 template source; only runtime, content and business integration adaptations.
import * as React from 'react'

import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '@/shared/ui/utils'

const Input = React.forwardRef(function Input({ className, type, ...props }: React.ComponentProps<'input'>, ref: React.ForwardedRef<any>) {
  return (
    <InputPrimitive
      type={type}
      data-slot='input'
      className={cn(
        'border-input file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-9 w-full min-w-0 rounded-md border bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm',
        className
      )}
      ref={ref} {...props}
    />
  )
});

export { Input }
