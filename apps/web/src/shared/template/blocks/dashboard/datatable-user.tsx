// Presents the localized workbench table; RowActions remain presentational here.
'use client'

import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Column, ColumnDef, ColumnFiltersState, PaginationState, RowData } from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getPaginationRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'

import {
  UserRoundIcon,
  PencilLineIcon,
  BrushIcon,
  PencilRulerIcon,
  CrownIcon,
  Trash2Icon,
  EyeIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon
} from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown-menu'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

import { DashboardTablePagination } from './table-pagination'
import { i18n as appI18n } from '@/shared/i18n'

import { cn } from '@/shared/ui/utils'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    filterVariant?: 'text' | 'range' | 'select'
  }
}

export type Item = {
  id: string
  avatar: string
  fallback: string
  user: string
  email: string
  role: 'admin' | 'author' | 'editor' | 'maintainer' | 'subscriber'
  plan: 'basic' | 'company' | 'enterprise' | 'team'
  billing: 'auto-debit' | 'manual-cash' | 'manual-paypal'
  status: 'active' | 'inactive' | 'pending'
}

type TableTranslation = (key: string, options?: Record<string, string | number>) => string

const createColumns = (t: TableTranslation): ColumnDef<Item>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onCheckedChange={value => table.toggleAllRowsSelected(!!value)}
        aria-label={t('dashboard.table.selectAll')}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={value => row.toggleSelected(!!value)}
        aria-label={t('dashboard.table.selectRow')}
      />
    ),
    size: 50
  },
  {
    header: t('dashboard.table.user'),
    accessorKey: 'user',
    cell: ({ row }) => (
      <div className='flex items-center gap-2'>
        <Avatar className='size-9'>
          {row.original.avatar ? <AvatarImage src={row.original.avatar} alt={row.getValue('user')} /> : null}
          <AvatarFallback className='text-xs'>{row.original.fallback}</AvatarFallback>
        </Avatar>
        <div className='flex flex-col'>
          <span className='font-medium'>{row.getValue('user')}</span>
          <span className='text-muted-foreground'>{row.original.email}</span>
        </div>
      </div>
    ),
    size: 360
  },
  {
    header: t('dashboard.table.role'),
    accessorKey: 'role',
    cell: ({ row }) => {
      const role = row.getValue('role') as string

      const roles = {
        admin: <UserRoundIcon className='size-4 text-green-600 dark:text-green-400' />,
        author: <PencilLineIcon className='text-chart-1 size-4' />,
        editor: <BrushIcon className='text-chart-2 size-4' />,
        maintainer: <PencilRulerIcon className='text-chart-3 size-4' />,
        subscriber: <CrownIcon className='text-chart-5 size-4' />
      }[role]

      return (
        <div className='flex items-center gap-2'>
          {roles}
          <span>{t(`dashboard.table.roles.${role}`)}</span>
        </div>
      )
    }
  },
  {
    header: t('dashboard.table.plan'),
    accessorKey: 'plan',
    cell: ({ row }) => <span className='text-muted-foreground'>{t(`dashboard.table.plans.${row.getValue('plan')}`)}</span>
  },
  {
    header: t('dashboard.table.billing'),
    accessorKey: 'billing',
    cell: ({ row }) => (
      <span className='text-muted-foreground'>
        {t(`dashboard.table.billingMethods.${row.getValue('billing')}`)}
      </span>
    )
  },
  {
    header: t('dashboard.table.status'),
    accessorKey: 'status',
    filterFn: 'equalsString',
    cell: ({ row }) => {
      const status = row.getValue('status') as string

      const styles = {
        active:
          'bg-green-600/10 text-green-600 focus-visible:ring-green-600/20 dark:bg-green-400/10 dark:text-green-400 dark:focus-visible:ring-green-400/40 [a&]:hover:bg-green-600/5 dark:[a&]:hover:bg-green-400/5',
        inactive:
          'bg-destructive/10 [a&]:hover:bg-destructive/5 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive',
        pending:
          'bg-amber-600/10 text-amber-600 focus-visible:ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-400 dark:focus-visible:ring-amber-400/40 [a&]:hover:bg-amber-600/5 dark:[a&]:hover:bg-amber-400/5'
      }[status]

      return (
        <Badge className={cn('h-auto rounded-sm border-none capitalize focus-visible:outline-none', styles)}>
          {t(`dashboard.table.statuses.${status}`)}
        </Badge>
      )
    }
  },
  {
    id: 'actions',
    header: () => t('dashboard.table.actions'),
    cell: () => (
      <div className='flex items-center gap-1'>
        <Tooltip>
          <TooltipTrigger render={<Button variant='ghost' size='icon' aria-label={t('dashboard.table.deleteItem')} />}>
            <Trash2Icon className='size-4.5' />
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('dashboard.table.delete')}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant='ghost' size='icon' aria-label={t('dashboard.table.viewItem')} />}>
            <EyeIcon className='size-4.5' />
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('dashboard.table.view')}</p>
          </TooltipContent>
        </Tooltip>
        <RowActions t={t} />
      </div>
    ),
    enableHiding: false
  }
]

