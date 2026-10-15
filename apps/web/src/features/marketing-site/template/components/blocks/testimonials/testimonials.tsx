// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';

import { ExternalLinkIcon, StarIcon } from 'lucide-react'

import Link from '@/shared/lib/template-link'

import TestimonialCard from '@/features/marketing-site/template/components/blocks/testimonials/testimonial-card'
import type { TestimonialItem } from '@/features/marketing-site/template/components/blocks/testimonials/testimonial-card'

import { Marquee } from '@/features/marketing-site/template/components/ui/marquee'
import { MotionPreset } from '@/features/marketing-site/template/components/ui/motion-preset'
import { PrimaryFlowButton } from '@/features/marketing-site/template/components/ui/flow-button'

const Testimonials = ({ testimonials }: { testimonials: TestimonialItem[] }) => {
  return (
    <section id='testimonials' className='space-y-12 py-8 sm:space-y-16 sm:py-16 lg:space-y-24 lg:py-24'>
      {/* Testimonial Header */}
      <MotionPreset
        className='mx-auto max-w-7xl space-y-4 px-4 text-center sm:px-6 lg:px-8'
        fade
        slide={{ direction: 'down', offset: 50 }}
        blur
        transition={{ duration: 0.5 }}
      >
        <p className='text-primary text-sm font-medium uppercase'><FlowCopy text="Testimonials" /></p>

        <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'><FlowCopy text="Trusted by People Who Sell Smarter" /></h2>

        <p className='text-muted-foreground text-xl'>
          <FlowCopy text="Real stories from users who simplified their sales process and grew their revenue with Flow." /></p>
      </MotionPreset>

      {/* Testimonials Marquee */}
      <div className='w-full'>
        <Marquee pauseOnHover duration={70} gap={2.25} className='overflow-visible overflow-x-clip pb-5 *:items-end'>
          {testimonials.map((testimonial, index) => (
            <TestimonialCard key={index} testimonial={testimonial} />
          ))}
        </Marquee>
      </div>

      <div className='mx-auto max-w-7xl space-y-4 px-4 text-center sm:px-6 lg:px-8'>
        <div className='flex flex-wrap items-center justify-center gap-11'>
          <div>
            <div className='flex items-center gap-1.5'>
              <p className='text-2xl font-semibold'><FlowCopy text="4.5" /></p>
              <StarIcon className='fill-amber-600 stroke-amber-600 dark:fill-amber-400 dark:stroke-amber-400'></StarIcon>
            </div>
            <p className='text-muted-foreground text-sm font-medium'><FlowCopy text="Stars out of 5" /></p>
          </div>
          <PrimaryFlowButton asChild>
            <Link href='/projects'>
              <FlowCopy text="View all testimonials" /><ExternalLinkIcon />
            </Link>
          </PrimaryFlowButton>
        </div>
      </div>
    </section>
  )
}

export default Testimonials
