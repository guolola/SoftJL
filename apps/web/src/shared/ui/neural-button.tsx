// Direct shadcn-studio button-54 source; uses the app's theme colors, Button contract, and reduced-motion preference.
'use client'

import * as React from 'react'
import { Button, buttonVariants } from '@/shared/ui/button'
import { BorderBeam } from '@/shared/ui/border-beam'
import { cn } from '@/shared/ui/utils'

interface NeuralButtonProps extends Omit<React.ComponentPropsWithoutRef<typeof Button>, 'children'> {
  children?: React.ReactNode
  asChild?: boolean
  reducedMotion?: boolean
  beamStyle?: React.CSSProperties
}

const NeuralButton = React.forwardRef<HTMLButtonElement, NeuralButtonProps>(function NeuralButton(
  { children, asChild = false, size, className, reducedMotion = false, beamStyle, ...rest }, ref,
) {
  const neuralStyles = cn(
    'relative z-1 overflow-hidden rounded-xl bg-primary! text-primary-foreground! ring-2 ring-primary/60! transition-transform duration-200 ease-in-out hover:scale-105 active:scale-95',
    size === 'lg' && 'text-base has-[>svg]:px-6',
    reducedMotion && 'transform-none! transition-none!',
    className,
  )
  const backgroundDecorations = <>
    <span className='pointer-events-none absolute inset-0 -z-1 bg-linear-to-r from-neutral-900/20 to-primary-foreground/20' aria-hidden='true'>
      <span className='absolute inset-px rounded-[calc(var(--radius-xl)-1px)] bg-primary' />
    </span>
    <svg width='98' height='40' viewBox='0 0 98 40' fill='none' xmlns='http://www.w3.org/2000/svg'
      className='pointer-events-none absolute inset-x-0 bottom-px h-12 w-full! blur-[6px]' aria-hidden='true'>
      <g filter='url(#filter0_f_28138_7760)'>
        <path d='M99 37.5708C60.3329 38.179 38.3917 38.106 -1 37.5708C-1 37.5708 2.65293 34.4541 7.59896 29.7774C12.545 25.1008 81.7895 24.0613 90.3618 30.737C98.9341 37.4128 99 37.5708 99 37.5708Z' fill='var(--primary-foreground)' />
      </g>
      <defs><filter id='filter0_f_28138_7760' x='-28.9' y='-1.9' width='155.8' height='67.8' filterUnits='userSpaceOnUse' colorInterpolationFilters='sRGB'>
        <feFlood floodOpacity='0' result='BackgroundImageFix' />
        <feBlend mode='normal' in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
        <feGaussianBlur stdDeviation='13.95' result='effect1_foregroundBlur_28138_7760' />
      </filter></defs>
    </svg>
  </>
  const overlayDecorations = <>
    <span aria-hidden='true' className='pointer-events-none absolute inset-0 z-1 rounded-xl [box-shadow:0px_1px_1.6px_0px_color-mix(in_oklab,var(--primary-foreground)_68%,transparent)_inset]' />
    <BorderBeam colorFrom='var(--primary-foreground)' colorTo='var(--primary-foreground)' size={35} reducedMotion={reducedMotion} style={beamStyle} />
  </>
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string; children?: React.ReactNode }>
    return React.cloneElement(child, {
      className: cn(buttonVariants({ variant: 'default', size }), neuralStyles, child.props.className),
      ...rest,
      children: <>{backgroundDecorations}{child.props.children}{overlayDecorations}</>,
    })
  }
  return <Button ref={ref} size={size} className={neuralStyles} {...rest}>
    {backgroundDecorations}{children}{overlayDecorations}
  </Button>
})

export { NeuralButton, type NeuralButtonProps }
