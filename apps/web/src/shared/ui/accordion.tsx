// Provides accessible accordion primitives for business FAQ and usage sections.
'use client'

import type { ComponentProps } from 'react'
import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion'
import { ChevronDown } from 'lucide-react'
import { cn } from './utils'

function Accordion({ className, ...props }: ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot='accordion' className={cn('flex w-full flex-col', className)} {...props} />
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return <AccordionPrimitive.Item data-slot='accordion-item' className={cn('not-last:border-b', className)} {...props} />
}

function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className='flex'>
      <AccordionPrimitive.Trigger
        data-slot='accordion-trigger'
        className={cn('group/accordion-trigger flex flex-1 items-center justify-between gap-4 rounded-md py-4 text-left text-sm font-medium outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50', className)}
        {...props}
      >
        {children}
        <ChevronDown aria-hidden='true' className='size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open/accordion-trigger:rotate-180 motion-reduce:transition-none' />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  // The template keyframes use this variable; bridge Base UI's measured panel height.
  return (
    <AccordionPrimitive.Panel data-slot='accordion-content' className='[--radix-accordion-content-height:var(--accordion-panel-height)] data-open:animate-accordion-down data-closed:animate-accordion-up overflow-hidden text-sm motion-reduce:animate-none' {...props}>
      <div className={cn('pb-4', className)}>{children}</div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
