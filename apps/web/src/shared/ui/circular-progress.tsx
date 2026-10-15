// Renders the supplied circular progress component with round or square stroke caps.
'use client'

import * as React from 'react'

import { cn } from '@/shared/ui/utils'

interface CircularProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  renderLabel?: (progress: number) => React.ReactNode
  size?: number
  strokeWidth?: number
  circleStrokeWidth?: number
  progressStrokeWidth?: number
  shape?: 'square' | 'round'
  progressClassName?: string
  progressBgClassName?: string
  labelClassName?: string
  showLabel?: boolean
  variant?: 'default' | 'animated'
  gaugePrimaryColor?: string
  gaugeSecondaryColor?: string
  trackDashArray?: string | number
}

const CircularProgress = ({
  value,
  renderLabel,
  className,
  progressClassName,
  progressBgClassName,
  labelClassName,
  showLabel,
  shape = 'round',
  size = 100,
  strokeWidth,
  circleStrokeWidth = 10,
  progressStrokeWidth = 10,
  variant = 'default',
  gaugePrimaryColor = 'currentColor',
  gaugeSecondaryColor = 'currentColor',
  trackDashArray,
  ...props
}: CircularProgressProps) => {
  const effectiveCircleWidth = strokeWidth ?? circleStrokeWidth
  const effectiveProgressWidth = strokeWidth ?? progressStrokeWidth
  const maxStroke = Math.max(effectiveCircleWidth, effectiveProgressWidth)

  const radius = variant === 'animated' ? 45 : (size - maxStroke) / 2
  const currentPercent = Math.min(Math.max(value, 0), 100)

  if (variant === 'animated') {
    const gapPercent = 5
    const dashFactor = (2 * Math.PI * 45) / 100
    const circumference = 2 * Math.PI * 45

    const primaryDash = `${currentPercent * dashFactor} ${circumference}`
    const primaryRotate = -90 + gapPercent * 0 * 3.6

    const secondaryDash = trackDashArray
      ? trackDashArray
      : `${Math.max(0, 90 - currentPercent) * dashFactor} ${circumference}`

    const secondaryRotate = 360 - 90 - gapPercent * 3.6

    return (
      <div
        className={cn('relative flex shrink-0 items-center justify-center', className)}
        style={{ width: size, height: size }}
        {...props}
      >
        <svg viewBox='0 0 100 100' className='size-full overflow-visible'>
          {/* Dynamic Background Track */}
          <circle
            cx='50'
            cy='50'
            r={45}
            fill='none'
            stroke={gaugeSecondaryColor}
            strokeWidth={effectiveCircleWidth}
            strokeDasharray={secondaryDash}
            strokeLinecap={trackDashArray ? 'butt' : shape}
            className={cn('text-primary/10 transition-all duration-1000 ease-in-out', progressBgClassName)}
            style={{
              transform: `rotate(${secondaryRotate}deg) scaleY(-1)`,
              transformOrigin: '50px 50px'
            }}
          />
          {/* Dynamic Progress Bar */}
          <circle
            cx='50'
            cy='50'
            r={45}
            fill='none'
            stroke={gaugePrimaryColor}
            strokeWidth={effectiveProgressWidth}
            strokeDasharray={primaryDash}
            strokeLinecap={shape}
            className={cn('transition-all duration-1000 ease-in-out', progressClassName)}
            style={{
              transform: `rotate(${primaryRotate}deg)`,
              transformOrigin: '50px 50px'
            }}
          />
        </svg>
        {showLabel && (
          <div className={cn('absolute inset-0 flex items-center justify-center text-lg font-medium', labelClassName)}>
            {renderLabel ? renderLabel(value) : `${value}%`}
          </div>
        )}
      </div>
    )
  }

  const circumference = 2 * Math.PI * radius
  const offset = circumference - (currentPercent / 100) * circumference

  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className='size-full -rotate-90 overflow-visible'>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          stroke={gaugeSecondaryColor !== 'currentColor' ? gaugeSecondaryColor : 'currentColor'}
          strokeWidth={effectiveCircleWidth}
          strokeDasharray={trackDashArray}
          strokeLinecap={shape}
          className={cn('text-primary/20', progressBgClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          stroke={gaugePrimaryColor !== 'currentColor' ? gaugePrimaryColor : 'currentColor'}
          strokeWidth={effectiveProgressWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap={shape}
          className={cn('transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]', progressClassName)}
        />
      </svg>
      {showLabel && (
        <div className={cn('absolute inset-0 flex items-center justify-center text-base font-medium', labelClassName)}>
          {renderLabel ? renderLabel(value) : `${value}%`}
        </div>
      )}
    </div>
  )
}

export { CircularProgress }
