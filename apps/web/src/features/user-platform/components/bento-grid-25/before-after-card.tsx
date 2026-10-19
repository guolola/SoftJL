// Compares a requirements page with the UML model generated from it, keeping the supplied drag-to-reveal interaction.
'use client'

import { useCallback, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '../../../../shared/ui/card'
import { MotionPreset } from './motion-preset'

import { cn } from '../../../../shared/ui/utils'
import { CodeIcon } from 'lucide-react'

const BEFORE_IMAGE = '/marketing/empty-projects/requirements-before.svg'

const AFTER_IMAGE = '/marketing/empty-projects/uml-model-after.svg'

const MAX_POSITION = 99.5

const BeforeAfterCard = () => {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const [position, setPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current

    if (!container) return

    const { left, width } = container.getBoundingClientRect()
    const percentage = ((clientX - left) / width) * 100

    setPosition(Math.min(MAX_POSITION, Math.max(0, percentage)))
  }, [])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    updatePosition(event.clientX)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return

    updatePosition(event.clientX)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false
    setIsDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <MotionPreset
      fade
      blur
      slide={{ direction: 'down', offset: 75 }}
      transition={{ duration: 0.45 }}
      delay={0.3}
      className='flex flex-1 flex-col'
    >
      <Card
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={cn(
          'relative min-h-100 flex-1 touch-none overflow-hidden shadow-none ring-0 select-none',
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
      >
        <img
          src={AFTER_IMAGE}
          alt={t('projects.emptyBento.comparison.afterAlt')}
          draggable={false}
          loading='lazy'
          className='absolute inset-0 size-full object-cover'
        />

        <div className='absolute inset-0 overflow-hidden' style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <img
            src={BEFORE_IMAGE}
            alt={t('projects.emptyBento.comparison.beforeAlt')}
            draggable={false}
            loading='lazy'
            className='absolute inset-0 size-full object-cover'
          />
        </div>

        <span className='bg-primary/30 text-card absolute top-4 left-4 rounded-full px-3 py-1 text-sm backdrop-blur-sm'>
          {t('projects.emptyBento.comparison.before')}
        </span>
        <span className='bg-primary/30 text-card absolute top-4 right-4 rounded-full px-3 py-1 text-sm backdrop-blur-sm'>
          {t('projects.emptyBento.comparison.after')}
        </span>

        <div className='absolute inset-y-0 w-0.5 bg-white' style={{ left: `${position}%` }}>
          <div className='absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md'>
            <CodeIcon className='size-4 text-black' />
          </div>
        </div>
      </Card>
    </MotionPreset>
  )
}

export default BeforeAfterCard
