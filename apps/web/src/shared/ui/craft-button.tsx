// Adapts shadcn Studio button-49 to the shared Button and utility boundaries.
'use client'

import * as React from 'react'

import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/ui/utils'

interface CraftButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'render'> {
  children?: React.ReactNode
  render?: React.ReactElement
}

interface CraftButtonLabelProps {
  children: React.ReactNode
  className?: string
}

interface CraftButtonIconProps {
  children: React.ReactNode
  className?: string
}

function CraftButtonLabel({ children, className }: CraftButtonLabelProps) {
  return (
    <span className={cn('group-hover/button:text-foreground relative z-2 transition-colors duration-500', className)}>
      {children}
    </span>
  )
}

function CraftButtonIcon({ children, className }: CraftButtonIconProps) {
  return (
    <span aria-hidden='true' className={cn('relative z-1 size-5', className)}>
      <span className='bg-background absolute inset-0 -z-1 size-full rounded-full transition-transform duration-500 group-hover/button:scale-[15]' />
      <span className='bg-background text-primary group-hover/button:bg-primary group-hover/button:text-background relative z-2 flex size-full items-center justify-center rounded-full transition-all duration-500'>
        {children}
      </span>
    </span>
  )
}

function CraftButton({ children, render, className, ...rest }: CraftButtonProps) {
  return (
    <Button
      render={render}
      nativeButton={!render}
      className={cn(
        'hover:bg-background dark:hover:border-primary/30 h-9 cursor-pointer gap-2 overflow-hidden rounded-full border-0 px-4! duration-500 hover:shadow-md active:translate-y-0 dark:border dark:border-transparent',
        className,
      )}
      {...rest}
    >
      {children}
    </Button>
  )
}

export {
  CraftButton,
  CraftButtonIcon,
  CraftButtonLabel,
  type CraftButtonIconProps,
  type CraftButtonLabelProps,
  type CraftButtonProps,
}
