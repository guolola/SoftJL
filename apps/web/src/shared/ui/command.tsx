// Styles the cmdk primitives used by the shared searchable multi-select.
'use client'

import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { cn } from './utils'

const Command = React.forwardRef<React.ElementRef<typeof CommandPrimitive>, React.ComponentPropsWithoutRef<typeof CommandPrimitive>>(
  ({ className, ...props }, ref) => <CommandPrimitive ref={ref} data-slot='command' className={cn('bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md', className)} {...props} />
)
Command.displayName = 'Command'

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List data-slot='command-list' className={cn('max-h-64 overflow-x-hidden overflow-y-auto', className)} {...props} />
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group data-slot='command-group' className={cn('text-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground', className)} {...props} />
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return <CommandPrimitive.Item data-slot='command-item' className={cn('data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none', className)} {...props} />
}

export { Command, CommandGroup, CommandItem, CommandList }
