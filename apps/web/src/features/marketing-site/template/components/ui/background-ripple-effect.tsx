// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'

// React Imports
import { useMemo, useRef, useState } from 'react'

// Util Imports
import { cn } from '@/shared/ui/utils'

const BackgroundRippleEffect = ({
  rows = 8,
  cols = 27,
  cellSize = 56.815
}: {
  rows?: number
  cols?: number
  cellSize?: number
}) => {
  // States
  const [clickedCell, setClickedCell] = useState<{
    row: number
    col: number
  } | null>(null)

  const [rippleKey, setRippleKey] = useState(0)

  // Hooks
  const ref = useRef<any>(null)

  return (
    <div
      ref={ref}
      className={cn(
        'absolute inset-0 h-full w-full object-center',
        '[--cell-border-color:color-mix(in_oklab,var(--accent),black_10%)] [--cell-fill-color:var(--accent)] [--cell-shadow-color:color-mix(in_oklab,var(--accent),black_43%)]',
        'dark:[--cell-border-color:color-mix(in_oklab,var(--accent),white_14%)] dark:[--cell-fill-color:color-mix(in_oklab,var(--accent),black_22%)] dark:[--cell-shadow-color:var(--accent)]'
      )}
    >
      <div className='relative flex h-auto w-auto justify-center overflow-hidden'>
        <div className='pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-hidden' />
        <DivGrid
          key={`base-${rippleKey}`}
          className='mask-radial-from-20% mask-radial-at-top opacity-600'
          rows={rows}
          cols={cols}
          cellSize={cellSize}
          borderColor='var(--cell-border-color)'
          fillColor='var(--cell-fill-color)'
          clickedCell={clickedCell}
          onCellClick={(row, col) => {
            setClickedCell({ row, col })
            setRippleKey(k => k + 1)
          }}
          interactive
        />
      </div>
    </div>
  )
}

type DivGridProps = {
  className?: string
  rows: number
  cols: number
  cellSize: number // in pixels
  borderColor: string
  fillColor: string
  clickedCell: { row: number; col: number } | null
  onCellClick?: (row: number, col: number) => void
  interactive?: boolean
}

type CellStyle = React.CSSProperties & {
  ['--delay']?: string
  ['--duration']?: string
}

const DivGrid = ({
  className,
  rows = 7,
  cols = 30,
  cellSize = 56.815,
  borderColor = '#3f3f46',
  fillColor = 'rgba(14,165,233,0.3)',
  clickedCell = null,
  onCellClick = () => {},
  interactive = true
}: DivGridProps) => {
  const cells = useMemo(() => Array.from({ length: rows * cols }, (_, idx) => idx), [rows, cols])

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
    width: cols * cellSize,
    height: rows * cellSize,
    marginInline: 'auto'
  }

  return (
    <div className={cn('relative z-[3]', className)} style={gridStyle}>
      {cells.map(idx => {
        const rowIdx = Math.floor(idx / cols)
        const colIdx = idx % cols

        const distance = clickedCell ? Math.hypot(clickedCell.row - rowIdx, clickedCell.col - colIdx) : 0

        const delay = clickedCell ? Math.max(0, distance * 55) : 0 // ms
        const duration = 200 + distance * 80 // ms

        const style: CellStyle = clickedCell
          ? {
              '--delay': `${delay}ms`,
              '--duration': `${duration}ms`
            }
          : {}

        return (
          <div
            key={idx}
            className={cn(
              'cell relative border-[0.5px] opacity-40 transition-all duration-150 will-change-transform hover:opacity-60 hover:brightness-95 dark:shadow-[0px_0px_40px_1px_var(--cell-shadow-color)_inset] dark:hover:opacity-90',
              clickedCell && 'animate-cell-ripple [animation-fill-mode:none]',
              !interactive && 'pointer-events-none'
            )}
            style={{
              backgroundColor: fillColor,
              borderColor: borderColor,
              ...style
            }}
            onClick={interactive ? () => onCellClick?.(rowIdx, colIdx) : undefined}
          />
        )
      })}
    </div>
  )
}

export { BackgroundRippleEffect }
