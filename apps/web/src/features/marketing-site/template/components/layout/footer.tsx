// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';

import Link from '@/shared/lib/template-link'
import { PRODUCT_TUTORIAL_URL } from '@/shared/lib/product-links'

import { ArrowRightIcon } from 'lucide-react'

import { Input } from '@/features/marketing-site/template/components/ui/input'
import { Separator } from '@/features/marketing-site/template/components/ui/separator'

import { PrimaryFlowButton } from '@/features/marketing-site/template/components/ui/flow-button'
import SectionSeparator from '@/features/marketing-site/template/components/section-separator'
import { logos } from '@/features/marketing-site/template/content/trusted-brands'

const Footer = () => {
  return (
    <footer>
      <SectionSeparator />
      <div className='mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-4 sm:gap-8 sm:px-6 sm:py-16 md:py-24 lg:px-8'>
        <div className='flex flex-col gap-5'>
          <div className='text-lg font-medium'><FlowCopy text="Company" /></div>
          <ul className='text-muted-foreground space-y-3'>
            <li>
              <Link href='/#testimonials' className='hover:text-foreground transition-colors duration-300'>
                <FlowCopy text="Testimonials" /></Link>
            </li>
            <li>
              <Link href='/#features' className='hover:text-foreground transition-colors duration-300'>
                <FlowCopy text="Features" /></Link>
            </li>
            <li>
              <Link href='/#benefits' className='hover:text-foreground transition-colors duration-300'>
                <FlowCopy text="Benefits" /></Link>
            </li>
          </ul>
        </div>
        <div className='flex flex-col gap-5'>
          <div className='text-lg font-medium'><FlowCopy text="Help" /></div>
          <ul className='text-muted-foreground space-y-3'>
            <li>
              <Link href={PRODUCT_TUTORIAL_URL} className='hover:text-foreground transition-colors duration-300'>
                <FlowCopy text="Blog" /></Link>
            </li>
            <li>
              <Link href='/projects' className='hover:text-foreground transition-colors duration-300'>
                <FlowCopy text="Start your project" /></Link>
            </li>
          </ul>
        </div>
        <div className='col-span-full flex flex-col gap-5 sm:col-span-2'>
          <div>
            <p className='mb-3 text-lg font-medium'><FlowCopy text="Subscribe to newsletter" /></p>
            <form className='flex gap-2' onSubmit={e => { e.preventDefault(); const email = new FormData(e.currentTarget).values().next().value; window.history.pushState({}, '', '/register?email=' + encodeURIComponent(String(email ?? ''))); window.dispatchEvent(new PopStateEvent('popstate')); }}>
              <Input name='newsletter-email' type='email' placeholder={flowText('Your email address')} required />
              <PrimaryFlowButton
                type='submit'
                className='shrink-0 **:data-[slot=button]:size-9 **:data-[slot=button]:px-0'
                aria-label={flowText('Get started')}
              >
                <ArrowRightIcon />
              </PrimaryFlowButton>
            </form>
          </div>
          <Separator />

          <div className='grid grid-cols-4 items-center justify-items-center gap-5 sm:grid-cols-7'>
            {logos.map(logo => (
              <img
                key={logo.name}
                src={logo.image}
                alt={flowText(logo.name)}
                className='h-7 w-14 object-contain opacity-70 grayscale dark:invert'
              />
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
