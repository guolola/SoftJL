// Business-authored page scaffolding composed from AdminCN/shadcn-studio primitives.
// Hosts the reusable page container, page header, stat grid/card, table toolbar and
// pagination, and empty state so every business surface shares one AdminCN composition.
import type { LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { ChevronDownIcon, ChevronUpIcon, SearchIcon } from 'lucide-react'

import { Avatar, AvatarFallback } from '@/shared/ui/avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/shared/ui/input-group'
import { Label } from '@/shared/ui/label'
import { SelectControl } from '@/shared/ui/select'
import { StudioPagination } from '@/shared/ui/studio-data-table'
import { cn } from '@/shared/ui/utils'

export function PageContainer({
  children,
  className,
  flush = false
}: {
  children: ReactNode
  className?: string
  flush?: boolean
}) {
  return (
    <div
      className={cn(
        flush
          ? 'relative min-h-0 flex-1'
          : 'mx-auto min-h-full w-full max-w-360 flex-1 px-4 py-6 sm:px-6',
        className
      )}
    >
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  notice,
  titleAccessory,
  description,
  actions,
  size = 'default',
  className
}: {
  title: ReactNode
  notice?: ReactNode
  titleAccessory?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  size?: 'default' | 'compact'
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4', className)}>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <h1
            className={cn(
              'font-display font-bold tracking-normal',
              size === 'compact' ? 'text-xl leading-7' : 'text-3xl leading-9'
            )}
          >
            {title}
          </h1>
          {notice}
          {titleAccessory}
        </div>
        {description ? <p className='text-muted-foreground mt-2 max-w-3xl text-sm leading-6'>{description}</p> : null}
      </div>
      {actions ? (
        <div className='flex w-full min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 sm:w-auto sm:shrink-0 sm:flex-wrap sm:overflow-visible sm:pb-0'>
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-6 xl:grid-cols-4', className)}>
      {children}
    </div>
  )
}

export function StatCard({
  icon,
  value,
  label,
  trend,
  change,
  badge,
  className,
  iconClassName
}: {
  icon: ReactNode
  value: ReactNode
  label: ReactNode
  trend?: 'up' | 'down'
  change?: string
  badge?: ReactNode
  className?: string
  iconClassName?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className='flex items-center justify-between'>
        <Avatar className='size-9.5 rounded-sm after:border-0'>
          <AvatarFallback
            className={cn('bg-primary/10 text-primary size-9.5 shrink-0 rounded-sm [&>svg]:size-4.75', iconClassName)}
          >
            {icon}
          </AvatarFallback>
        </Avatar>
        {trend && change ? (
          <p className='flex items-center gap-1 text-base'>
            {change}
            {trend === 'up' ? <ChevronUpIcon className='size-4' /> : <ChevronDownIcon className='size-4' />}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className='flex flex-1 flex-col justify-between gap-4'>
        <p className='flex flex-col gap-1'>
          <span className='text-lg font-semibold'>{value}</span>
          <span className='text-muted-foreground text-sm'>{label}</span>
        </p>
        {badge ? <Badge className='bg-primary/10 text-primary w-fit'>{badge}</Badge> : null}
      </CardContent>
    </Card>
  )
}

export function TableToolbar({
  leading,
  search,
  onSearchChange,
  searchPlaceholder,
  searchLabel,
  filters,
  actions,
  rowsPerPage,
  onRowsPerPageChange,
  rowsPerPageOptions = ['10', '25', '50'],
  className
}: {
  leading?: ReactNode
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  searchLabel?: string
  filters?: ReactNode
  actions?: ReactNode
  rowsPerPage?: number
  onRowsPerPageChange?: (count: number) => void
  rowsPerPageOptions?: string[]
  className?: string
}) {
  const searchId = useId()

  return (
    <div className={cn('flex min-w-0 items-center justify-between gap-2 overflow-hidden border-b bg-muted/20 p-3', className)}>
      <div className='flex min-w-0 flex-1 flex-nowrap items-center gap-2'>
        {leading}
        {onSearchChange ? (
          <InputGroup className='min-w-0 flex-1 sm:max-w-2xs'>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <Label className='sr-only' htmlFor={searchId}>
              {searchLabel ?? 'Search'}
            </Label>
            <InputGroupInput
              id={searchId}
              value={search ?? ''}
              placeholder={searchPlaceholder}
              onChange={event => onSearchChange(event.target.value)}
            />
          </InputGroup>
        ) : null}
        {filters}
      </div>
      <div className='flex shrink-0 flex-nowrap items-center gap-2'>
        {onRowsPerPageChange ? (
          <SelectControl
            aria-label='每页条数'
            className='w-14 sm:w-fit'
            value={String(rowsPerPage ?? 10)}
            onValueChange={value => onRowsPerPageChange(Number(value))}
            options={rowsPerPageOptions.map(option => ({ value: option, label: option }))}
          />
        ) : null}
        {actions}
      </div>
    </div>
  )
}

export function TablePagination({
  total,
  page,
  pageCount,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  itemLabel = 'items',
  className
}: {
  total: number
  page: number
  pageCount: number
  pageSize?: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  itemLabel?: string
  className?: string
}) {
  return (
    <StudioPagination
      total={total}
      page={page}
      pageCount={pageCount}
      pageSize={pageSize}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      pageSizeOptions={pageSizeOptions}
      itemLabel={itemLabel}
      className={className}
    />
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: {
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('w-full max-w-lg', className)}>
      <CardContent>
        <div className='rounded-md border border-dashed p-6 text-center'>
          <Icon className='text-muted-foreground mx-auto size-12' />
          <h2 className='mt-2 text-sm font-medium'>{title}</h2>
          {description ? <p className='text-muted-foreground mt-1 text-sm'>{description}</p> : null}
          {action ? <div className='mt-4 flex justify-center'>{action}</div> : null}
        </div>
      </CardContent>
    </Card>
  )
}
