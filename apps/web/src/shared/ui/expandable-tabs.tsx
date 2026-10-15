// Renders a compact, keyboard-accessible tab list whose active item expands to reveal its label.
'use client'

import type { ComponentType, KeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { cn } from '@/shared/ui/utils'

export type ExpandableTabItem = {
  value: string
  label: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
}

export function ExpandableTabs({
  value,
  items,
  onValueChange,
  ariaLabel,
  className
}: {
  value: string
  items: ExpandableTabItem[]
  onValueChange: (value: string) => void
  ariaLabel: string
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, nextIndex: number) => {
    const buttons = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []
    )
    const next = buttons[(nextIndex + buttons.length) % buttons.length]
    next?.focus()
    next?.click()
  }

  return (
    <div
      role='tablist'
      aria-label={ariaLabel}
      className={cn('bg-muted flex h-11 w-fit max-w-full items-center gap-1 overflow-hidden rounded-lg p-1', className)}
    >
      {items.map((item, index) => {
        const active = item.value === value
        const Icon = item.icon

        return (
          <motion.button
            key={item.value}
            type='button'
            role='tab'
            aria-selected={active}
            aria-label={item.label}
            title={item.label}
            tabIndex={active ? 0 : -1}
            className={cn(
              'focus-visible:ring-ring/50 flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-[3px]',
              active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
            initial={false}
            animate={{ width: active ? 116 : 40 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
            onClick={() => onValueChange(item.value)}
            onKeyDown={event => {
              if (event.key === 'ArrowRight') {
                event.preventDefault()
                moveFocus(event, index + 1)
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault()
                moveFocus(event, index - 1)
              } else if (event.key === 'Home') {
                event.preventDefault()
                moveFocus(event, 0)
              } else if (event.key === 'End') {
                event.preventDefault()
                moveFocus(event, items.length - 1)
              }
            }}
          >
            <Icon className='size-4 shrink-0' aria-hidden='true' />
            <AnimatePresence initial={false}>
              {active ? (
                <motion.span
                  className='min-w-0 truncate'
                  initial={reduceMotion ? false : { opacity: 0, scaleX: 0.8 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, scaleX: 0.8 }}
                  transition={{ duration: reduceMotion ? 0 : 0.2 }}
                  style={{ originX: 0 }}
                >
                  {item.label}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.button>
        )
      })}
    </div>
  )
}
