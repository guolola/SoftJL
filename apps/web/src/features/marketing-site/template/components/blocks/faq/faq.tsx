// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';

import { useState } from 'react'

import { motion } from 'motion/react'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/features/marketing-site/template/components/ui/accordion'
import { MotionPreset } from '@/features/marketing-site/template/components/ui/motion-preset'

import { cn } from '@/shared/ui/utils'

export type FAQs = {
  question: string
  answer: string
}[]

const FAQ = ({ faqItems }: { faqItems: FAQs }) => {
  const [activeItem, setActiveItem] = useState<string>('item-1')
  const [rotationKey, setRotationKey] = useState(0)

  const handleValueChange = (value: string) => {
    setActiveItem(value)
    setRotationKey(prev => prev + 1)
  }

  return (
    <section id='faq' className='pt-8 sm:pt-16 lg:pt-24'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        {/* FAQ Header */}
        <MotionPreset
          fade
          slide={{ direction: 'down', offset: 50 }}
          blur
          transition={{ duration: 0.5 }}
          className='mb-12 space-y-4 text-center sm:mb-16 lg:mb-24'
        >
          <p className='text-primary text-sm font-medium uppercase'><FlowCopy text="FAQ" /></p>

          <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'><FlowCopy text="Frequently asked questions" /></h2>

          <p className='text-muted-foreground mx-auto max-w-2xl text-xl'>
            <FlowCopy text="Here are some quick answers to help you understand how Flow powers your product success." /></p>
        </MotionPreset>

        <div className='grid grid-cols-1 gap-8 lg:grid-cols-2'>
          <Accordion value={activeItem} onValueChange={handleValueChange} type='single' collapsible className='w-full'>
            {faqItems.map((item, index) => (
              <AccordionItem key={index} value={`item-${index + 1}`}>
                <AccordionTrigger className='py-5 text-base'>{flowText(item.question)}</AccordionTrigger>
                <AccordionContent className='text-muted-foreground pb-5 text-base'>{flowText(item.answer)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {/* Right content */}
          <div
            role='img'
            aria-label={flowText('Workbench dashboard preview')}
            data-testid='faq-dashboard-preview'
            className='group bg-muted relative mx-auto flex h-full max-h-116 w-full max-w-148 items-end justify-center overflow-hidden rounded-xl border lg:max-xl:max-h-95'
          >
            <img
              src='/marketing/generated/workbench-dashboard-light.png'
              alt=''
              aria-hidden='true'
              loading='lazy'
              className='h-full w-full origin-bottom scale-90 object-contain transition-transform duration-500 group-hover:scale-100 dark:hidden'
            />
            <img
              src='/marketing/generated/workbench-dashboard-dark.png'
              alt=''
              aria-hidden='true'
              loading='lazy'
              className='hidden h-full w-full origin-bottom scale-90 object-contain transition-transform duration-500 group-hover:scale-100 dark:block'
            />

            {['top-4.5 left-4.5', 'top-4.5 right-4.5', 'bottom-4.5 left-4.5', 'bottom-4.5 right-4.5'].map(
              (position, idx) => (
                <motion.svg
                  key={`${idx}-${rotationKey}`}
                  xmlns='http://www.w3.org/2000/svg'
                  width='10'
                  height='12'
                  viewBox='0 0 10 12'
                  fill='none'
                  className={cn(
                    'absolute transition-opacity duration-500 group-hover:opacity-0 max-md:hidden',
                    position
                  )}
                  initial={{ rotate: 0 }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.6, ease: 'easeInOut' }}
                >
                  <path d='M5 0L10 6L5 12L0 6L5 0Z' fill='var(--primary)' />
                </motion.svg>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default FAQ
