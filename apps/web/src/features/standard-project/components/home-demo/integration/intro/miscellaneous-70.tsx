// User-supplied miscellaneous-70: draggable gravity badges above the conversation composer.
'use client'

// React Imports
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Third-party Imports
import Matter from 'matter-js'

// Component Imports
import { Badge } from '@/components/ui/badge'

const BADGES = [
  { emoji: '📝', key: 'requirements' },
  { emoji: '🧩', key: 'models' },
  { emoji: '✏️', key: 'edit' },
  { emoji: '🧪', key: 'tests' },
  { emoji: '📄', key: 'requirementsSpec' },
  { emoji: '📘', key: 'softwareDesignSpec' },
  { emoji: '🧠', key: 'memory' }
]

const { Bodies, Body, Engine, Mouse, MouseConstraint, World } = Matter

const GRAVITY = 0.7
const MOUSE_CONSTRAINT_STIFFNESS = 0.6
const MOUSE_CONSTRAINT_DAMPING = 0.1
const FIXED_STEP_MS = 1000 / 60
const MAX_FRAME_MS = 50

const Miscellaneous70 = () => {
  const { t, i18n } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const badgesRef = useRef<HTMLDivElement>(null)

  const [effectStarted, setEffectStarted] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    const badgesContainer = badgesRef.current

    if (!effectStarted || !container || !badgesContainer) return

    const containerRect = container.getBoundingClientRect()
    let { width, height } = containerRect

    if (width <= 0 || height <= 0) return

    const engine = Engine.create()

    engine.world.gravity.y = GRAVITY

    const boundaryOptions = { isStatic: true, render: { fillStyle: 'transparent' } }

    const boundaries = [
      Bodies.rectangle(width / 2, height + 25, width, 50, boundaryOptions),
      Bodies.rectangle(-25, height / 2, 50, height, boundaryOptions),
      Bodies.rectangle(width + 25, height / 2, 50, height, boundaryOptions),
      Bodies.rectangle(width / 2, -25, width, 50, boundaryOptions)
    ]

    const badgeBodies = [...badgesContainer.querySelectorAll<HTMLElement>('[data-badge-item]')].map(element => {
      const rect = element.getBoundingClientRect()

      const body = Bodies.rectangle(
        rect.left - containerRect.left + rect.width / 2,
        rect.top - containerRect.top + rect.height / 2,
        rect.width,
        rect.height,
        {
          render: { fillStyle: 'transparent' },
          restitution: 0.7,
          frictionAir: 0.01,
          friction: 0.2,
          chamfer: { radius: rect.height / 2 }
        }
      )

      Body.setVelocity(body, { x: (Math.random() - 0.5) * 5, y: 0 })
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.05)

      return { element, body, halfWidth: rect.width / 2, halfHeight: rect.height / 2 }
    })

    const place = (element: HTMLElement, body: Matter.Body, halfWidth: number, halfHeight: number) => {
      element.style.transform = `translate3d(${body.position.x - halfWidth}px, ${body.position.y - halfHeight}px, 0) rotate(${body.angle}rad)`
    }

    badgeBodies.forEach(({ element, body, halfWidth, halfHeight }) => {
      element.style.position = 'absolute'
      element.style.left = '0'
      element.style.top = '0'
      element.style.willChange = 'transform'
      element.style.transition = 'none'
      place(element, body, halfWidth, halfHeight)
    })

    const mouse = Mouse.create(container)

    // Matter owns drag listeners, but scrolling over the intro must still reach the thread.
    const listeners = mouse as Matter.Mouse & Record<'mousemove' | 'mousedown' | 'mouseup' | 'mousewheel', EventListener>
    container.removeEventListener('wheel', listeners.mousewheel)

    const mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: MOUSE_CONSTRAINT_STIFFNESS,
        damping: MOUSE_CONSTRAINT_DAMPING,
        render: { visible: false }
      }
    })

    World.add(engine.world, [...boundaries, mouseConstraint, ...badgeBodies.map(({ body }) => body)])

    // Keep the floor attached to the input when the viewport or sidebar changes width.
    const resizeObserver = new ResizeObserver(() => {
      const next = container.getBoundingClientRect()
      if (next.width <= 0 || next.height <= 0 || (next.width === width && next.height === height)) return
      Body.scale(boundaries[0], next.width / width, 1)
      Body.scale(boundaries[3], next.width / width, 1)
      Body.scale(boundaries[1], 1, next.height / height)
      Body.scale(boundaries[2], 1, next.height / height)
      width = next.width
      height = next.height
      Body.setPosition(boundaries[0], { x: width / 2, y: height + 25 })
      Body.setPosition(boundaries[1], { x: -25, y: height / 2 })
      Body.setPosition(boundaries[2], { x: width + 25, y: height / 2 })
      Body.setPosition(boundaries[3], { x: width / 2, y: -25 })
    })
    resizeObserver.observe(container)

    let rafId: number
    let lastTime = performance.now()
    let accumulator = 0

    const updateLoop = (time: number) => {
      accumulator += Math.min(time - lastTime, MAX_FRAME_MS)
      lastTime = time

      while (accumulator >= FIXED_STEP_MS) {
        Engine.update(engine, FIXED_STEP_MS)
        accumulator -= FIXED_STEP_MS
      }

      badgeBodies.forEach(({ body, element, halfWidth, halfHeight }) => {
        const { x, y } = body.position

        if (x < 0 || x > width || y < 0 || y > height) {
          mouse.button = -1
          Body.setPosition(body, {
            x: Math.min(Math.max(x, halfWidth), width - halfWidth),
            y: Math.min(Math.max(y, halfHeight), height - halfHeight)
          })
          Body.setVelocity(body, { x: 0, y: 0 })
        }

        place(element, body, halfWidth, halfHeight)
      })

      rafId = requestAnimationFrame(updateLoop)
    }

    rafId = requestAnimationFrame(updateLoop)

    return () => {
      cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      container.removeEventListener('mousemove', listeners.mousemove)
      container.removeEventListener('mousedown', listeners.mousedown)
      container.removeEventListener('mouseup', listeners.mouseup)
      container.removeEventListener('touchmove', listeners.mousemove)
      container.removeEventListener('touchstart', listeners.mousedown)
      container.removeEventListener('touchend', listeners.mouseup)
      Mouse.clearSourceEvents(mouse)
      World.clear(engine.world, false)
      Engine.clear(engine)
    }
  }, [effectStarted, i18n.resolvedLanguage])

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setEffectStarted(true)}
      onTouchStart={() => setEffectStarted(true)}
      className='relative z-1 h-64 w-full max-w-100 cursor-pointer overflow-hidden'
    >
      <div ref={badgesRef} className='flex flex-wrap items-center justify-center gap-2 p-0'>
        {BADGES.map(({ emoji, key }) => (
          <Badge
            key={`${i18n.resolvedLanguage}:${key}`}
            data-badge-item
            role='img'
            aria-label={t(`standardProject.intro.badges.${key}`)}
            variant='outline'
            className='bg-muted text-foreground border-border h-auto gap-1.5 px-3 py-1.5 text-[13px] sm:text-base font-medium select-none'
          >
            <span aria-hidden='true'>{emoji}</span>
            <span aria-hidden='true'>{t(`standardProject.intro.badges.${key}`)}</span>
          </Badge>
        ))}
      </div>
    </div>
  )
}

export default Miscellaneous70
