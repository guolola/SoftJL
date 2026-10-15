// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import { motion } from 'motion/react'

const RegularUpdatesRippleBg = ({ className }: { className?: string }) => {
  return (
    <motion.svg
      width='1em'
      height='1em'
      viewBox='0 0 500 500'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={className}
      initial='hidden'
      animate='visible'
    >
      <motion.circle
        strokeOpacity={0.4}
        cx='250'
        cy='250'
        r='252'
        fill='var(--card)'
        stroke='var(--border)'
        strokeWidth='1.485'
        variants={{
          visible: {
            scale: [1, 0.95, 1],
            transition: {
              scale: { delay: 0.24, duration: 2.75, repeat: Infinity, ease: 'easeOut' }
            }
          }
        }}
      />
      <motion.circle
        strokeOpacity={0.4}
        cx='250'
        cy='250'
        r='205.5'
        fill='var(--card)'
        stroke='var(--border)'
        strokeWidth='1.485'
        variants={{
          visible: {
            scale: [1, 0.95, 1],
            transition: {
              scale: { delay: 0.24, duration: 2.75, repeat: Infinity, ease: 'easeOut' }
            }
          }
        }}
      />
      <motion.circle
        strokeOpacity={0.4}
        cx='250'
        cy='250'
        r='159'
        fill='var(--card)'
        stroke='var(--border)'
        strokeWidth='1.485'
        variants={{
          visible: {
            scale: [1, 0.95, 1],
            transition: {
              scale: { delay: 0.36, duration: 2.75, repeat: Infinity, ease: 'easeOut' }
            }
          }
        }}
      />
      <motion.circle
        strokeOpacity={0.4}
        cx='250'
        cy='250'
        r='112'
        fill='var(--card)'
        stroke='var(--border)'
        strokeWidth='1.485'
        variants={{
          visible: {
            scale: [1, 0.95, 1],
            transition: {
              scale: { delay: 0.48, duration: 2.75, repeat: Infinity, ease: 'easeOut' }
            }
          }
        }}
      />
    </motion.svg>
  )
}

export default RegularUpdatesRippleBg
