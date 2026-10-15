// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';

import { useRef, type ReactNode } from 'react'

import { motion, useScroll, useSpring, useTransform } from 'motion/react'

import { ArrowUpRightIcon } from 'lucide-react'

import Link from '@/shared/lib/template-link'

import { MotionPreset } from '@/features/marketing-site/template/components/ui/motion-preset'
import { cn } from '@/shared/ui/utils'
import { PrimaryFlowButton, SecondaryFlowButton } from '@/features/marketing-site/template/components/ui/flow-button'

export type Features = {
  icon: ReactNode
  title: string
  description: string
  visual: ReactNode
}[]

const FeatureItem = ({
  feature,
  index,
  totalFeatures,
  scrollYProgress
}: {
  feature: Features[number]
  index: number
  totalFeatures: number
  scrollYProgress: any
}) => {
  const start = index / totalFeatures
  const middle = (index + 0.5) / totalFeatures
  const end = (index + 1) / totalFeatures
  const isFirst = index === 0
  const isLast = index === totalFeatures - 1

  const opacity = useTransform(
    scrollYProgress,
    isFirst
      ? [0, middle - 0.05, middle + 0.05, end]
      : isLast
        ? [start, middle - 0.05, middle + 0.05, 1]
        : [start, middle - 0.05, middle + 0.05, end],
    isFirst ? [1, 1, 1, 0.3] : isLast ? [0.3, 1, 1, 1] : [0.3, 1, 1, 0.3]
  )

  const y = useTransform(
    scrollYProgress,
    isFirst ? [0, middle, end] : isLast ? [start, middle, 1] : [start, middle, end],
    isFirst ? [0, 0, -30] : isLast ? [30, 0, 0] : [30, 0, -30]
  )

  return (
    <motion.div style={{ opacity, y }} className={cn('flex h-125 items-center justify-center')}>
      <div className='space-y-4'>
        <div className='flex items-center gap-4 [&>svg]:size-7'>
          {feature.icon}
          <div className='font-medium md:text-2xl xl:text-3xl'>{flowText(feature.title)}</div>
        </div>
        <div className='text-muted-foreground'>{flowText(feature.description)}</div>
      </div>
    </motion.div>
  )
}

const VisualItem = ({
  feature,
  index,
  totalFeatures,
  scrollYProgress
}: {
  feature: Features[number]
  index: number
  totalFeatures: number
  scrollYProgress: any
}) => {
  const start = index / totalFeatures
  const middle = (index + 0.5) / totalFeatures
  const end = (index + 1) / totalFeatures
  const isFirst = index === 0
  const isLast = index === totalFeatures - 1

  const opacity = useTransform(
    scrollYProgress,
    isFirst
      ? [0, middle - 0.05, middle + 0.05, end]
      : isLast
        ? [start, middle - 0.05, middle + 0.05, 1]
        : [start, middle - 0.05, middle + 0.05, end],
    isFirst ? [1, 1, 1, 0] : isLast ? [0, 1, 1, 1] : [0, 1, 1, 0]
  )

  return (
    <motion.div
      style={{ opacity }}
      className='absolute inset-0 flex items-center justify-center px-3'
      transition={{ duration: 0.3 }}
    >
      <div className='size-full max-h-112 max-w-132'>{feature.visual}</div>
    </motion.div>
  )
}

