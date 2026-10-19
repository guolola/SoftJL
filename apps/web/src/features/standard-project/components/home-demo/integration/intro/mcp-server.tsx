// Replaces the supplied logo map with a requirements breakdown; beam paths and timings are preserved.
'use client'

// React Imports
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

// Component Imports
import { AnimatedBeam } from './ui/animated-beam'

// SVG Imports
import { PlusIcon, MessageSquareTextIcon, BotIcon, UsersRoundIcon, WorkflowIcon, DatabaseIcon, ShieldCheckIcon } from 'lucide-react'

const MCPServer = () => {
  const { t } = useTranslation()
  // Vars
  const containerRef = useRef<HTMLDivElement>(null)
  const span1Ref = useRef<HTMLSpanElement>(null)
  const span2Ref = useRef<HTMLSpanElement>(null)
  const span3Ref = useRef<HTMLSpanElement>(null)
  const span4Ref = useRef<HTMLSpanElement>(null)
  const span5Ref = useRef<HTMLSpanElement>(null)
  const span6Ref = useRef<HTMLSpanElement>(null)
  const span7Ref = useRef<HTMLSpanElement>(null)
  const span8Ref = useRef<HTMLSpanElement>(null)
  const span9Ref = useRef<HTMLSpanElement>(null)
  const span10Ref = useRef<HTMLSpanElement>(null)

  return (
    <div ref={containerRef} role='img' aria-label={t('standardProject.intro.requirements.label')} className='relative z-1 flex shrink-0 flex-col items-center gap-26.5'>
      <span ref={span1Ref} className='bg-card flex items-center gap-1 rounded-full border p-2.5'>
        <span className='bg-card flex size-11.5 items-center justify-center rounded-full border'>
          <MessageSquareTextIcon className='size-8' aria-label={t('standardProject.intro.requirements.idea')} />
        </span>
        <PlusIcon className='size-4' />
        <span className='bg-card flex size-11.5 items-center justify-center rounded-full border'>
          <BotIcon className='size-8' aria-label={t('standardProject.intro.requirements.agent')} />
        </span>
      </span>
      <div className='flex items-center gap-7.5'>
        <span
          ref={span7Ref}
          className='bg-card flex size-14 items-center justify-center overflow-hidden rounded-full border'
        >
          <span className='flex flex-col items-center'><UsersRoundIcon className='size-6' /><span className='text-[10px]'>{t('standardProject.intro.requirements.roles')}</span></span>
        </span>
        <span
          ref={span8Ref}
          className='bg-card flex size-14 items-center justify-center overflow-hidden rounded-full border'
        >
          <span className='flex flex-col items-center'><WorkflowIcon className='size-6' /><span className='text-[10px]'>{t('standardProject.intro.requirements.business')}</span></span>
        </span>
        <span
          ref={span9Ref}
          className='bg-card flex size-14 items-center justify-center overflow-hidden rounded-full border'
        >
          <span className='flex flex-col items-center'><DatabaseIcon className='size-6' /><span className='text-[10px]'>{t('standardProject.intro.requirements.data')}</span></span>
        </span>
        <span
          ref={span10Ref}
          className='bg-card flex size-14 items-center justify-center overflow-hidden rounded-full border'
        >
          <span className='flex flex-col items-center'><ShieldCheckIcon className='size-6' /><span className='text-[10px]'>{t('standardProject.intro.requirements.constraints')}</span></span>
        </span>
      </div>
      <span ref={span2Ref} className='absolute top-1/2 left-1/2 size-0.5 -translate-x-px translate-y-1.25' />
      <span ref={span3Ref} className='absolute top-1/2 left-1/2 size-0.5 -translate-x-32.5 translate-y-1.25' />
      <span ref={span4Ref} className='absolute top-1/2 left-1/2 size-0.5 -translate-x-11 translate-y-1.25' />
      <span ref={span5Ref} className='absolute top-1/2 right-1/2 size-0.5 translate-x-11 translate-y-1.25' />
      <span ref={span6Ref} className='absolute top-1/2 right-1/2 size-0.5 translate-x-32.5 translate-y-1.25' />

      <AnimatedBeam
        containerRef={containerRef}
        fromRef={span1Ref}
        toRef={span2Ref}
        className='text-primary -z-1'
        duration={4}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={span3Ref}
        toRef={span2Ref}
        className='text-primary -z-1'
        duration={4}
        reverse
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={span2Ref}
        toRef={span6Ref}
        className='text-primary -z-1'
        duration={4}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={span3Ref}
        toRef={span7Ref}
        className='text-primary -z-1'
        duration={4}
        reverse
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={span4Ref}
        toRef={span8Ref}
        className='text-primary -z-1'
        duration={4}
        reverse
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={span5Ref}
        toRef={span9Ref}
        className='text-primary -z-1'
        duration={4}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={span6Ref}
        toRef={span10Ref}
        className='text-primary -z-1'
        duration={4}
      />
    </div>
  )
}

export default MCPServer
