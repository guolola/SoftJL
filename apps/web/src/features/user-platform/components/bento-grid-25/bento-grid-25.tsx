// Adapts the supplied bento-grid-25 content to the empty projects workspace; grid, motion and interactions stay intact.
'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../../../shared/ui/badge'
import { Button } from '../../../../shared/ui/button'
import { Card, CardContent } from '../../../../shared/ui/card'
import { Marquee } from './marquee'
import { MotionPreset } from './motion-preset'

import BeforeAfterCard from './before-after-card'

export type StatBadge = {
  id: number
  label: string
}

export type ArtifactPreview = {
  id: number
  title: string
  image: string
}

export type JourneyStep = {
  id: number
  title: string
  description: string
}

export type BentoGridProps = {
  stats: StatBadge[]
  previews: ArtifactPreview[]
  journeySteps: JourneyStep[]
}

const QUICK_START_HREF = '/tutorial?article=quick-start'

const WORKFLOW_VIDEO = '/marketing/empty-projects/workflow.webm'

const WORKFLOW_POSTER = '/marketing/empty-projects/workflow-poster.jpg'

const BentoGrid = ({ stats, previews, journeySteps }: BentoGridProps) => {
  const { t } = useTranslation()
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const [isVideoVisible, setIsVideoVisible] = useState(false)

  useEffect(() => {
    const container = videoContainerRef.current

    if (!container) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVideoVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  return (
    <section className='pb-8 sm:pb-16 lg:pb-24'>
      <div className='mx-auto max-w-7xl space-y-16 px-4 sm:px-6 lg:px-8'>
        <MotionPreset fade slide={{ direction: 'down', offset: 50 }} transition={{ duration: 0.45 }}>
          <div className='relative top-4 flex flex-col items-center gap-4 text-center'>
            <h2 className='text-2xl font-semibold tracking-tight md:text-3xl lg:text-4xl'>
              {t('projects.emptyBento.title')}
            </h2>

            <p className='text-muted-foreground text-lg'>{t('projects.emptyBento.description')}</p>
          </div>
        </MotionPreset>

        <MotionPreset
          fade
          slide={{ direction: 'down', offset: 50 }}
          transition={{ duration: 0.5 }}
          delay={0.2}
          className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'
        >
          <div className='flex flex-col gap-6'>
            <MotionPreset fade blur slide={{ direction: 'down', offset: 75 }} transition={{ duration: 0.45 }}>
              <Card className='bg-muted shadow-none ring-0'>
                <CardContent className='flex flex-col gap-5'>
                  <div className='space-y-2'>
                    <span className='text-primary text-xl font-bold'>{t('projects.emptyBento.overview.eyebrow')}</span>
                    <h3 className='text-foreground text-6xl font-medium'>{t('projects.emptyBento.overview.value')}</h3>
                    <p className='text-muted-foreground text-lg'>{t('projects.emptyBento.overview.description')}</p>
                  </div>

                  <div className='flex flex-wrap gap-2'>
                    {stats.map(stat => (
                      <Badge
                        key={stat.id}
                        className='bg-background text-foreground rounded-full py-4 text-sm font-normal'
                      >
                        {stat.label}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </MotionPreset>

            <MotionPreset
              fade
              blur
              slide={{ direction: 'down', offset: 75 }}
              transition={{ duration: 0.5 }}
              delay={0.4}
              className='flex flex-1 flex-col'
            >
              <div ref={videoContainerRef} className='relative flex min-h-100 flex-1 overflow-clip rounded-xl'>
                <video
                  src={isVideoVisible ? WORKFLOW_VIDEO : undefined}
                  poster={WORKFLOW_POSTER}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className='absolute inset-0 size-full object-cover'
                />

                <div className='from-primary absolute inset-x-0 top-0 h-70 bg-linear-to-b to-transparent' />

                <Card className='bg-background absolute m-6 h-fit space-y-1'>
                  <CardContent>
                    <h3 className='text-xl font-semibold'>{t('projects.emptyBento.video.title')}</h3>
                    <p className='text-muted-foreground text-base'>{t('projects.emptyBento.video.description')}</p>
                  </CardContent>
                </Card>
              </div>
            </MotionPreset>
          </div>

          <div className='flex flex-col gap-6'>
            <BeforeAfterCard />

            <MotionPreset
              fade
              blur
              slide={{ direction: 'down', offset: 75 }}
              transition={{ duration: 0.5 }}
              delay={0.5}
            >
              <Card className='bg-muted relative overflow-hidden shadow-none ring-0'>
                <CardContent className='flex flex-col justify-between gap-8'>
                  <div className='bg-primary/5 absolute -right-20 -bottom-22 flex size-56 items-center justify-center rounded-full'>
                    <div className='bg-primary/10 size-30 rounded-full' />
                  </div>

                  <div className='relative space-y-3'>
                    <h3 className='text-2xl font-semibold md:text-3xl lg:text-4xl'>
                      {t('projects.emptyBento.quickStart.title')}
                    </h3>
                    <p className='max-w-sm text-base'>{t('projects.emptyBento.quickStart.description')}</p>
                  </div>

                  <Button
                    size='lg'
                    render={<a href={QUICK_START_HREF} />}
                    nativeButton={false}
                    className='relative self-start overflow-hidden before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.5)_50%,transparent_75%,transparent_100%)] before:bg-size-[250%_250%,100%_100%] before:bg-position-[200%_0,0_0] before:bg-no-repeat before:transition-[background-position_0s_ease] before:duration-1000 hover:before:bg-position-[-100%_0,0_0] dark:before:bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,0.2)_50%,transparent_75%,transparent_100%)]'
                  >
                    {t('projects.emptyBento.quickStart.action')}
                  </Button>
                </CardContent>
              </Card>
            </MotionPreset>
          </div>

          <div className='flex flex-col gap-6 sm:col-span-2 lg:col-span-1'>
            <MotionPreset
              fade
              blur
              slide={{ direction: 'down', offset: 75 }}
              transition={{ duration: 0.45 }}
              delay={0.4}
            >
              <Card className='bg-secondary flex flex-col gap-5 overflow-visible shadow-none ring-0'>
                <div className='space-y-1 px-6'>
                  <h3 className='text-2xl font-semibold'>{t('projects.emptyBento.previews.title')}</h3>
                  <p className='text-muted-foreground text-lg'>{t('projects.emptyBento.previews.description')}</p>
                </div>

                <div className='relative'>
                  <Marquee pauseOnHover duration={35} gap={0.75} className='p-0' reverse>
                    {previews.map(preview => (
                      <div
                        key={preview.id}
                        className='group/item relative h-57.25 w-54.25 shrink-0 overflow-hidden rounded-lg'
                      >
                        <img
                          src={preview.image}
                          alt={preview.title}
                          loading='lazy'
                          className='size-full object-cover'
                        />

                        <div className='from-accent absolute inset-0 bg-linear-to-t to-transparent opacity-0 transition-opacity duration-300 group-hover/item:opacity-100' />

                        <Badge
                          variant='outline'
                          className='bg-background text-primary absolute bottom-4 left-1/2 h-auto -translate-x-1/2 rounded-full border-transparent px-4 py-1.5 text-sm font-medium whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover/item:opacity-100'
                        >
                          {preview.title}
                        </Badge>
                      </div>
                    ))}
                  </Marquee>

                  <div className='from-secondary pointer-events-none absolute inset-y-0 left-0 w-24 bg-linear-to-r to-transparent' />
                  <div className='from-secondary pointer-events-none absolute inset-y-0 right-0 w-24 bg-linear-to-l to-transparent' />
                </div>
              </Card>
            </MotionPreset>

            <MotionPreset
              fade
              blur
              slide={{ direction: 'down', offset: 75 }}
              transition={{ duration: 0.5 }}
              delay={0.5}
              className='flex flex-1 flex-col'
            >
              <Card className='bg-secondary flex-1 shadow-none ring-0'>
                <CardContent className='flex flex-col gap-5'>
                  <div className='space-y-1'>
                    <h3 className='text-2xl font-semibold'>{t('projects.emptyBento.journey.title')}</h3>
                    <p className='text-muted-foreground text-lg'>{t('projects.emptyBento.journey.description')}</p>
                  </div>

                  <div className='flex flex-1 flex-col gap-6'>
                    {journeySteps.map((step, index) => (
                      <MotionPreset
                        fade
                        slide={{ direction: 'up', offset: 75 }}
                        transition={{ duration: 0.6 }}
                        delay={0.7}
                        key={step.id}
                        className='bg-background flex items-center gap-2.5 rounded-2xl p-2.5'
                      >
                        <span className='bg-secondary text-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold'>
                          {index + 1}
                        </span>
                        <div className='space-y-0.5'>
                          <p className='text-base font-medium'>{step.title}</p>
                          <p className='text-muted-foreground text-sm'>{step.description}</p>
                        </div>
                      </MotionPreset>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </MotionPreset>
          </div>
        </MotionPreset>
      </div>
    </section>
  )
}

export default BentoGrid
