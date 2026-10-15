// Reusable Studio Data Table 9 composition and shared pagination controls.
'use client'

import * as React from 'react'
import {
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, SearchIcon } from 'lucide-react'

import { Button } from '@/shared/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/shared/ui/input-group'
import { Label } from '@/shared/ui/label'
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from '@/shared/ui/pagination'
import { SelectControl } from '@/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { cn } from '@/shared/ui/utils'

function pageWindow(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1])
  const sorted = Array.from(pages).filter(value => value >= 1 && value <= pageCount).sort((a, b) => a - b)
  const withGaps: Array<number | 'gap'> = []
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) withGaps.push('gap')
    withGaps.push(value)
  })
  return withGaps
}

function StudioPageSizeSelect({
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  className
}: {
  pageSize: number
  pageSizeOptions: number[]
  onPageSizeChange: (pageSize: number) => void
  className?: string
}) {
  return (
    <label className={cn('text-muted-foreground flex shrink-0 items-center gap-2 text-sm', className)}>
      <span>每页</span>
      <SelectControl
        aria-label='每页条数'
        className='w-20'
        value={String(pageSize)}
        onValueChange={value => onPageSizeChange(Number(value))}
        options={pageSizeOptions.map(value => ({ value: String(value), label: String(value) }))}
      />
    </label>
  )
}

