// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import * as React from 'react'

import { motion, isMotionComponent, type HTMLMotionProps } from 'motion/react'

import { cn } from '@/shared/ui/utils'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface AnyProps extends Record<string, unknown> {}

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
  children?: any
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
  const isAlreadyMotion =
    typeof children.type === 'object' && children.type !== null && isMotionComponent(children.type)

  const Base = React.useMemo(
    () => (isAlreadyMotion ? (children.type as React.ElementType) : motion.create(children.type as React.ElementType)),
    [isAlreadyMotion, children.type]
  )

  if (!React.isValidElement(children)) return null

  const childRef = (children as React.ReactElement & { ref?: React.Ref<HTMLElement> }).ref
  const childProps = children.props as AnyProps

  const mergedProps = mergeProps(childProps, props)

  // @ts-ignore
  // eslint-disable-next-line react-hooks/static-components
  return <Base {...mergedProps} ref={mergeRefs(childRef, ref)} />
});

export { Slot, type SlotProps, type WithAsChild, type DOMMotionProps, type AnyProps }