const UserDatatable = ({ data }: { data: Item[] }) => {
  const { t: translate, i18n: activeI18n } = useTranslation()
  const hasProviderResources = activeI18n.exists?.('dashboard.table.user') ?? false
  const t = useMemo<TableTranslation>(
    () => (key, options) => String(hasProviderResources ? translate(key, options) : appI18n.t(key, options)),
    [activeI18n.language, hasProviderResources, translate]
  )
  const columns = useMemo(() => createColumns(t), [t])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const pageSize = 5

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize
  })

  const table = useReactTable({
    data,
    columns,
    state: {
      columnFilters,
      pagination
    },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    enableSortingRemoval: false,
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination
  })

  return (
    <div className='w-full'>
      <div className='border-b'>
        <div className='flex flex-col gap-4 p-6'>
          <div className='grid grid-cols-1 gap-6 max-md:*:last:col-span-full sm:grid-cols-2 md:grid-cols-3'>
            <Filter column={table.getColumn('role')!} t={t} />
            <Filter column={table.getColumn('plan')!} t={t} />
            <Filter column={table.getColumn('status')!} t={t} />
          </div>
        </div>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='h-14 border-t'>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: `${header.getSize()}px` }}
                      className='text-muted-foreground first:pl-4 last:px-4 last:text-center'
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <div
                          className={cn(
                            header.column.getCanSort() &&
                              'flex h-full cursor-pointer items-center justify-between gap-2 select-none'
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                          onKeyDown={e => {
                            if (header.column.getCanSort() && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault()
                              header.column.getToggleSortingHandler()?.(e)
                            }
                          }}
                          tabIndex={header.column.getCanSort() ? 0 : undefined}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: <ChevronUpIcon className='size-4 shrink-0 opacity-60' aria-hidden='true' />,
                            desc: <ChevronDownIcon className='size-4 shrink-0 opacity-60' aria-hidden='true' />
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className='h-14 first:w-12.5 first:pl-4 last:w-29 last:px-4'>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className='h-24 text-center'>
                  {t('dashboard.table.noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DashboardTablePagination
        total={table.getRowCount()}
        page={table.getState().pagination.pageIndex + 1}
        pageSize={table.getState().pagination.pageSize}
        onPageChange={(page) => table.setPageIndex(page - 1)}
        onPageSizeChange={(pageSize) => setPagination({ pageIndex: 0, pageSize })}
        t={t}
      />
    </div>
  )
}

export default UserDatatable

function Filter({ column, t }: { column: Column<any, unknown>; t: TableTranslation }) {
  const id = useId()
  const columnFilterValue = column.getFilterValue()
  const { filterVariant } = column.columnDef.meta ?? {}

  const columnHeader = typeof column.columnDef.header === 'string' ? column.columnDef.header : ''
  const optionGroup = column.id === 'role' ? 'roles' : column.id === 'plan' ? 'plans' : 'statuses'

  const facetedUniqueValues = column.getFacetedUniqueValues()

  const sortedUniqueValues = useMemo(() => {
    if (filterVariant === 'range') return []

    const values = Array.from(facetedUniqueValues.keys())

    const flattenedValues = values.reduce((acc: string[], curr) => {
      if (Array.isArray(curr)) {
        return [...acc, ...curr]
      }

      return [...acc, curr]
    }, [])

    return Array.from(new Set(flattenedValues)).sort()
  }, [facetedUniqueValues, filterVariant])

  return (
    <div className='flex w-full flex-col gap-2'>
      <Label htmlFor={`${id}-select`}>{t('dashboard.table.filter', { field: columnHeader })}</Label>
      <Select
        items={[
          { label: t('dashboard.table.all'), value: 'all' },
          ...sortedUniqueValues.map(value => ({
            label: t(`dashboard.table.${optionGroup}.${value}`),
            value: String(value)
          }))
        ]}
        value={columnFilterValue?.toString() ?? 'all'}
        onValueChange={(value: string | null) => {
          column.setFilterValue(value === 'all' || value === null ? undefined : value)
        }}
      >
        <SelectTrigger id={`${id}-select`} className='w-full capitalize'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value='all'>{t('dashboard.table.all')}</SelectItem>
            {sortedUniqueValues.map(value => (
              <SelectItem key={String(value)} value={String(value)} className='capitalize'>
                {t(`dashboard.table.${optionGroup}.${value}`)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

function RowActions({ t }: { t: TableTranslation }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size='icon' variant='ghost' aria-label={t('dashboard.table.editItem')} />}>
        <EllipsisVerticalIcon className='size-4.5' aria-hidden='true' />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <span>{t('dashboard.table.edit')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <span>{t('dashboard.table.duplicate')}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
