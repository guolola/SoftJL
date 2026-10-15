// AdminCN full-navbar 1.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import * as React from 'react'

import { Select as SelectPrimitive } from '@base-ui/react/select'

import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from 'lucide-react'

import { cn } from '@/shared/ui/utils'

// Base UI needs labels before the popup mounts to display controlled values.
function Select({ children, items, ...props }: SelectPrimitive.Root.Props<string>) {
  const options: Array<{ value: string; label: React.ReactNode }> = [];
  function collect(nodes: React.ReactNode) {
    React.Children.forEach(nodes, node => {
      if (!React.isValidElement<{ value?: string; children?: React.ReactNode }>(node)) return;
      if (node.type === SelectItem && node.props.value !== undefined) {
        options.push({ value: node.props.value, label: node.props.children });
      } else collect(node.props.children);
    });
  }
  collect(children);
  return <SelectPrimitive.Root items={items ?? options} {...props}>{children}</SelectPrimitive.Root>;
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot='select-group' className={cn('scroll-my-1 p-1', className)} {...props} />
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value data-slot='select-value' className={cn('flex flex-1 text-left', className)} {...props} />
  )
}

const SelectTrigger = React.forwardRef(function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: 'sm' | 'default'
}, ref: React.ForwardedRef<any>) {
  return (
    <SelectPrimitive.Trigger
      data-slot='select-trigger'
      data-size={size}
      className={cn(
        "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex w-fit items-center justify-between gap-1.5 rounded-md border bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      ref={ref} {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon className='text-muted-foreground pointer-events-none size-4' />} />
    </SelectPrimitive.Trigger>
  )
});

function SelectContent({
  className,
  children,
  style,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className='isolate z-50'
      >
        <SelectPrimitive.Popup
          data-slot='select-content'
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            'bg-popover text-popover-foreground ring-foreground/10 data-[side=bottom]:slide-in-from-bottom-8! data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-8! data-open:animate-in data-open:fade-in-0 data-open:zoom-in-100 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md shadow-md ring-1 duration-400 motion-reduce:animate-none motion-reduce:duration-0',
            className
          )}
          style={{ pointerEvents: 'auto', ...style }}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot='select-label'
      className={cn('text-muted-foreground px-2 py-1.5 text-xs', className)}
      {...props}
    />
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot='select-item'
      className={cn(
        "focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className='flex flex-1 shrink-0 gap-2 whitespace-nowrap'>
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={<span className='pointer-events-none absolute right-2 flex size-4 items-center justify-center' />}
      >
        <CheckIcon className='pointer-events-none' />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot='select-separator'
      className={cn('bg-border pointer-events-none -mx-1 my-1 h-px', className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot='select-scroll-up-button'
      className={cn(
        "bg-popover top-0 z-10 flex w-full cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot='select-scroll-down-button'
      className={cn(
        "bg-popover bottom-0 z-10 flex w-full cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue
}

// Business option lists compose the template primitives; empty values remain valid selections.
export type SelectControlOption = { value: string; label: React.ReactNode; disabled?: boolean };
export function SelectControl({ value, onValueChange, options, placeholder, disabled, id, size = 'default', className, contentClassName, 'aria-label': ariaLabel }: {
  value: string; onValueChange: (value: string) => void; options: SelectControlOption[];
  placeholder?: string; disabled?: boolean; id?: string; size?: 'sm' | 'default';
  className?: string; contentClassName?: string; 'aria-label'?: string;
}) {
  return <Select value={value} onValueChange={(next) => { if (next !== null) onValueChange(next); }} disabled={disabled} items={options}>
    <SelectTrigger id={id} size={size} className={cn('w-full', className)} aria-label={ariaLabel}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent className={contentClassName} alignItemWithTrigger={false}>
      {options.map(option => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}
    </SelectContent>
  </Select>;
}
