// Shadcn Studio autocomplete primitive supplied with the autocomplete-09 demo.
'use client'

import { Autocomplete as AutocompletePrimitive } from '@base-ui/react/autocomplete'

import { cva, type VariantProps } from 'class-variance-authority'
import { ScrollArea } from './scroll-area'
import { cn } from './utils'
import { CircleXIcon, SearchIcon } from 'lucide-react'

const inputVariants = cva(
  'text-foreground placeholder:text-muted-foreground [[readonly]]:bg-muted/80 border-input focus-visible:border-ring aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 dark:bg-input/30 focus-visible:ring-ring/50 flex w-full rounded-lg border bg-transparent text-sm transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 [[readonly]]:cursor-not-allowed',
  {
    variants: {
      size: {
        sm: 'h-7 px-2 [&~[data-slot=autocomplete-clear]]:right-1.5 [&~[data-slot=autocomplete-trigger]]:right-1.5',
        default:
          'h-8 px-2.5 [&~[data-slot=autocomplete-clear]]:right-1.75 [&~[data-slot=autocomplete-trigger]]:right-1.75',
        lg: 'h-9 px-2.5 [&~[data-slot=autocomplete-clear]]:right-2 [&~[data-slot=autocomplete-trigger]]:right-2'
      }
    },
    defaultVariants: {
      size: 'default'
    }
  }
)

const Autocomplete = AutocompletePrimitive.Root

const AutocompleteValue = ({ ...props }: AutocompletePrimitive.Value.Props) => {
  return <AutocompletePrimitive.Value data-slot='autocomplete-value' {...props} />
}

const AutocompleteInput = ({
  className,
  size = 'default',
  showClear = false,
  showTrigger = false,
  ...props
}: Omit<AutocompletePrimitive.Input.Props, 'size'> &
  VariantProps<typeof inputVariants> & {
    showClear?: boolean
    showTrigger?: boolean
  }) => {
  return (
    <div className='relative w-full'>
      <AutocompletePrimitive.Input
        data-slot='autocomplete-input'
        data-size={size}
        className={cn(inputVariants({ size }), className)}
        {...props}
      />
      {showTrigger && <AutocompleteTrigger />}
      {showClear && <AutocompleteClear />}
    </div>
  )
}

const AutocompleteStatus = ({ className, ...props }: AutocompletePrimitive.Status.Props) => {
  return (
    <AutocompletePrimitive.Status
      data-slot='autocomplete-status'
      className={cn('text-muted-foreground px-2 py-1.5 text-sm empty:m-0 empty:p-0', className)}
      {...props}
    />
  )
}

const AutocompletePortal = ({ ...props }: AutocompletePrimitive.Portal.Props) => {
  return <AutocompletePrimitive.Portal data-slot='autocomplete-portal' {...props} />
}

const AutocompleteBackdrop = ({ ...props }: AutocompletePrimitive.Backdrop.Props) => {
  return <AutocompletePrimitive.Backdrop data-slot='autocomplete-backdrop' {...props} />
}

const AutocompletePositioner = ({ className, ...props }: AutocompletePrimitive.Positioner.Props) => {
  return (
    <AutocompletePrimitive.Positioner
      data-slot='autocomplete-positioner'
      className={cn('z-50 outline-none', className)}
      {...props}
    />
  )
}

const AutocompleteList = ({
  className,
  scrollAreaClassName,
  ...props
}: AutocompletePrimitive.List.Props & {
  scrollAreaClassName?: string
  scrollFade?: boolean
  scrollbarGutter?: boolean
}) => {
  return (
    <ScrollArea
      className={cn(
        'size-full min-h-0 **:data-[slot=scroll-area-viewport]:h-full **:data-[slot=scroll-area-viewport]:overscroll-contain',
        scrollAreaClassName
      )}
    >
      <AutocompletePrimitive.List
        data-slot='autocomplete-list'
        className={cn('not-empty:scroll-py-1 not-empty:px-1 not-empty:py-1 in-data-has-overflow-y:mr-3', className)}
        {...props}
      />
    </ScrollArea>
  )
}

const AutocompleteCollection = ({ ...props }: React.ComponentProps<typeof AutocompletePrimitive.Collection>) => {
  return <AutocompletePrimitive.Collection data-slot='autocomplete-collection' {...props} />
}

const AutocompleteRow = ({ className, ...props }: React.ComponentProps<typeof AutocompletePrimitive.Row>) => {
  return (
    <AutocompletePrimitive.Row
      data-slot='autocomplete-row'
      className={cn('flex items-center gap-2', className)}
      {...props}
    />
  )
}

const AutocompleteItem = ({ className, ...props }: React.ComponentProps<typeof AutocompletePrimitive.Item>) => {
  return (
    <AutocompletePrimitive.Item
      data-slot='autocomplete-item'
      className={cn(
        "text-foreground data-highlighted:text-foreground data-highlighted:before:bg-accent relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden transition-colors select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:relative data-highlighted:z-0 data-highlighted:before:absolute data-highlighted:before:inset-x-0 data-highlighted:before:inset-y-0 data-highlighted:before:z-[-1] data-highlighted:before:rounded-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([role=img]):not([class*=text-])]:opacity-60",
        className
      )}
      {...props}
    />
  )
}

