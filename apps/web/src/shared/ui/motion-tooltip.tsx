// Renders keyboard-accessible avatar tooltips with bounded Motion micro-interactions.
'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar'
import { cn } from '@/shared/ui/utils'

export type AnimatedTooltipItem = {
  id: string
  image?: string | null
  fallback: string
  name: string
  designation: string
  ariaLabel?: string
}

function AnimatedTooltipAvatar({
  item,
  reduceMotion,
}: {
  item: AnimatedTooltipItem
  reduceMotion: boolean | null
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tooltipId = useId()

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({ left: rect.left + rect.width / 2, top: rect.top })
  }, [])

  const showTooltip = () => {
    updatePosition()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const reposition = () => updatePosition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, updatePosition])

  return (
    <>
      <motion.span
        ref={triggerRef}
        tabIndex={0}
        aria-label={item.ariaLabel ?? `${item.name}, ${item.designation}`}
        aria-describedby={open ? tooltipId : undefined}
        className='relative inline-flex cursor-default rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
        whileHover={reduceMotion ? undefined : { y: -5, scale: 1.06 }}
        whileFocus={reduceMotion ? undefined : { y: -5, scale: 1.06 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setOpen(false)}
        onFocus={showTooltip}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
      >
        <Avatar size='sm' className='ring-2 ring-card'>
          {item.image ? <AvatarImage src={item.image} alt={item.name} /> : null}
          <AvatarFallback>{item.fallback}</AvatarFallback>
        </Avatar>
      </motion.span>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <div
              id={tooltipId}
              role='tooltip'
              className='pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+10px)]'
              style={{ left: position.left, top: position.top }}
            >
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.85 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
                className='relative grid min-w-max justify-items-center gap-0.5 rounded-md bg-foreground px-3 py-2 text-xs text-background shadow-md'
              >
                <span className='font-medium'>{item.name}</span>
                <span className='text-[11px] text-background/70'>{item.designation}</span>
                <span className='absolute -bottom-1 size-2 rotate-45 bg-foreground' aria-hidden='true' />
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

export function AnimatedTooltip({
  items,
  className,
}: {
  items: AnimatedTooltipItem[]
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {items.map((item) => (
        <AnimatedTooltipAvatar key={item.id} item={item} reduceMotion={reduceMotion} />
      ))}
    </div>
  )
}
