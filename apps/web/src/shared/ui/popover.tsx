// Provides the shared anchored popover primitive used for compact contextual details.
'use client'

import * as React from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { cn } from '@/shared/ui/utils'

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot='popover' {...props} />
}

const PopoverTrigger = React.forwardRef(function PopoverTrigger(
  { ...props }: PopoverPrimitive.Trigger.Props,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  return <PopoverPrimitive.Trigger data-slot='popover-trigger' ref={ref} {...props} />
})

function PopoverContent({
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 6,
  className,
  style,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className='isolate z-50 max-w-[calc(100vw-2rem)] outline-none'
      >
        <PopoverPrimitive.Popup
          data-slot='popover-content'
          className={cn(
            'bg-popover text-popover-foreground ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-0! data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-0! w-80 max-w-[calc(100vw-2rem)] origin-center rounded-lg p-4 text-sm shadow-md ring-1 duration-400 outline-none motion-reduce:animate-none motion-reduce:duration-0',
            className,
          )}
          style={{ pointerEvents: 'auto', ...style }}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

const PopoverTitle = React.forwardRef(function PopoverTitle(
  { className, ...props }: PopoverPrimitive.Title.Props,
  ref: React.ForwardedRef<HTMLHeadingElement>,
) {
  return (
    <PopoverPrimitive.Title
      data-slot='popover-title'
      className={cn('font-heading text-sm font-medium text-foreground', className)}
      ref={ref}
      {...props}
    />
  )
})

const PopoverDescription = React.forwardRef(function PopoverDescription(
  { className, ...props }: PopoverPrimitive.Description.Props,
  ref: React.ForwardedRef<HTMLParagraphElement>,
) {
  return (
    <PopoverPrimitive.Description
      data-slot='popover-description'
      className={cn('mt-1 text-xs leading-5 text-muted-foreground', className)}
      ref={ref}
      {...props}
    />
  )
})

const PopoverClose = React.forwardRef(function PopoverClose(
  { ...props }: PopoverPrimitive.Close.Props,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  return <PopoverPrimitive.Close data-slot='popover-close' ref={ref} {...props} />
})

export {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
}