export interface AutocompleteContentProps extends React.ComponentProps<typeof AutocompletePrimitive.Popup> {
  align?: AutocompletePrimitive.Positioner.Props['align']
  sideOffset?: AutocompletePrimitive.Positioner.Props['sideOffset']
  alignOffset?: AutocompletePrimitive.Positioner.Props['alignOffset']
  side?: AutocompletePrimitive.Positioner.Props['side']
  anchor?: AutocompletePrimitive.Positioner.Props['anchor']
  showBackdrop?: boolean
}

const AutocompleteContent = ({
  className,
  children,
  showBackdrop = false,
  align = 'start',
  sideOffset = 4,
  alignOffset = 0,
  side = 'bottom',
  anchor,
  ...props
}: AutocompleteContentProps) => {
  return (
    <AutocompletePortal>
      {showBackdrop && <AutocompleteBackdrop />}
      <AutocompletePositioner
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        side={side}
        anchor={anchor}
      >
        <div className='relative flex max-h-full'>
          <AutocompletePrimitive.Popup
            data-slot='autocomplete-popup'
            className={cn(
              'text-popover-foreground ring-foreground/10 bg-background flex max-h-[min(var(--available-height),24rem)] w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) scroll-pt-2 scroll-pb-2 flex-col overscroll-contain rounded-lg py-0.5 shadow-md ring-1 transition-[scale,opacity] has-data-starting-style:scale-98 has-data-starting-style:opacity-0 has-data-[side=none]:scale-100 has-data-[side=none]:transition-none',
              className
            )}
            {...props}
          >
            {children}
          </AutocompletePrimitive.Popup>
        </div>
      </AutocompletePositioner>
    </AutocompletePortal>
  )
}

const AutocompleteGroup = ({ ...props }: React.ComponentProps<typeof AutocompletePrimitive.Group>) => {
  return <AutocompletePrimitive.Group data-slot='autocomplete-group' {...props} />
}

const AutocompleteGroupLabel = ({
  className,
  ...props
}: React.ComponentProps<typeof AutocompletePrimitive.GroupLabel>) => {
  return (
    <AutocompletePrimitive.GroupLabel
      data-slot='autocomplete-group-label'
      className={cn('text-muted-foreground px-1.5 py-1 text-xs font-medium', className)}
      {...props}
    />
  )
}

const AutocompleteEmpty = ({ className, ...props }: React.ComponentProps<typeof AutocompletePrimitive.Empty>) => {
  return (
    <AutocompletePrimitive.Empty
      data-slot='autocomplete-empty'
      className={cn('text-muted-foreground px-2 py-1.5 text-center text-sm empty:m-0 empty:p-0', className)}
      {...props}
    />
  )
}

const AutocompleteClear = ({ className, ...props }: React.ComponentProps<typeof AutocompletePrimitive.Clear>) => {
  return (
    <AutocompletePrimitive.Clear
      data-slot='autocomplete-clear'
      className={cn(
        'ring-offset-background focus:ring-ring absolute top-1/2 -translate-y-1/2 cursor-pointer opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none data-disabled:pointer-events-none',
        className
      )}
      {...props}
    >
      <CircleXIcon className='size-4' />
    </AutocompletePrimitive.Clear>
  )
}

const AutocompleteTrigger = ({ className, ...props }: React.ComponentProps<typeof AutocompletePrimitive.Trigger>) => {
  return (
    <AutocompletePrimitive.Trigger
      data-slot='autocomplete-trigger'
      className={cn(
        'focus:ring-ring ring-offset-background absolute top-1/2 -translate-y-1/2 cursor-pointer focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none has-[+[data-slot=autocomplete-clear]]:hidden data-disabled:pointer-events-none',
        className
      )}
      {...props}
    >
      <SearchIcon className='size-4 opacity-70' />
    </AutocompletePrimitive.Trigger>
  )
}

const AutocompleteArrow = ({ ...props }: React.ComponentProps<typeof AutocompletePrimitive.Arrow>) => {
  return <AutocompletePrimitive.Arrow data-slot='autocomplete-arrow' {...props} />
}

const AutocompleteSeparator = ({
  className,
  ...props
}: React.ComponentProps<typeof AutocompletePrimitive.Separator>) => {
  return (
    <AutocompletePrimitive.Separator
      data-slot='autocomplete-separator'
      className={cn('bg-border my-1.5 h-px', className)}
      {...props}
    />
  )
}

export {
  Autocomplete,
  AutocompleteValue,
  AutocompleteTrigger,
  AutocompleteInput,
  AutocompleteStatus,
  AutocompletePortal,
  AutocompleteBackdrop,
  AutocompletePositioner,
  AutocompleteContent,
  AutocompleteList,
  AutocompleteCollection,
  AutocompleteRow,
  AutocompleteItem,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteEmpty,
  AutocompleteClear,
  AutocompleteArrow,
  AutocompleteSeparator
}
