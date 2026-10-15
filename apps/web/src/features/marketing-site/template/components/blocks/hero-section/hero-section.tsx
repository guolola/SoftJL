// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';

import { useRef, useState, useEffect } from 'react'

import { ArrowUpRightIcon, CircleCheckIcon, LoaderIcon } from 'lucide-react'
import { useScroll } from 'motion/react'

import Link from '@/shared/lib/template-link'

import { Badge } from '@/features/marketing-site/template/components/ui/badge'
import { Skeleton } from '@/features/marketing-site/template/components/ui/skeleton'
import { BackgroundRippleEffect } from '@/features/marketing-site/template/components/ui/background-ripple-effect'
import { MotionPreset } from '@/features/marketing-site/template/components/ui/motion-preset'
import { PrimaryFlowButton } from '@/features/marketing-site/template/components/ui/flow-button'

import TextFlip from '@/features/marketing-site/template/components/blocks/hero-section/text-flip'

import { cn } from '@/shared/ui/utils'

import FlowLogo from '@/features/marketing-site/template/assets/svg/flow-logo'

const HeroSection = () => {
  const [scrollProgress, setScrollProgress] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start']
  })

  useEffect(() => {
    return scrollYProgress.on('change', latest => {
      setScrollProgress(latest * 100)
    })
  }, [scrollYProgress])

  return (
    <section id='home' className='relative px-4 py-8 max-sm:pb-42 sm:px-6 sm:py-16 lg:px-8 lg:py-24'>
      <BackgroundRippleEffect />
      <div className='pointer-events-none absolute inset-x-0 top-0 z-5 h-128 bg-[radial-gradient(transparent_20%,var(--background)_90%)]' />
      <div className='space-y-12 sm:space-y-16 lg:space-y-24'>
        <div className='flex flex-col items-center gap-4'>
          <MotionPreset
            fade
            slide={{ direction: 'down' }}
            transition={{ duration: 0.5 }}
            inView={false}
            className='z-10'
          >
            <Badge variant='outline' className='bg-background h-auto text-sm font-normal'>
              <FlowCopy text="Trusted by 5,000+ growing businesses" /></Badge>
          </MotionPreset>

          <MotionPreset
            fade
            slide={{ direction: 'down' }}
            transition={{ duration: 0.5 }}
            inView={false}
            delay={0.2}
            component='h1'
            className='z-10 text-center text-3xl font-semibold md:text-4xl lg:text-5xl lg:leading-[1.29167]'
          >
            <FlowCopy text="Supercharge Your Product&rsquo;s" /><TextFlip />
          </MotionPreset>

          <MotionPreset
            fade
            slide={{ direction: 'down' }}
            transition={{ duration: 0.5 }}
            inView={false}
            delay={0.4}
            component='p'
            className='text-muted-foreground z-10 max-w-156 text-center text-xl'
          >
            <FlowCopy text="Track every key metric in one clean dashboard - no code, no setup, just real-time insights that help you grow smarter." /></MotionPreset>

          <MotionPreset
            fade
            slide={{ direction: 'down' }}
            transition={{ duration: 0.5 }}
            inView={false}
            delay={0.6}
            className='z-10'
          >
            <PrimaryFlowButton asChild>
              <Link href='/projects'>
                <FlowCopy text="Start building now" /><ArrowUpRightIcon />
              </Link>
            </PrimaryFlowButton>
          </MotionPreset>
        </div>

        <MotionPreset
          ref={containerRef}
          fade
          slide={{ direction: 'down' }}
          transition={{ duration: 0.5 }}
          inView={false}
          delay={0.8}
          className='relative z-10 mb-0 flex min-h-full flex-col items-center justify-start'
        >
          <div className='bg-background aspect-512/494 w-full max-w-5xl overflow-hidden rounded-xl border p-[1.318%]'>
            <div className='flex h-full w-full overflow-hidden rounded-lg border'>
              {/* Dashboard Sidebar */}
              {scrollProgress >= 10 ? (
                <div className='h-full w-1/5 overflow-hidden border-r'>
                  <img width={256} height={1891} src='/help/images/workbench-sidebar.png' alt='Dashboard sidebar' className='h-full w-full object-cover object-top dark:hidden' />
                  <img width={256} height={1891}
                    src='/help/images/workbench-sidebar-dark.png'
                    alt='Dashboard sidebar'
                    className='hidden h-full w-full object-cover object-top dark:block'
                  />
                </div>
              ) : (
                <div className='bg-sidebar flex w-1/5 flex-col gap-[3%] border-r p-[1.215%]'>
                  <div className='flex h-[2.8%] shrink-0 items-center space-x-[2.32%]'>
                    <Skeleton className='bg-foreground/6 aspect-square h-[92.35%] rounded-full' />
                    <div className='flex h-full flex-1 flex-col justify-between'>
                      <Skeleton className='bg-foreground/6 h-[53.85%] w-2/5' />
                      <Skeleton className='bg-foreground/6 h-[33%] w-3/5' />
                    </div>
                  </div>
                  <div className='flex h-[1.508%] items-center space-x-[2.32%]'>
                    <Skeleton className='bg-foreground/6 aspect-square h-full' />
                    <Skeleton className='bg-foreground/6 h-[85.8%] w-[32%]' />
                    <Skeleton className='bg-foreground/6 ml-auto aspect-square h-full' />
                  </div>
                  <div className='h-[26.697%] space-y-[9.275%]'>
                    <Skeleton className='bg-foreground/6 h-[3.23%] w-[30%]' />
                    <div className='flex h-[5.65%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-3/5' />
                    </div>
                    <div className='flex h-[5.65%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-[48%]' />
                    </div>
                    <div className='flex h-[5.65%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-[61%]' />
                    </div>
                    <div className='flex h-[5.65%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-[63%]' />
                      <Skeleton className='bg-foreground/6 ml-auto aspect-square h-full' />
                    </div>
                    <div className='flex h-[5.65%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-[59%]' />
                    </div>
                    <div className='flex h-[5.65%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-[58%]' />
                    </div>
                    <div className='flex h-[5.65%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-[57%]' />
                    </div>
                    <div className='flex h-[5.65%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-[30%]' />
                    </div>
                  </div>
                  <div className='h-[17.009%] space-y-[9.275%]'>
                    <Skeleton className='bg-foreground/6 h-[5.07%] w-1/2' />
                    <div className='flex h-[8.87%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-3/5' />
                    </div>
                    <div className='flex h-[8.87%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-[72%]' />
                    </div>
                    <div className='flex h-[8.87%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-[42%]' />
                    </div>
                    <div className='flex h-[8.87%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-[65%]' />
                    </div>
                    <div className='flex h-[8.87%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] w-[52%]' />
                    </div>
                  </div>
                </div>
              )}

              <div className='flex min-h-0 w-4/5 flex-col'>
                {/* Dashboard Header */}
                {scrollProgress >= 10 ? (
                  <div>
                    <img width={1664} height={66} src='/help/images/workbench-header.png' alt='Header' className='block h-auto w-full dark:hidden' />
                    <img width={1664} height={66}
                      src='/help/images/workbench-header-dark.png'
                      alt='Header'
                      className='hidden h-auto w-full dark:block'
                    />
                  </div>
                ) : (
                  <div className='flex h-[3.736%] shrink-0 items-center justify-between space-x-4 border-b px-[2%]'>
                    <div className='flex h-[39.8%] w-[17.5%] items-center space-x-[2.32%]'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 h-[71.5%] flex-1' />
                    </div>
                    <div className='flex h-1/2 w-[6%] justify-between'>
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                      <Skeleton className='bg-foreground/6 aspect-square h-full' />
                    </div>
                  </div>
                )}

                {/* Dashboard KPI row */}
                <div className='p-[1.266%]'>
                  {scrollProgress >= 10 ? (
                    <MotionPreset
                      zoom={{ initialScale: 0.95 }}
                      transition={{ duration: 0.5 }}
                      inView={false}
                      className={cn('rounded-lg transition-all ease-out', {
                        'shadow-xl': scrollProgress >= 10 && scrollProgress < 37
                      })}
                    >
                      <img width={1392} height={198} src='/help/images/workbench-kpi.png' alt='工作台关键指标' className='block h-auto w-full dark:hidden' />
                      <img width={1392} height={198}
                        src='/help/images/workbench-kpi-dark.png'
                        alt='工作台关键指标'
                        className='hidden h-auto w-full dark:block'
                      />
                    </MotionPreset>
                  ) : (
                    <Skeleton className='bg-foreground/6 aspect-[1392/198]' />
                  )}
                </div>

                {/* Timeline and weekly usage */}
                <div className='grid grid-cols-5 gap-[1.266%] px-[1.266%] pb-[1.266%]'>
                  <div className='col-span-3'>
                    {scrollProgress >= 37 ? (
                      <MotionPreset
                        zoom={{ initialScale: 0.95 }}
                        transition={{ duration: 0.5 }}
                        inView={false}
                        className={cn('rounded-lg transition-all ease-out', {
                          'shadow-xl': scrollProgress >= 37 && scrollProgress < 47
                        })}
                      >
                        <img width={829} height={445} src='/help/images/workbench-timeline.png' alt='项目时间线' className='block h-auto w-full dark:hidden' />
                        <img width={829} height={445}
                          src='/help/images/workbench-timeline-dark.png'
                          alt='项目时间线'
                          className='hidden h-auto w-full dark:block'
                        />
                      </MotionPreset>
                    ) : (
                      <Skeleton className='bg-foreground/6 aspect-[829/445]' />
                    )}
                  </div>
                  <div className='col-span-2'>
                    {scrollProgress >= 37 ? (
                      <MotionPreset
                        zoom={{ initialScale: 0.95 }}
                        transition={{ duration: 0.5 }}
                        inView={false}
                        className={cn('rounded-lg transition-all ease-out', {
                          'shadow-xl': scrollProgress >= 37 && scrollProgress < 47
                        })}
                      >
                        <img width={547} height={445} src='/help/images/workbench-weekly.png' alt='每周 Token 使用量' className='block h-auto w-full dark:hidden' />
                        <img width={547} height={445}
                          src='/help/images/workbench-weekly-dark.png'
                          alt='每周 Token 使用量'
                          className='hidden h-auto w-full dark:block'
                        />
                      </MotionPreset>
                    ) : (
                      <Skeleton className='bg-foreground/6 aspect-[547/445]' />
                    )}
                  </div>
                </div>

                {/* Model usage and performance */}
                <div className='grid grid-cols-5 gap-[1.266%] px-[1.266%] pb-[1.266%]'>
                  <div className='col-span-2'>
                  {scrollProgress >= 37 ? (
                    <MotionPreset
                      zoom={{ initialScale: 0.95 }}
                      transition={{ duration: 0.5 }}
                      inView={false}
                      className={cn('rounded-lg transition-all ease-out', {
                        'shadow-xl': scrollProgress >= 37 && scrollProgress < 47
                      })}
                    >
                      <img width={547} height={454} src='/help/images/workbench-conversion.png' alt='AI 模型使用情况' className='block h-auto w-full dark:hidden' />
                      <img width={547} height={454}
                        src='/help/images/workbench-conversion-dark.png'
                        alt='AI 模型使用情况'
                        className='hidden h-auto w-full dark:block'
                      />
                    </MotionPreset>
                  ) : (
                    <Skeleton className='bg-foreground/6 aspect-[547/454]' />
                  )}
                  </div>
                  <div className='col-span-3'>
                    {scrollProgress >= 37 ? (
                      <MotionPreset
                        zoom={{ initialScale: 0.95 }}
                        transition={{ duration: 0.5 }}
                        inView={false}
                        className={cn('rounded-lg transition-all ease-out', {
                          'shadow-xl': scrollProgress >= 37 && scrollProgress < 47
                        })}
                      >
                        <img width={829} height={454} src='/help/images/workbench-performance.png' alt='项目活动概览' className='block h-auto w-full dark:hidden' />
                        <img width={829} height={454} src='/help/images/workbench-performance-dark.png' alt='项目活动概览' className='hidden h-auto w-full dark:block' />
                      </MotionPreset>
                    ) : (
                      <Skeleton className='bg-foreground/6 aspect-[829/454]' />
                    )}
                  </div>
                </div>

                {/* Dashboard Table */}
                <div className='p-[1.266%] pt-0'>
                  {scrollProgress >= 47 ? (
                    <MotionPreset
                      zoom={{ initialScale: 0.95 }}
                      transition={{ duration: 0.5 }}
                      inView={false}
                      className={cn('rounded-lg transition-all ease-out', {
                        'shadow-xl': scrollProgress >= 47 && scrollProgress < 70
                      })}
                    >
                      <img width={1392} height={516} src='/help/images/workbench-table.png' alt='项目数据表格' className='block h-auto w-full dark:hidden' />
                      <img width={1392} height={516}
                        src='/help/images/workbench-table-dark.png'
                        alt='项目数据表格'
                        className='hidden h-auto w-full dark:block'
                      />
                    </MotionPreset>
                  ) : (
                    <Skeleton className='bg-foreground/6 col-span-2 aspect-385/156' />
                  )}
                </div>

              </div>
            </div>
          </div>
        </MotionPreset>

        <MotionPreset
          fade
          slide={{ direction: 'down' }}
          transition={{ duration: 0.5 }}
          inView={false}
          delay={0.8}
          className='sticky bottom-10 z-15 flex justify-center transition-all duration-500 ease-in-out'
        >
          <div className='bg-primary text-primary-foreground mt-2 flex items-center gap-10 rounded-xl px-3.5 py-2 shadow-lg'>
            <div className='flex items-center gap-2 font-medium'>
              <FlowLogo className='size-9 object-contain drop-shadow-lg' />
              {scrollProgress < 27 && <span><FlowCopy text="Welcome to dashboard" /></span>}
              {scrollProgress >= 27 && scrollProgress < 37 && <span><FlowCopy text="Your product orders" /></span>}
              {scrollProgress >= 37 && scrollProgress < 47 && <span><FlowCopy text="Product&rsquo;s insight" /></span>}
              {scrollProgress >= 47 && <span><FlowCopy text="User payments" /></span>}
            </div>
            {scrollProgress >= 47 ? (
              <CircleCheckIcon className='size-4.5 rounded-full bg-background text-success' />
            ) : (
              <LoaderIcon className='size-4.5 animate-spin' />
            )}
          </div>
        </MotionPreset>
      </div>
    </section>
  )
}

export default HeroSection
