// Presents the platform hero with the supplied orbit composition and existing Flow background.
'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRightIcon, ArrowUpRightIcon, BracesIcon, NetworkIcon } from 'lucide-react'

import Link from '@/shared/lib/template-link'
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy'
import { orbitLogos } from '@/features/marketing-site/template/content/trusted-brands'
import FlowLogo from '@/features/marketing-site/template/assets/svg/flow-logo'
import { BackgroundRippleEffect } from '@/features/marketing-site/template/components/ui/background-ripple-effect'
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from '@/features/marketing-site/template/components/ui/avatar'
import { Badge } from '@/features/marketing-site/template/components/ui/badge'
import { Button } from '@/features/marketing-site/template/components/ui/button'
import { Rating } from '@/features/marketing-site/template/components/ui/rating'
import TextFlip from './hero-text-flip'
import OrbitConnections from './orbit-connections'
import { HERO_ORBIT_HEIGHT, HERO_ORBIT_WIDTH } from './hero-orbit-paths'

const ORBIT_MIN_SCALE = 0.6
const sampleAvatars = [
  { src: '/marketing/avatars/avatar-11.png', fallback: 'HL' },
  { src: '/marketing/avatars/avatar-12.png', fallback: 'JW' },
  { src: '/marketing/avatars/avatar-13.png', fallback: 'HR' },
  { src: '/marketing/avatars/avatar-14.png', fallback: 'OS' }
]
function CapabilityCard({ side }: { side: 'left' | 'right' }) {
  const left = side === 'left'
  return (
    <div className='bg-card/95 w-50 rounded-2xl border p-4 text-left shadow-lg backdrop-blur-sm dark:shadow-black/25'>
      <div className='mb-5 flex items-center justify-between gap-3'>
        <span className='text-muted-foreground text-xs'><FlowCopy text={left ? 'Requirements analysis' : 'Engineering delivery'} /></span>
        {left ? <NetworkIcon className='text-primary size-4' /> : <BracesIcon className='text-primary size-4' />}
      </div>
      <p className='text-foreground text-sm font-semibold'><FlowCopy text={left ? 'Requirements → UML' : 'Models → Code & Docs'} /></p>
      <div className='mt-4 flex items-center gap-1.5' aria-hidden='true'>
        {[0, 1, 2, 3, 4].map(index => (
          <span key={index} className={index === 2 ? 'bg-primary/65 h-1.5 w-8 rounded-full' : 'bg-primary/15 h-1.5 w-4 rounded-full'} />
        ))}
      </div>
    </div>
  )
}

