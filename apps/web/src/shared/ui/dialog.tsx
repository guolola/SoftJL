// AdminCN full-navbar 1.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import * as React from 'react'

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'

import { XIcon } from 'lucide-react'

import { cn } from '@/shared/ui/utils'
import { Button } from '@/shared/ui/button'

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot='dialog' {...props} />
}

const DialogTrigger = React.forwardRef(function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props, ref: React.ForwardedRef<HTMLButtonElement>) {
  return <DialogPrimitive.Trigger data-slot='dialog-trigger' ref={ref} {...props} />
});

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot='dialog-portal' {...props} />
}

const DialogClose = React.forwardRef(function DialogClose({ ...props }: DialogPrimitive.Close.Props, ref: React.ForwardedRef<HTMLButtonElement>) {
  return <DialogPrimitive.Close data-slot='dialog-close' ref={ref} {...props} />
});

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot='dialog-overlay'
      className={cn(
        'pointer-events-auto data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs motion-reduce:animate-none motion-reduce:duration-0',
        className
      )}
      {...props}
    />
  )
}

const DialogContent = React.forwardRef(function DialogContent({
  className,
  children,
  showCloseButton = true,
  keepMounted = false,
  overlayClassName,
  style,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  keepMounted?: boolean
  overlayClassName?: string
}, ref: React.ForwardedRef<HTMLDivElement>) {
  return (
    <DialogPortal keepMounted={keepMounted}>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Popup
        data-slot='dialog-content'
        className={cn(
          'bg-popover text-popover-foreground ring-foreground/10 pointer-events-auto data-open:animate-in data-open:fade-in-0 data-open:zoom-in-0! data-open:duration-600 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:duration-100 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl p-6 text-sm ring-1 outline-none motion-reduce:animate-none motion-reduce:duration-0 sm:max-w-md',
          className
        )}
        ref={ref}
        style={{ pointerEvents: 'auto', ...style }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot='dialog-close'
            render={<Button variant='ghost' className='absolute top-4 right-4' size='icon-sm' />}
          >
            <XIcon />
            <span className='sr-only'>Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
});

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot='dialog-header' className={cn('flex flex-col gap-2', className)} {...props} />
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot='dialog-footer'
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    >
      {children}
      {showCloseButton && <DialogPrimitive.Close render={<Button variant='outline' />}>Close</DialogPrimitive.Close>}
    </div>
  )
}

const DialogTitle = React.forwardRef(function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props, ref: React.ForwardedRef<HTMLHeadingElement>) {
  return (
    <DialogPrimitive.Title
      data-slot='dialog-title'
      className={cn('font-heading leading-none font-medium', className)}
      ref={ref} {...props}
    />
  )
});

const DialogDescription = React.forwardRef(function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props, ref: React.ForwardedRef<HTMLParagraphElement>) {
  return (
    <DialogPrimitive.Description
      data-slot='dialog-description'
      className={cn(
        'text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3',
        className
      )}
      ref={ref} {...props}
    />
  )
});

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
}
