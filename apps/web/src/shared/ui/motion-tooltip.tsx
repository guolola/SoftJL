// Adapts shadcn Studio tooltip-16 with accessible triggers and portal positioning for project cards.
'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'

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
  tooltipClassName,
  avatarSize,
}: {
  item: AnimatedTooltipItem
  reduceMotion: boolean | null
  tooltipClassName?: string
  avatarSize: 'default' | 'sm' | 'lg'
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tooltipId = useId()
  const x = useMotionValue(0)
  const springConfig = { stiffness: 100, damping: 5 }
  const rotate = useSpring(useTransform(x, [-100, 100], [-45, 45]), springConfig)
  const translateX = useSpring(useTransform(x, [-100, 100], [-50, 50]), springConfig)

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({ left: rect.left + rect.width / 2, top: rect.top })
  }, [])

  const showTooltip = () => {
    x.set(0)
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
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-label={item.ariaLabel ?? `${item.name}, ${item.designation}`}
        aria-describedby={open ? tooltipId : undefined}
        className='relative inline-flex cursor-default rounded-full outline-none hover:z-1 focus-visible:z-1 focus-visible:ring-3 focus-visible:ring-ring/50'
        onMouseEnter={showTooltip}
        onMouseLeave={() => setOpen(false)}
        onFocus={showTooltip}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
      >
        <Avatar
          size={avatarSize}
          className='ring-background relative ring-2 transition-all duration-300 ease-in-out hover:z-1 hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none'
          onMouseMove={(event) => {
            if (reduceMotion) return
            // Use the avatar bounds so image/fallback children share the same pointer origin.
            const bounds = event.currentTarget.getBoundingClientRect()
            x.set(event.clientX - bounds.left - bounds.width / 2)
          }}
        >
          {item.image ? <AvatarImage src={item.image} alt={item.name} /> : null}
          <AvatarFallback className='text-xs'>{item.fallback}</AvatarFallback>
        </Avatar>
      </span>
      {/* Cards clip their contents; keep the floating tooltip outside that boundary. */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence mode='popLayout'>
          {open && (
            <div
              id={tooltipId}
              role='tooltip'
              className={cn('pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+8px)]', tooltipClassName)}
              style={{ left: position.left, top: position.top }}
            >
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                // A spring can rebound above zero opacity after disappearing, producing a second flash.
                exit={reduceMotion ? { opacity: 0 } : {
                  opacity: 0, y: 20, scale: 0.6,
                  transition: { type: 'tween', duration: 0.12, ease: 'easeOut' },
                }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 10 }}
                style={{ translateX: reduceMotion ? 0 : translateX, rotate: reduceMotion ? 0 : rotate, whiteSpace: 'nowrap' }}
                className='relative flex flex-col items-center justify-center rounded-md bg-foreground px-4 py-2 text-xs text-background shadow-xl'
              >
                <span className='relative z-1 text-base font-semibold'>{item.name}</span>
                <span className='text-xs text-background/80'>{item.designation}</span>
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
  tooltipClassName,
  avatarSize = 'sm',
}: {
  items: AnimatedTooltipItem[]
  className?: string
  tooltipClassName?: string
  avatarSize?: 'default' | 'sm' | 'lg'
}) {
  const reduceMotion = useReducedMotion()

  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {items.map((item) => (
        <AnimatedTooltipAvatar key={item.id} item={item} reduceMotion={reduceMotion} tooltipClassName={tooltipClassName} avatarSize={avatarSize} />
      ))}
    </div>
  )
}
