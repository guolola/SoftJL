// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';

import Link from '@/shared/lib/template-link'

import { ArrowRightIcon } from 'lucide-react'

import { Input } from '@/features/marketing-site/template/components/ui/input'
import { Separator } from '@/features/marketing-site/template/components/ui/separator'

import Logo from '@/features/marketing-site/template/components/logo'
import { PrimaryFlowButton } from '@/features/marketing-site/template/components/ui/flow-button'
import SectionSeparator from '@/features/marketing-site/template/components/section-separator'
import { logos } from '@/features/marketing-site/template/content/trusted-brands'

const Footer = () => {
  return (
    <footer>
      <SectionSeparator />
      <div className='mx-auto grid max-w-7xl grid-cols-6 gap-6 px-4 py-8 sm:gap-8 sm:px-6 sm:py-16 md:py-24 lg:px-8'>
        <div className='col-span-full flex flex-col items-start gap-4 lg:col-span-2'>
          <Link href='/#home'>
            <Logo />
          </Link>
          <p className='text-muted-foreground text-sm leading-6'>
            <FlowCopy text="Flow helps you centralize your product, sales, and user data - all in one simple, real-time dashboard built for growing businesses." /></p>
          <p className='text-muted-foreground text-sm'>
            <FlowCopy text='Contact: Professor Hong' />{' '}
            <a className='text-foreground hover:underline' href='mailto:672250123@qq.com'>
              672250123@qq.com
            </a>
          </p>
          <Separator className='w-35!' />
        </div>
        <div className='col-span-full grid grid-cols-2 gap-6 sm:grid-cols-4 lg:col-span-4 lg:gap-8'>
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
              <li>
                <Link href='/tutorial' className='hover:text-foreground transition-colors duration-300'>
                  <FlowCopy text="Blog" /></Link>
              </li>
            </ul>
          </div>
          <div className='flex flex-col gap-5'>
            <div className='text-lg font-medium'><FlowCopy text="Help" /></div>
            <ul className='text-muted-foreground space-y-3'>
              <li>
                <Link href='/projects' className='hover:text-foreground transition-colors duration-300'>
                  <FlowCopy text="Customer Support" /></Link>
              </li>
              <li>
                <Link href='/projects' className='hover:text-foreground transition-colors duration-300'>
                  <FlowCopy text="Delivery Details" /></Link>
              </li>
              <li>
                <Link href='/projects' className='hover:text-foreground transition-colors duration-300'>
                  <FlowCopy text="Terms & Conditions" /></Link>
              </li>
              <li>
                <Link href='/projects' className='hover:text-foreground transition-colors duration-300'>
                  <FlowCopy text="Privacy Policy" /></Link>
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
      </div>

      <Separator />

      <div className='mx-auto flex max-w-7xl flex-col items-center justify-center gap-2 px-4 py-6 sm:px-6'>
        <p className='text-muted-foreground text-center text-balance'>
          {`©${new Date().getFullYear()}`}{' '}
          <Link className='text-foreground font-medium hover:underline' href='/#home'>
            <FlowCopy text="Flow" /></Link>{' '}
          <FlowCopy text="All rights reserved | Built to empower product teams worldwide." /></p>
        <div className='text-muted-foreground flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm'>
          <a
            className='transition-colors hover:text-foreground hover:underline'
            href='https://beian.miit.gov.cn/'
            target='_blank'
            rel='noopener noreferrer'
          >
            闽ICP备2026024395号
          </a>
          <a
            className='transition-colors hover:text-foreground hover:underline'
            href='https://beian.mps.gov.cn/#/query/webSearch?code=35010402351938'
            target='_blank'
            rel='noopener noreferrer'
          >
            闽公网安备35010402351938号
          </a>
        </div>
      </div>
    </footer>
  )
}

export default Footer
