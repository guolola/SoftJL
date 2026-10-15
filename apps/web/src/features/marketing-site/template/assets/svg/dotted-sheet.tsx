// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
import type { SVGAttributes } from 'react'

const DottedSheet = (props: SVGAttributes<SVGElement>) => {
  return (
    <svg xmlns='http://www.w3.org/2000/svg' width='2048' height='550' viewBox='0 0 2048 550' {...props}>
      <defs>
        <pattern id='diamondGrid' width='26' height='26' patternUnits='userSpaceOnUse'>
          <rect x='12' y='12' width='5' height='5' fill='var(--primary)' transform='rotate(45 13.6 13.6)' />
        </pattern>

        <radialGradient id='outerFade' cx='50%' cy='50%' r='62%'>
          <stop offset='0%' stopColor='white' stopOpacity='1' />
          <stop offset='55%' stopColor='white' stopOpacity='1' />
          <stop offset='100%' stopColor='white' stopOpacity='0' />
        </radialGradient>

        <mask id='fadeMask' maskUnits='userSpaceOnUse' x='0' y='0' width='2048' height='550'>
          <rect x='0' y='0' width='2048' height='550' fill='url(#outerFade)' />
        </mask>
      </defs>

      <rect width='100%' height='100%' fill='url(#diamondGrid)' mask='url(#fadeMask)' opacity='0.22' />
    </svg>
  )
}

export default DottedSheet
