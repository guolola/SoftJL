// Supplied waitlist-05 content and animation; omits navigation, brand strip, and background artwork.
'use client'

import { useEffect, useState, Fragment } from 'react'

import { AnimatePresence, motion } from 'motion/react'

export type WaitlistLabels = {
  titleFirst: string
  titleSecond: string
  description: string
  days: string
  hours: string
  minutes: string
  seconds: string
}

const Waitlist = ({ labels }: { labels: WaitlistLabels }) => {
  const [timer, setTimer] = useState({
    days: 11,
    hours: 5,
    minutes: 23,
    seconds: 58
  })

  useEffect(() => {
    const timing = setInterval(() => {
      setTimer(prev => {
        let { days, hours, minutes, seconds } = prev

        // Stop at 00:00:00:00
        if (days === 0 && hours === 0 && minutes === 0 && seconds === 0) {
          return prev
        }

        if (seconds > 0) {
          seconds--
        } else if (minutes > 0) {
          minutes--
          seconds = 59
        } else if (hours > 0) {
          hours--
          minutes = 59
          seconds = 59
        } else if (days > 0) {
          days--
          hours = 23
          minutes = 59
          seconds = 59
        }

        return { days, hours, minutes, seconds }
      })
    }, 1000)

    return () => clearInterval(timing)
  }, [])

  const timerItems = [
    {
      value: timer.days,
      label: labels.days
    },
    {
      value: timer.hours,
      label: labels.hours
    },
    {
      value: timer.minutes,
      label: labels.minutes
    },
    {
      value: timer.seconds,
      label: labels.seconds
    }
  ]

  return (
    <section className='relative flex min-w-0 flex-col px-4 py-8 sm:py-12'>
      {/* Anchor the glass card to the title gap so it blurs the adjacent edges of both lines. */}
      <div className='relative mx-auto flex w-full max-w-7xl flex-col items-center text-center'>
        <div className='mb-4 flex w-full flex-col items-center'>
          <h1 className='text-2xl font-semibold sm:text-4xl md:text-5xl lg:text-7xl lg:leading-31.25 xl:text-8xl'>
            {labels.titleFirst}
          </h1>
          <div data-slot='exam-title-gap' className='relative h-20 w-full shrink-0 sm:h-16 md:h-20 lg:h-5'>
            <div data-slot='exam-countdown' className='ring-border absolute top-1/2 left-1/2 z-4 w-full max-w-121 -translate-x-1/2 -translate-y-1/2 overflow-visible rounded-[24px] border-2 bg-white/40 p-4 shadow-2xl ring-2 backdrop-blur-xs md:h-30.5 md:px-6 md:py-4'>
              <div className='bg-destructive ring-destructive/40 absolute top-3 right-3 size-3 rounded-full ring-3'></div>
              <div className='flex items-center justify-around gap-3'>
                {timerItems.map((item, index) => {
                  return (
                    <Fragment key={index}>
                      <div className='flex flex-col text-center'>
                        <div className='flex justify-center'>
                          {String(item.value)
                            .padStart(2, '0')
                            .split('')
                            .map((digit, digitIndex) => (
                              <div key={digitIndex} className='relative h-10 w-6 overflow-hidden md:h-15.5 md:w-8'>
                                <AnimatePresence mode='wait'>
                                  <motion.span
                                    key={digit}
                                    initial={{ y: 40 }}
                                    animate={{ y: 0 }}
                                    exit={{ y: -40 }}
                                    transition={{
                                      duration: 0.3,
                                      ease: 'easeOut'
                                    }}
                                    className='text-primary absolute inset-0 flex items-center justify-center text-4xl font-semibold md:text-5xl'
                                  >
                                    {digit}
                                  </motion.span>
                                </AnimatePresence>
                              </div>
                            ))}
                        </div>
                        <p className='text-primary md:text-xl'>{item.label}</p>
                      </div>
                    </Fragment>
                  )
                })}
              </div>
            </div>
          </div>
          <h1 className='text-2xl font-semibold sm:text-4xl md:text-5xl lg:text-7xl lg:leading-31.25 xl:text-8xl'>
            {labels.titleSecond}
          </h1>
        </div>
        <p className='text-muted-foreground max-w-xs text-xl md:max-w-xl lg:max-w-3xl'>
          {labels.description}
        </p>
      </div>
    </section>
  )
}

export default Waitlist
