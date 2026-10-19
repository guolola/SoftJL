// Shows a requested workflow revision in the supplied two-preview layout, preserving its beam animation.
'use client'

// React Imports
import { useRef } from 'react'

// Third-party Imports
import { motion } from 'motion/react'

// Component Imports
import { AnimatedBeam } from './ui/animated-beam'

import { RevisionIllustration } from './intro-illustrations'
import { MessageSquareTextIcon, GitCompareArrowsIcon } from 'lucide-react'

const FigmaToCode = () => {
  // Vars
  const containerRef = useRef<HTMLDivElement>(null)
  const span1Ref = useRef<HTMLSpanElement>(null)
  const span2Ref = useRef<HTMLSpanElement>(null)

  return (
    <div ref={containerRef} className='relative z-1 flex justify-between gap-22'>
      <div className='relative rounded-r-md border-y border-r'>
        <RevisionIllustration />
        <span
          ref={span1Ref}
          className='text-card-foreground bg-card absolute top-1/2 right-0 flex size-11 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border'
        >
          <MessageSquareTextIcon className='size-6' aria-hidden='true' />
          <motion.svg
            height='44'
            width='44'
            xmlns='http://www.w3.org/2000/svg'
            initial='hidden'
            animate='visible'
            className='absolute -top-px -rotate-90'
          >
            <motion.circle
              r='21.5'
              cx='22'
              cy='22'
              stroke='var(--primary)'
              strokeWidth='1'
              fill='none'
              variants={{
                hidden: { pathLength: 0 },
                visible: {
                  pathLength: [0, 1, 0],
                  transition: {
                    duration: 1.5,
                    repeat: Infinity,
                    repeatDelay: 2.5,
                    times: [0, 1, 1]
                  }
                }
              }}
            />
          </motion.svg>
        </span>
      </div>
      <div className='relative rounded-l-md border-y border-s'>
        <RevisionIllustration after />
        <span
          ref={span2Ref}
          className='text-card-foreground bg-card absolute top-1/2 left-0 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border'
        >
          <GitCompareArrowsIcon className='size-6' aria-hidden='true' />
          <motion.svg
            height='44'
            width='44'
            xmlns='http://www.w3.org/2000/svg'
            initial='hidden'
            animate='visible'
            className='absolute -top-px -rotate-90'
          >
            <motion.circle
              r='21.5'
              cx='22'
              cy='22'
              stroke='var(--primary)'
              strokeWidth='1'
              fill='none'
              variants={{
                hidden: { pathLength: 0 },
                visible: {
                  pathLength: [0, 1, 0],
                  transition: {
                    delay: 1.75,
                    duration: 1.5,
                    repeat: Infinity,
                    repeatDelay: 2.5,
                    times: [0, 1, 1]
                  }
                }
              }}
            />
          </motion.svg>
        </span>
      </div>
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={span1Ref}
        toRef={span2Ref}
        className='text-primary -z-1'
        duration={4}
        delay={0.25}
      />
    </div>
  )
}

export default FigmaToCode
