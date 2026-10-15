// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import * as React from 'react'

import { motion, isMotionComponent, type HTMLMotionProps } from 'motion/react'

import { cn } from '@/shared/ui/utils'

type AnyProps = Record<string, unknown>

interface DOMMotionProps<T extends HTMLElement = HTMLElement> extends Omit<
  HTMLMotionProps<keyof HTMLElementTagNameMap>,
  'ref'
> {
  ref?: React.Ref<T>
}

type WithAsChild<Base extends object> =
  | (Base & { asChild: true; children: React.ReactElement })
  | (Base & { asChild?: false | undefined })

interface SlotProps<T extends HTMLElement = HTMLElement> extends DOMMotionProps<T> {
  children?: React.ReactNode
}

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]): React.RefCallback<T> {
  return node => {
    refs.forEach(ref => {
      if (!ref) return

      if (typeof ref === 'function') {
        ref(node)
      } else {
        ;(ref as React.RefObject<T | null>).current = node
      }
    })
  }
}

function mergeProps<T extends HTMLElement>(childProps: AnyProps, slotProps: DOMMotionProps<T>): AnyProps {
  const merged: AnyProps = { ...childProps, ...slotProps }

  if (childProps.className || slotProps.className) {
    merged.className = cn(childProps.className as string, slotProps.className as string)
  }

  if (childProps.style || slotProps.style) {
    merged.style = {
      ...(childProps.style as React.CSSProperties),
      ...(slotProps.style as React.CSSProperties)
    }
  }

  return merged
}

const Slot = React.forwardRef<HTMLElement, SlotProps<HTMLElement>>(function Slot({ children, ...props }, ref) {
  const child = React.isValidElement<AnyProps>(children) ? children : null
  const childType = child?.type ?? 'div'
  const isAlreadyMotion = typeof childType === 'object' && isMotionComponent(childType)
  const Base = React.useMemo(
    () => (isAlreadyMotion ? childType : motion.create(childType as React.ElementType)),
    [isAlreadyMotion, childType]
  ) as React.ComponentType<AnyProps & React.RefAttributes<HTMLElement>>

  if (!child) return null

  const childRef = child.props.ref as React.Ref<HTMLElement> | undefined
  const childProps = child.props

  const mergedProps = mergeProps(childProps, props)

  return <Base {...mergedProps} ref={mergeRefs(childRef, ref)} />
});

export { Slot, type SlotProps, type WithAsChild, type DOMMotionProps, type AnyProps }
