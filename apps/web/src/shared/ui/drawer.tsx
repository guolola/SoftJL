// Studio-style Vaul drawer primitives used by business side panels.
'use client'

import * as React from 'react'
import { Drawer as DrawerPrimitive } from 'vaul'

import { cn } from '@/shared/ui/utils'

function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  const previousPointerEvents = React.useRef(document.body.style.pointerEvents)
  const desiredPointerEvents = React.useRef(previousPointerEvents.current)

  React.useLayoutEffect(() => {
    if (props.open) {
      desiredPointerEvents.current = 'auto'
      // Vaul's overlay and focus scope still provide modality. Apply this after
      // the primitive updates so nested dialogs never inherit a blocked body.
      document.body.style.pointerEvents = 'auto'
    } else {
      desiredPointerEvents.current = previousPointerEvents.current
      document.body.style.pointerEvents = previousPointerEvents.current
    }
  }, [props.open])

  React.useLayoutEffect(() => {
    const observer = new MutationObserver(() => {
      if (document.body.style.pointerEvents !== desiredPointerEvents.current) {
        document.body.style.pointerEvents = desiredPointerEvents.current
      }
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['style'] })
    return () => {
      observer.disconnect()
      document.body.style.pointerEvents = previousPointerEvents.current
      queueMicrotask(() => {
        document.body.style.pointerEvents = previousPointerEvents.current
      })
    }
  }, [])

  return <DrawerPrimitive.Root data-slot='drawer' handleOnly disablePreventScroll {...props} />
}

function DrawerTrigger(props: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot='drawer-trigger' {...props} />
}

function DrawerPortal(props: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot='drawer-portal' {...props} />
}

function DrawerClose(props: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot='drawer-close' {...props} />
}

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  return (
    <DrawerPrimitive.Overlay
      ref={ref}
      data-slot='drawer-overlay'
      className={cn(
        'fixed inset-0 z-50 bg-black/45',
        className
      )}
      {...props}
    />
  )
})
DrawerOverlay.displayName = 'DrawerOverlay'

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={ref}
        data-slot='drawer-content'
        className={cn(
          'group/drawer-content bg-background text-foreground fixed z-50 flex min-h-0 flex-col border shadow-2xl outline-none',
          'data-[vaul-drawer-direction=right]:inset-y-3 data-[vaul-drawer-direction=right]:right-3 data-[vaul-drawer-direction=right]:w-[calc(100%-1.5rem)] data-[vaul-drawer-direction=right]:rounded-2xl',
          'data-[vaul-drawer-direction=left]:inset-y-3 data-[vaul-drawer-direction=left]:left-3 data-[vaul-drawer-direction=left]:w-[calc(100%-1.5rem)] data-[vaul-drawer-direction=left]:rounded-2xl',
          'data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:max-h-[88dvh] data-[vaul-drawer-direction=bottom]:rounded-t-2xl',
          'data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:max-h-[88dvh] data-[vaul-drawer-direction=top]:rounded-b-2xl',
          className
        )}
        {...props}
      >
        <div className='bg-muted mx-auto mt-3 hidden h-1.5 w-12 shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block' />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
})
DrawerContent.displayName = 'DrawerContent'

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot='drawer-header' className={cn('flex flex-col gap-1 border-b p-4 text-left', className)} {...props} />
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot='drawer-footer' className={cn('mt-auto flex flex-col gap-2 border-t p-4', className)} {...props} />
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title data-slot='drawer-title' className={cn('font-semibold', className)} {...props} />
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return <DrawerPrimitive.Description data-slot='drawer-description' className={cn('text-muted-foreground text-sm', className)} {...props} />
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger
}
