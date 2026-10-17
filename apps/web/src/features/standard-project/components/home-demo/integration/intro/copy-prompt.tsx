// Explains test case fields in the supplied three-output beam illustration.
'use client'

// React Imports
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

// Component Imports
import { AnimatedBeam } from './ui/animated-beam'
import { ClipboardListIcon, ListChecksIcon, FootprintsIcon, TargetIcon } from 'lucide-react'

const CopyPrompt = () => {
  const { t } = useTranslation()
  // Vars
  const containerRef = useRef<HTMLDivElement>(null)
  const span1Ref = useRef<HTMLSpanElement>(null)
  const span2Ref = useRef<HTMLSpanElement>(null)
  const span3Ref = useRef<HTMLSpanElement>(null)
  const span4Ref = useRef<HTMLSpanElement>(null)
  const span5Ref = useRef<HTMLSpanElement>(null)
  const span6Ref = useRef<HTMLSpanElement>(null)

  return (
    <div ref={containerRef} role='img' aria-label={t('standardProject.intro.tests.label')} className='relative z-1 flex items-center justify-between px-4'>
      <span ref={span1Ref} className='bg-background flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-base'>
        <ClipboardListIcon className='size-5' />
        <span>{t('standardProject.intro.tests.source')}</span>
      </span>
      <div className='absolute left-3/5 flex flex-col gap-46.5'>
        <span ref={span2Ref} className='size-0.5' />
        <span ref={span3Ref} className='size-0.5' />
      </div>
      <div className='flex flex-col gap-11'>
        <span ref={span4Ref} className='bg-primary text-primary-foreground flex size-12.5 items-center justify-center rounded-xl'>
          <span className='flex flex-col items-center' aria-label={t('standardProject.intro.tests.preconditions')}><ListChecksIcon className='size-6' /><span className='text-[10px]'>{t('standardProject.intro.tests.preconditionsLabel')}</span></span>
        </span>
        <span ref={span5Ref} className='bg-primary text-primary-foreground flex size-12.5 items-center justify-center rounded-xl'>
          <span className='flex flex-col items-center' aria-label={t('standardProject.intro.tests.steps')}><FootprintsIcon className='size-6' /><span className='text-[10px]'>{t('standardProject.intro.tests.stepsLabel')}</span></span>
        </span>
        <span ref={span6Ref} className='bg-primary text-primary-foreground flex size-12.5 items-center justify-center rounded-xl'>
          <span className='flex flex-col items-center' aria-label={t('standardProject.intro.tests.expected')}><TargetIcon className='size-6' /><span className='text-[10px]'>{t('standardProject.intro.tests.expectedLabel')}</span></span>
        </span>
      </div>
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={span1Ref}
        toRef={span5Ref}
        className='text-primary -z-1'
        duration={4}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={span2Ref}
        toRef={span3Ref}
        className='text-primary -z-1'
        duration={4}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={span2Ref}
        toRef={span4Ref}
        className='text-primary -z-1'
        duration={4}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={span3Ref}
        toRef={span6Ref}
        className='text-primary -z-1'
        duration={4}
      />
    </div>
  )
}

export default CopyPrompt
