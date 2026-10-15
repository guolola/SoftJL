// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import * as React from 'react'

import { cn } from '@/shared/ui/utils'

import { Button } from '@/features/marketing-site/template/components/ui/button'

interface FlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  className?: string
  asChild?: boolean
}

const PrimaryFlowButton = React.forwardRef(function PrimaryFlowButton({ children, asChild = false, className, ...props }: FlowButtonProps, ref: React.ForwardedRef<any>) {
  return (
    <div className={cn('ring-primary/60 relative isolate w-fit overflow-hidden rounded-lg ring-2', className)}>
      <Button
        asChild={asChild}
        className={cn(
          '[a]:hover:bg-primary hover:bg-primary relative h-10 gap-2 rounded-lg border border-transparent bg-clip-padding px-6 text-base duration-500 text-shadow-xs active:not-aria-[haspopup]:translate-[none]',

          // After - Border gradient effect with rotation
          'after:absolute after:-inset-30 after:-z-1 after:rounded-[inherit] after:border after:border-inherit after:bg-origin-border after:mask-exclude after:transition-transform after:duration-500',

          'after:bg-[conic-gradient(from_90deg_at_50%_50%,var(--primary),var(--primary)_50%,rgba(0,0,0,15%)_51%_99%,var(--primary))] hover:after:rotate-180 dark:after:bg-[conic-gradient(from_90deg_at_50%_50%,var(--primary),var(--primary)_50%,rgba(0,0,0,0%)_51%_99%,var(--primary))]'
        )}
        ref={ref} {...props}
      >
        {children}
      </Button>
    </div>
  )
});

const SecondaryFlowButton = React.forwardRef(function SecondaryFlowButton({ children, asChild = false, className, ...props }: FlowButtonProps, ref: React.ForwardedRef<any>) {
  return (
    <div className={cn('ring-secondary/60 relative isolate w-fit overflow-hidden rounded-lg ring-2', className)}>
      <Button
        variant='secondary'
        asChild={asChild}
        className={cn(
          'hover:bg-secondary [a]:hover:bg-secondary relative h-10 gap-2 rounded-lg border border-transparent bg-clip-padding px-6 text-base duration-500 text-shadow-xs active:not-aria-[haspopup]:translate-[none]',

          // After - Border gradient effect with rotation
          'after:absolute after:-inset-30 after:-z-1 after:rounded-[inherit] after:border after:border-inherit after:bg-origin-border after:mask-exclude after:mask-clip-content after:transition-transform after:duration-500 after:[mask:linear-gradient(black,black),linear-gradient(black,black)]',

          'after:bg-[conic-gradient(from_90deg_at_50%_50%,var(--secondary),var(--secondary)_50%,rgba(0,0,0,15%)_51%_99%,var(--secondary))] hover:after:rotate-180 dark:after:bg-[conic-gradient(from_90deg_at_50%_50%,var(--secondary),var(--secondary)_50%,rgba(255,255,255,60%)_51%_99%,var(--secondary))]'
        )}
        ref={ref} {...props}
      >
        {children}
      </Button>
    </div>
  )
});

export { PrimaryFlowButton, SecondaryFlowButton, type FlowButtonProps }
