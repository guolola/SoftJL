// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import { motion } from 'motion/react'

const TargetVisibilityRippleBg = ({ className }: { className?: string }) => {
  return (
    <motion.svg
      width='1em'
      height='1em'
      viewBox='0 0 200 200'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
      initial='hidden'
      animate='visible'
    >
      <motion.circle
        strokeOpacity={0.3}
        cx='100'
        cy='100'
        r='94'
        fill='var(--card)'
        stroke='var(--border)'
        strokeWidth='1.485'
        variants={{
          visible: {
            scale: [1, 0.9, 1],
            transition: {
              scale: { delay: 0.24, duration: 2.75, repeat: Infinity, ease: 'easeOut' }
            }
          }
        }}
      />
      <motion.circle
        strokeOpacity={0.6}
        cx='100'
        cy='100'
        r='76'
        fill='var(--card)'
        stroke='var(--border)'
        strokeWidth='1.485'
        variants={{
          visible: {
            scale: [1, 0.9, 1],
            transition: {
              scale: { delay: 0.36, duration: 2.75, repeat: Infinity, ease: 'easeOut' }
            }
          }
        }}
      />
      <motion.circle
        strokeOpacity={0.9}
        cx='100'
        cy='100'
        r='53'
        fill='var(--card)'
        stroke='var(--border)'
        strokeWidth='1.485'
        variants={{
          visible: {
            scale: [1, 0.9, 1],
            transition: {
              scale: { delay: 0.48, duration: 2.75, repeat: Infinity, ease: 'easeOut' }
            }
          }
        }}
      />
    </motion.svg>
  )
}

export default TargetVisibilityRippleBg