export function StudioPagination({
  total,
  page,
  pageCount,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  itemLabel = '条记录',
  showPageSize = true,
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
  showPageSize?: boolean
  className?: string
}) {
  const safePageCount = Math.max(1, pageCount)
  const safePage = Math.min(Math.max(1, page), safePageCount)
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = Math.min(total, safePage * pageSize)

  return (
    <div className={cn('flex w-full flex-wrap items-center justify-between gap-4 px-3 py-3 max-sm:justify-center', className)}>
      {showPageSize && onPageSizeChange ? (
        <StudioPageSizeSelect
          pageSize={pageSize}
          pageSizeOptions={pageSizeOptions}
          onPageSizeChange={onPageSizeChange}
        />
      ) : null}
      <p
        aria-live='polite'
        aria-label={`${from}-${to} / ${total}`}
        className='text-muted-foreground grow text-sm max-sm:order-3 max-sm:w-full max-sm:text-center'
      >
        显示 <span className='text-foreground'>{from}</span>–<span className='text-foreground'>{to}</span>，共{' '}
        <span className='text-foreground'>{total}</span> {itemLabel}
      </p>
      <Pagination className='mx-0 w-fit justify-end'>
        <PaginationContent>
          <PaginationItem>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='rounded-full'
              aria-label='上一页'
              disabled={safePage <= 1}
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
            >
              <ChevronLeftIcon />
            </Button>
          </PaginationItem>
          {pageWindow(safePage, safePageCount).map((entry, index) =>
            entry === 'gap' ? (
              <PaginationItem key={`gap-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={entry}>
                <Button
                  type='button'
                  variant={entry === safePage ? 'outline' : 'ghost'}
                  size='icon'
                  className='rounded-full'
                  aria-current={entry === safePage ? 'page' : undefined}
                  aria-label={`第 ${entry} 页`}
                  onClick={() => onPageChange(entry)}
                >
                  {entry}
                </Button>
              </PaginationItem>
            )
          )}
          <PaginationItem>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='rounded-full'
              aria-label='下一页'
              disabled={safePage >= safePageCount}
              onClick={() => onPageChange(Math.min(safePageCount, safePage + 1))}
            >
              <ChevronRightIcon />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}

export type StudioDataTableSearch = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
}

export type StudioDataTableProps<TData, TValue = unknown> = {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  getRowId?: (row: TData, index: number) => string
  emptyState?: React.ReactNode
  pageSizeOptions?: number[]
  initialPageSize?: number
  pagination?: PaginationState
  onPaginationChange?: OnChangeFn<PaginationState>
  pageCount?: number
  totalRows?: number
  manualPagination?: boolean
  enableRowSelection?: boolean
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  search?: StudioDataTableSearch
  toolbarLeading?: React.ReactNode
  filters?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  tableClassName?: string
  footerLabel?: string
}

export function StudioDataTable<TData, TValue = unknown>({
  columns,
  data,
  getRowId,
  emptyState = '暂无数据',
  pageSizeOptions = [10, 25, 50],
  initialPageSize = 10,
  pagination: controlledPagination,
  onPaginationChange,
  pageCount,
  totalRows,
  manualPagination = false,
  enableRowSelection = false,
  rowSelection: controlledRowSelection,
  onRowSelectionChange,
  search,
  toolbarLeading,
  filters,
  actions,
  className,
  tableClassName,
  footerLabel = '条记录'
}: StudioDataTableProps<TData, TValue>) {
  const searchId = React.useId()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [internalPagination, setInternalPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize
  })
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({})
  const pagination = controlledPagination ?? internalPagination
  const rowSelection = controlledRowSelection ?? internalRowSelection

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
    manualPagination,
    pageCount,
    enableRowSelection,
    onSortingChange: setSorting,
    onPaginationChange: onPaginationChange ?? setInternalPagination,
    onRowSelectionChange: onRowSelectionChange ?? setInternalRowSelection,
    state: { sorting, pagination, rowSelection }
  })

  const total = totalRows ?? data.length
  const totalPages = Math.max(1, pageCount ?? table.getPageCount())
  const currentPage = Math.min(totalPages, pagination.pageIndex + 1)

  React.useEffect(() => {
    if (pagination.pageIndex >= totalPages) table.setPageIndex(totalPages - 1)
  }, [pagination.pageIndex, table, totalPages])

  return (
    <div
      data-slot='studio-data-table'
      className={cn('w-full min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs', className)}
    >
      <div className='flex min-w-0 flex-wrap items-center gap-3 border-b bg-muted/20 p-3 sm:justify-between'>
        {toolbarLeading ? <div className='w-full shrink-0 sm:w-auto'>{toolbarLeading}</div> : null}
        <div data-testid='studio-data-table-filters' className='flex min-w-0 flex-1 flex-nowrap items-center gap-2'>
          {search ? (
            <InputGroup className='min-w-0 flex-1 sm:max-w-2xs'>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <Label className='sr-only' htmlFor={searchId}>
                {search.ariaLabel ?? search.placeholder ?? 'Search'}
              </Label>
              <InputGroupInput
                id={searchId}
                value={search.value}
                placeholder={search.placeholder}
                onChange={event => search.onChange(event.target.value)}
              />
            </InputGroup>
          ) : null}
          {filters ? <div className='flex min-w-0 flex-1 items-center'>{filters}</div> : null}
        </div>
        <div data-testid='studio-data-table-page-controls' className='flex shrink-0 flex-nowrap items-center gap-2'>
          <StudioPageSizeSelect
            pageSize={pagination.pageSize}
            pageSizeOptions={pageSizeOptions}
            onPageSizeChange={value => table.setPageSize(value)}
          />
          {actions}
        </div>
      </div>

      <Table className={tableClassName}>
        <TableHeader className='bg-muted/35'>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id} className='hover:bg-transparent'>
              {headerGroup.headers.map(header => (
                <TableHead
                  key={header.id}
                  style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}
                  className='h-11 px-4'
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type='button'
                      className='focus-visible:ring-ring flex h-full w-full cursor-pointer items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2'
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <ChevronUpIcon className='size-4 shrink-0 opacity-60' aria-hidden='true' />,
                        desc: <ChevronDownIcon className='size-4 shrink-0 opacity-60' aria-hidden='true' />
                      }[header.column.getIsSorted() as string] ?? null}
                    </button>
                  ) : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? table.getRowModel().rows.map(row => (
            <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
              {row.getVisibleCells().map(cell => (
                <TableCell key={cell.id} className='px-4 py-3'>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={columns.length} className='h-28 text-center text-muted-foreground'>
                {emptyState}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <StudioPagination
        total={total}
        page={currentPage}
        pageCount={totalPages}
        pageSize={pagination.pageSize}
        onPageChange={page => table.setPageIndex(page - 1)}
        onPageSizeChange={value => table.setPageSize(value)}
        pageSizeOptions={pageSizeOptions}
        itemLabel={footerLabel}
        showPageSize={false}
        className='border-t'
      />
    </div>
  )
}
