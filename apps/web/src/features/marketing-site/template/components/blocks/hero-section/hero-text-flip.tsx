// Rotates student project scenarios while respecting reduced-motion preferences.
'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FlowCopy } from '@/features/marketing-site/model/flow-copy'

const WORDS = ['Capstone projects', 'Course projects', 'UML assignments']

export default function HeroTextFlip() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) return
    const interval = setInterval(() => setCurrentIndex(index => (index + 1) % WORDS.length), 3000)
    return () => clearInterval(interval)
  }, [reduceMotion])

  return (
    <motion.span layout={!reduceMotion} className='bg-background/70 relative inline-flex w-fit overflow-hidden rounded-full border px-4 py-0.5 backdrop-blur-md sm:px-5.5'>
      <AnimatePresence mode='popLayout'>
        <motion.span key={currentIndex}
          initial={reduceMotion ? false : { y: -40, filter: 'blur(10px)' }}
          animate={{ y: 0, filter: 'blur(0px)' }}
          exit={reduceMotion ? undefined : { y: 50, filter: 'blur(10px)', opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.5 }}
          className='inline-block whitespace-nowrap'>
          <FlowCopy text={WORDS[currentIndex]} />
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}
