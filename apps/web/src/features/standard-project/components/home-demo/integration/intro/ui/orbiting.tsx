// User-supplied bento-grid-23 source; original visuals, animation parameters and copy preserved.
import * as React from 'react'

import { cn } from '@/lib/utils'

export interface OrbitingProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  children?: React.ReactNode
  reverse?: boolean
  duration?: number
  delay?: number
  radius?: number
  dashed?: boolean
  dashedGap?: number
  path?: boolean
  speed?: number
  strokeColor?: string
  strokeWidth?: number
  startingAngle?: number
}

export function Orbiting({
  className,
  children,
  reverse,
  duration = 20,
  dashed = false,
  dashedGap = 4,
  radius = 160,
  path = true,
  speed = 1,
  strokeColor = 'var(--border)',
  strokeWidth = 2,
  startingAngle = 0,
  ...props
}: OrbitingProps) {
  const calculatedDuration = duration / speed

  return (
    <>
      {path && (
        <svg
          xmlns='http://www.w3.org/2000/svg'
          version='1.1'
          className='pointer-events-none absolute inset-0 size-full'
        >
          <circle
            cx='50%'
            cy='50%'
            r={radius}
            fill='none'
            strokeDasharray={dashed ? `${dashedGap}` : ''}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        </svg>
      )}
      {React.Children.map(children, (child, index) => {
        const angle = (360 / React.Children.count(children)) * index + startingAngle

        return (
          <div
            key={index}
            style={
              {
                '--duration': calculatedDuration,
                '--radius': radius,
                '--angle': angle
              } as React.CSSProperties
            }
            className={cn(
              `animate-orbit absolute flex transform-gpu items-center justify-center rounded-full`,
              { '[animation-direction:reverse]': reverse },
              className
            )}
            {...props}
          >
            {child}
          </div>
        )
      })}
    </>
  )
}
