// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';

import React, { useState, useEffect } from 'react'

import { motion, AnimatePresence } from 'motion/react'

import { cn } from '@/shared/ui/utils'

const TextFlip = ({
  words = ['Growth', 'Revenue', 'Sales'],
  duration = 3000
}: {
  words?: string[]
  duration?: number
}) => {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex(prevIndex => (prevIndex + 1) % words.length)
    }, duration)

    return () => clearInterval(interval)
  }, [words, duration])

  return (
    <motion.span
      layout
      className='bg-background/5 relative inline-flex w-fit overflow-hidden rounded-md border px-3 py-0.5 backdrop-blur-md'
    >
      <AnimatePresence mode='popLayout'>
        <motion.span
          key={currentIndex}
          initial={{ y: -40, filter: 'blur(10px)' }}
          animate={{
            y: 0,
            filter: 'blur(0px)'
          }}
          exit={{ y: 50, filter: 'blur(10px)', opacity: 0 }}
          transition={{
            duration: 0.5
          }}
          className={cn('inline-block whitespace-nowrap')}
        >
          {flowText(words[currentIndex])}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  )
}

export default TextFlip