const Benefits = ({ featuresList }: { featuresList: Features }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end']
  })

  const diamondRotationRaw = useTransform(scrollYProgress, progress => {
    const currentIndex = Math.min(Math.floor(progress * featuresList.length), featuresList.length - 1)

    return currentIndex * 360
  })

  const diamondRotation = useSpring(diamondRotationRaw, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  })

  return (
    <section id='benefits' className='py-8 sm:py-16 lg:py-24'>
      <MotionPreset
        fade
        slide={{ direction: 'down', offset: 50 }}
        blur
        transition={{ duration: 0.5 }}
        className='mb-12 space-y-4 text-center max-md:px-4 sm:mb-16 lg:mb-24'
      >
        <p className='text-primary text-sm font-medium uppercase'><FlowCopy text="Benefits" /></p>

        <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'><FlowCopy text="How Flow Helps You" /></h2>

        <p className='text-muted-foreground mx-auto max-w-3xl text-xl'>
          <FlowCopy text="It&apos;s built to simplify your sales process and keep everything easy to manage." /></p>

        <div className='flex flex-wrap items-center justify-center gap-4 text-center'>
          <PrimaryFlowButton asChild>
            <Link href='/projects'>
              <FlowCopy text="Start building now" /><ArrowUpRightIcon />
            </Link>
          </PrimaryFlowButton>
          <SecondaryFlowButton asChild>
            <Link href='/tutorial'><FlowCopy text="Learn more" /></Link>
          </SecondaryFlowButton>
        </div>
      </MotionPreset>

      <MotionPreset delay={0.8} fade slide={{ direction: 'down' }} transition={{ duration: 0.5 }}>
        <div ref={containerRef} className='grid gap-6 md:grid-cols-2'>
          <div className='relative hidden w-full space-y-20 px-6 py-20 md:block'>
            {featuresList.map((feature, index) => (
              <FeatureItem
                key={index}
                feature={feature}
                index={index}
                totalFeatures={featuresList.length}
                scrollYProgress={scrollYProgress}
              />
            ))}
          </div>

          <div className='bg-muted relative hidden w-full items-center justify-center space-y-20 px-6 py-20 md:block'>
            <div className='bg-card sticky top-[calc(50vh-250px)] flex h-125 items-center justify-center overflow-hidden rounded-xl border'>
              {featuresList.map((feature, index) => (
                <VisualItem
                  key={index}
                  feature={feature}
                  index={index}
                  totalFeatures={featuresList.length}
                  scrollYProgress={scrollYProgress}
                />
              ))}

              {['top-4.5 left-4.5', 'top-4.5 right-4.5', 'bottom-4.5 left-4.5', 'bottom-4.5 right-4.5'].map(
                (position, idx) => (
                  <motion.svg
                    key={idx}
                    xmlns='http://www.w3.org/2000/svg'
                    width='10'
                    height='12'
                    viewBox='0 0 10 12'
                    fill='none'
                    className={cn('absolute', position)}
                    style={{ rotate: diamondRotation }}
                  >
                    <path d='M5 0L10 6L5 12L0 6L5 0Z' fill='var(--primary)' />
                  </motion.svg>
                )
              )}
            </div>
          </div>

          <div className='flex flex-col gap-16 md:hidden'>
            {featuresList.map((feature, index) => (
              <div key={index} className='space-y-16'>
                <div className='bg-muted relative px-6 py-20'>
                  <div className='bg-card sticky top-20 flex h-87.5 items-center justify-center overflow-hidden rounded-xl border'>
                    <div className='absolute inset-0 flex items-center justify-center'>
                      {feature.visual}
                    </div>
                    {['top-4.5 left-4.5', 'top-4.5 right-4.5', 'bottom-4.5 left-4.5', 'bottom-4.5 right-4.5'].map(
                      (position, idx) => (
                        <svg
                          key={idx}
                          xmlns='http://www.w3.org/2000/svg'
                          width='10'
                          height='12'
                          viewBox='0 0 10 12'
                          fill='none'
                          className={cn('absolute', position)}
                        >
                          <path d='M5 0L10 6L5 12L0 6L5 0Z' fill='var(--primary)' />
                        </svg>
                      )
                    )}
                  </div>
                </div>
                <div className='space-y-4 max-md:px-4'>
                  <div className='flex items-center gap-4 [&>svg]:size-5'>
                    {feature.icon}
                    <div className='text-xl font-medium'>{flowText(feature.title)}</div>
                  </div>
                  <div className='text-muted-foreground'>{flowText(feature.description)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </MotionPreset>
    </section>
  )
}

export default Benefits
