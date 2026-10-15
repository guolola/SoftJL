// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import * as React from 'react'

import {
  AnimatePresence,
  motion,
  useInView,
  type HTMLMotionProps,
  type UseInViewOptions,
  type Transition,
  type Variant
} from 'motion/react'

type MotionComponent = keyof HTMLElementTagNameMap

interface MotionPresetProps {
  children?: React.ReactNode
  className?: string
  component?: MotionComponent
  transition?: Transition
  delay?: number
  inView?: boolean
  inViewMargin?: UseInViewOptions['margin']
  inViewOnce?: boolean
  blur?: string | boolean
  slide?:
    | {
        direction?: 'up' | 'down' | 'left' | 'right'
        offset?: number
      }
    | boolean
  fade?: { initialOpacity?: number; opacity?: number } | boolean
  zoom?:
    | {
        initialScale?: number
        scale?: number
      }
    | boolean
  motionProps?: Omit<HTMLMotionProps<'div'>, 'children' | 'className' | 'ref'>
  ref?: React.Ref<HTMLElement>
}

const MotionPreset = React.forwardRef(function MotionPreset({
  children,
  className,
  component = 'div',
  transition = { type: 'spring', stiffness: 200, damping: 20 },
  delay = 0,
  inView = true,
  inViewMargin = '0px',
  inViewOnce = true,
  blur = false,
  slide = false,
  fade = false,
  zoom = false,
  motionProps = {}
}: MotionPresetProps, ref: React.ForwardedRef<HTMLElement>) {
  const localRef = React.useRef<HTMLElement>(null)

  React.useImperativeHandle(ref, () => localRef.current!)

  const inViewResult = useInView(localRef, {
    once: inViewOnce,
    margin: inViewMargin
  })

  const isInView = !inView || inViewResult

  const hiddenVariant: Variant = {}
  const visibleVariant: Variant = {}

  if (blur) {
    hiddenVariant.filter = blur === true ? 'blur(10px)' : `blur(${blur})`
    visibleVariant.filter = 'blur(0px)'
  }

  if (slide) {
    const offset = slide === true ? 100 : (slide.offset ?? 100)
    const direction = slide === true ? 'left' : (slide.direction ?? 'left')
    const axis = direction === 'up' || direction === 'down' ? 'y' : 'x'

    hiddenVariant[axis] = direction === 'left' || direction === 'up' ? -offset : offset
    visibleVariant[axis] = 0
  }

  if (fade) {
    hiddenVariant.opacity = fade === true ? 0 : (fade.initialOpacity ?? 0)
    visibleVariant.opacity = fade === true ? 1 : (fade.opacity ?? 1)
  }

  if (zoom) {
    hiddenVariant.scale = zoom === true ? 0.5 : (zoom.initialScale ?? 0.5)
    visibleVariant.scale = zoom === true ? 1 : (zoom.scale ?? 1)
  }

  // All supported tags expose the same animation contract and an HTMLElement ref.
  const MotionComponent = motion[component] as React.ComponentType<Omit<HTMLMotionProps<'div'>, 'ref'> & React.RefAttributes<HTMLElement>>

  return (
    <AnimatePresence>
      <MotionComponent
        ref={localRef}
        initial='hidden'
        animate={isInView ? 'visible' : 'hidden'}
        exit='hidden'
        variants={{
          hidden: hiddenVariant,
          visible: visibleVariant
        }}
        transition={{
          ...transition,
          delay: (transition?.delay ?? 0) + delay
        }}
        className={className}
        {...motionProps}
      >
        {children}
      </MotionComponent>
    </AnimatePresence>
  )
});

export { MotionPreset, type MotionPresetProps }
