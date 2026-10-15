// Breadcrumb primitives used by the supplied workflow-builder canvas template.
import type { ComponentProps } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from './utils';
export function Breadcrumb(props: ComponentProps<'nav'>) { return <nav aria-label='breadcrumb' data-slot='breadcrumb' {...props} />; }
export function BreadcrumbList({ className, ...props }: ComponentProps<'ol'>) { return <ol data-slot='breadcrumb-list' className={cn('text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5', className)} {...props} />; }
export function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>) { return <li data-slot='breadcrumb-item' className={cn('inline-flex items-center gap-1.5', className)} {...props} />; }
export function BreadcrumbPage({ className, ...props }: ComponentProps<'span'>) { return <span data-slot='breadcrumb-page' className={cn('text-foreground font-normal', className)} {...props} />; }
export function BreadcrumbSeparator({ children, className, ...props }: ComponentProps<'li'>) { return <li role='presentation' aria-hidden='true' data-slot='breadcrumb-separator' className={cn('[&>svg]:size-3.5', className)} {...props}>{children ?? <ChevronRight />}</li>; }
