// Direct port of dashboard-shell-06 from the supplied block; presentation classes are retained.
'use client'

import { useDashboardLabels } from './dashboard-shell-labels'
import { type ReactNode, useId, useState } from 'react'

import type { Column, ColumnDef, ColumnFiltersState, PaginationState } from '@tanstack/react-table'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from '@/shared/ui/pagination'
import { Progress } from '@/shared/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

import { usePagination } from '@/shared/template/blocks/dashboard/use-pagination'

import { cn } from '@/shared/ui/utils'
import { UserRoundIcon, ActivityIcon, FileTextIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

export type Item = {
  id: string
  project: string
  projectIcon: ReactNode
  projectIconColor?: string
  owner: string
  ownerImage: string
  ownerFallback: string
  time: string
  averageDurationMs: number | null
  progress: { completed: number; total: number; percentage: number | null; details?: string } | null
  stats: { users: number; runs: number; documents: number }
}

const makeColumns = (t: (key: string, options?: Record<string, unknown>) => string, onProject: (id: string) => void): ColumnDef<Item>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onCheckedChange={value => table.toggleAllRowsSelected(!!value)}
        aria-label={t('selectAll')}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={value => row.toggleSelected(!!value)}
        aria-label={t('selectRow', { name: row.original.project })}
      />
    )
  },
  {
    header: t('project'),
    accessorKey: 'project',
    cell: ({ row }) => (
      <div className='flex items-center gap-4'>
        <Avatar className='size-9 rounded-md after:border-0'>
          <AvatarFallback
            className={cn('bg-primary/10 text-primary rounded-md [&>svg]:size-6', row.original.projectIconColor)}
          >
            {row.original.projectIcon}
          </AvatarFallback>
        </Avatar>
        <div className='flex flex-col gap-1'>
          <button type='button' className='text-left' onClick={() => onProject(row.original.id)}>{row.getValue('project')}</button>
          <div className='flex items-center gap-2'>
            <Avatar size='sm'>
              <AvatarImage src={row.original.ownerImage} alt={row.original.owner} />
              <AvatarFallback>{row.original.ownerFallback}</AvatarFallback>
            </Avatar>
            <span className='text-muted-foreground text-xs'>{row.original.owner}</span>
          </div>
        </div>
      </div>
    )
  },
  {
    header: t('duration'),
    accessorKey: 'averageDurationMs',
    cell: ({ row }) => <span className='text-muted-foreground'>{row.original.time}</span>
  },
  {
    header: t('progress'),
    id: 'progress',
    accessorFn: row => row.progress?.percentage ?? null,
    cell: ({ row }) => (
      <div className='flex items-center justify-center gap-3' title={row.original.progress?.details}>
        <span className='text-muted-foreground'>
          {row.original.progress?.percentage == null ? t('noData') : `${row.original.progress.percentage}%`}
        </span>
        <Progress
          value={row.original.progress?.percentage ?? 0}
          aria-label={t('progress')}
          aria-valuetext={row.original.progress?.details}
          className='w-43 *:data-[slot=progress-track]:h-1.5'
        />
        <span>
          {row.original.progress ? `${row.original.progress.completed}/${row.original.progress.total}` : '—'}
        </span>
      </div>
    )
  },
  {
    header: t('statistics'),
    accessorKey: 'stats',
    cell: ({ row }) => (
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2' title={t('memberStat')}>
          <UserRoundIcon className='size-4' />
          <span>{row.original.stats.users}</span>
        </div>
        <div className='flex items-center gap-2' title={t('runStat')}>
          <ActivityIcon className='size-4' />
          <span>{row.original.stats.runs}</span>
        </div>
        <div className='flex items-center gap-2' title={t('documentStat')}>
          <FileTextIcon className='size-4' />
          <span>{row.original.stats.documents}</span>
        </div>
      </div>
    ),
    meta: {
      filterVariant: 'range'
    }
  }
]

const ProjectDatatable = ({ data, onProject }: { data: Item[]; onProject: (id: string) => void }) => {
  const { t } = useDashboardLabels()
  const columns = makeColumns(t, onProject)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const pageSize = 5

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize
  })

  const table = useReactTable({
    data,
    columns,
    getRowId: row => row.id,
    state: {
      columnFilters,
      pagination
    },
    onColumnFiltersChange: update => {
      // A new search starts at the first page, including when the current page disappears.
      setColumnFilters(update)
      setPagination(previous => ({ ...previous, pageIndex: 0 }))
    },
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

  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: table.getState().pagination.pageIndex + 1,
    totalPages: table.getPageCount(),
    paginationItemsToDisplay: 2
  })

  return (
    <div className='w-full'>
      <div className='border-b'>
        <div className='flex min-h-17 flex-wrap items-center justify-between gap-3 px-6 py-3'>
          <span className='text-base font-medium'>{t('projectTable')}</span>
          <Filter column={table.getColumn('project')!} label={t('search')} />
        </div>
        <Table aria-label={t('projectTable')}>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='h-17 border-t'>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}
                      className='text-muted-foreground first:w-12.5 first:pl-4 last:px-4 last:text-center nth-last-2:text-center'
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? <button type='button' onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}</button> : flexRender(header.column.columnDef.header, header.getContext())}
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
                    <TableCell key={cell.id} className='h-17 first:w-12.5 first:pl-4 last:px-4'>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className='h-24 text-center'>
                  {t('noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className='flex items-center justify-between gap-3 px-6 py-4 max-sm:flex-col md:max-lg:flex-col'>
        <p className='text-muted-foreground text-sm whitespace-nowrap' aria-live='polite'>
          {t('showing', { from: table.getRowCount() ? table.getState().pagination.pageIndex * pageSize + 1 : 0, to: Math.min((table.getState().pagination.pageIndex + 1) * pageSize, table.getRowCount()), total: table.getRowCount() })}
        </p>

        <div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  className='disabled:pointer-events-none disabled:opacity-50'
                  variant='ghost'
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label={t('previous')}
                >
                  <ChevronLeftIcon aria-hidden='true' />
                  {t('previous')}
                </Button>
              </PaginationItem>

              {showLeftEllipsis && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}

              {pages.map(page => {
                const isActive = page === table.getState().pagination.pageIndex + 1

                return (
                  <PaginationItem key={page}>
                    <Button
                      size='icon'
                      className={`${!isActive && 'bg-primary/10 text-primary hover:bg-primary/20 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40'}`}
                      onClick={() => table.setPageIndex(page - 1)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {page}
                    </Button>
                  </PaginationItem>
                )
              })}

              {showRightEllipsis && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}

              <PaginationItem>
                <Button
                  className='disabled:pointer-events-none disabled:opacity-50'
                  variant='ghost'
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label={t('next')}
                >
                  {t('next')}
                  <ChevronRightIcon aria-hidden='true' />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  )
}

export default ProjectDatatable

function Filter({ column, label }: { column: Column<any, unknown>; label: string }) {
  const id = useId()
  const columnFilterValue = column.getFilterValue()

  const columnHeader = typeof column.columnDef.header === 'string' ? column.columnDef.header : ''

  return (
    <div>
      <Label htmlFor={`${id}-input`} className='sr-only'>
        {label}
      </Label>
      <Input
        id={`${id}-input`}
        value={(columnFilterValue ?? '') as string}
        onChange={e => column.setFilterValue(e.target.value)}
        placeholder={label}
        type='text'
      />
    </div>
  )
}