const HeroSection = () => {
  const orbitContainerRef = useRef<HTMLDivElement>(null)
  const [orbitScale, setOrbitScale] = useState(1)
  const reduceMotion = useReducedMotion()

  // The supplied curves use fixed coordinates, so resize the whole orbit without changing its paths.
  useEffect(() => {
    const container = orbitContainerRef.current
    if (!container) return
    const updateScale = () => setOrbitScale(Math.min(1, Math.max(ORBIT_MIN_SCALE, container.clientWidth / HERO_ORBIT_WIDTH)))
    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <section id='home' className='relative isolate overflow-hidden pt-12 pb-8 sm:pt-16 sm:pb-14 lg:pt-20 lg:pb-20'>
      <BackgroundRippleEffect />
      <div className='pointer-events-none absolute inset-x-0 top-0 z-5 h-128 bg-[radial-gradient(transparent_20%,var(--background)_90%)]' />

      <div className='relative z-10 mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 text-center sm:px-6 lg:px-8'>
        <div className='bg-muted/80 flex items-center gap-2 rounded-full border p-1.5 text-xs sm:text-sm'>
          <Badge className='rounded-full'><FlowCopy text='AI-Powered' /></Badge>
          <span className='text-muted-foreground pr-1'><FlowCopy text='For software engineering education and practice' /></span>
        </div>

        <h1 className='text-foreground max-w-4xl text-3xl leading-[1.3] font-bold text-balance sm:text-4xl lg:text-5xl'>
          <FlowCopy text='Connect' /> <TextFlip /> <FlowCopy text='with AI' />
          <span className='block'>
            <span className='inline-block whitespace-nowrap'><FlowCopy text='Make engineering practice' /></span>{' '}
            <span className='inline-block whitespace-nowrap'><span aria-hidden='true'>🚀</span> <FlowCopy text='clearer' /></span>
          </span>
        </h1>

        <p className='text-muted-foreground max-w-2xl text-base sm:text-lg'>
          <FlowCopy text='Track every key metric in one clean dashboard - no code, no setup, just real-time insights that help you grow smarter.' />
        </p>

        <div data-testid='hero-social-proof' className='flex items-center gap-3 text-left max-sm:flex-col max-sm:text-center'>
          <AvatarGroup aria-hidden='true' className='-space-x-4 *:data-[slot=avatar]:ring-2'>
            {sampleAvatars.map(avatar => (
              <Avatar key={avatar.src}>
                <AvatarImage src={avatar.src} alt='' />
                <AvatarFallback className='text-xs'>{avatar.fallback}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
          <div className='space-y-1'>
            <div className='flex items-center gap-1.5 max-sm:justify-center'>
              <Rating readOnly variant='yellow' size={24} value={4.5} precision={0.5} aria-label={flowText('Rating: 4.5 out of 5')} />
              <span className='text-foreground text-base font-semibold'>4.5</span>
            </div>
            <p className='text-foreground text-sm'><FlowCopy text='Requirements, models and delivery' /></p>
          </div>
        </div>

        <div className='flex flex-wrap items-center justify-center gap-3'>
          <Button asChild size='lg' className='rounded-full px-5'>
            <Link href='/projects'><FlowCopy text='Start building now' /><ArrowUpRightIcon /></Link>
          </Button>
          <Button asChild size='lg' variant='secondary' className='rounded-full px-5'>
            <Link href='/tutorial'><FlowCopy text='Read the guide' /><ArrowRightIcon /></Link>
          </Button>
          <Button asChild size='lg' variant='outline' className='rounded-full px-5'>
            <Link href='/projects'><FlowCopy text='Start your project' /><ArrowUpRightIcon /></Link>
          </Button>
        </div>

        <motion.div data-testid='hero-capability-card-left' aria-hidden='true'
          animate={reduceMotion ? undefined : { y: [0, -12, 0] }}
          transition={reduceMotion ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className='pointer-events-none absolute top-32 left-0 hidden -rotate-15 lg:block xl:-left-7'>
          <CapabilityCard side='left' />
        </motion.div>
        <motion.div data-testid='hero-capability-card-right' aria-hidden='true'
          animate={reduceMotion ? undefined : { y: [0, -12, 0] }}
          transition={reduceMotion ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          className='pointer-events-none absolute top-32 right-0 hidden rotate-15 lg:block xl:-right-7'>
          <CapabilityCard side='right' />
        </motion.div>
      </div>

      {/* The decorative orbit overlaps the CTA row, so it must not intercept link clicks. */}
      <div ref={orbitContainerRef} data-testid='hero-orbit' className='pointer-events-none relative z-10 -mt-10 w-full overflow-hidden sm:-mt-14' style={{ height: HERO_ORBIT_HEIGHT * orbitScale }}>
        <div className='absolute top-0 left-1/2' style={{ width: HERO_ORBIT_WIDTH, transform: 'translateX(-50%) scale(' + orbitScale + ')', transformOrigin: 'top center' }}>
          <OrbitConnections items={orbitLogos} centerImage={<FlowLogo variant='badge' className='size-full drop-shadow-lg' />} />
          <div className='pointer-events-none absolute -inset-x-10 -inset-y-15 mx-auto max-w-425' aria-hidden='true'>
            <div className='from-background via-background/80 absolute inset-y-0 left-0 z-6 w-24 bg-linear-to-r to-transparent sm:w-32 lg:w-48' />
            <div className='from-background via-background/80 absolute inset-y-0 right-0 z-6 w-24 bg-linear-to-l to-transparent sm:w-32 lg:w-48' />
          </div>
        </div>
      </div>
    </section>
  )
}

export default HeroSection
