// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BriefcaseBusinessIcon,
  GraduationCapIcon,
  PaintbrushIcon,
  PlusIcon,
  ThumbsUpIcon,
  UserIcon,
  UsersRoundIcon,
  ZapIcon
} from 'lucide-react'

import { Avatar, AvatarFallback } from '@/features/marketing-site/template/components/ui/avatar'
import { Badge } from '@/features/marketing-site/template/components/ui/badge'
import { Card, CardContent } from '@/features/marketing-site/template/components/ui/card'
import { Marquee } from '@/features/marketing-site/template/components/ui/marquee'
import { MotionPreset } from '@/features/marketing-site/template/components/ui/motion-preset'
import { Magnetic } from '@/features/marketing-site/template/components/ui/magnet-effect'

import { cn } from '@/shared/ui/utils'
import { ProductLogo } from '@/shared/ui/product-logo'

import StatCard from '@/features/marketing-site/template/components/blocks/features/stat-card'
import GoalAndTargetCard from '@/features/marketing-site/template/components/blocks/features/goal-and-target-card'
import SalesGrowthCard from '@/features/marketing-site/template/components/blocks/features/sales-growth-card'
import TargetVisibilityRippleBg from '@/features/marketing-site/template/components/blocks/features/target-visibility-ripple-bg'
import RegularUpdatesCard from '@/features/marketing-site/template/components/blocks/features/regular-updates-card'

const visitorData = [
  {
    product: 'Desktop',
    percentage: 28,
    amount: 23.82,
    trend: 'up',
    heightClass: 'h-[28%]',
    color: 'bg-primary'
  },
  {
    product: 'Tablet',
    percentage: 78,
    amount: 13.61,
    trend: 'down',
    heightClass: 'h-[78%]',
    color: 'bg-secondary'
  },
  {
    product: 'Mobile',
    percentage: 32,
    amount: 47.14,
    trend: 'up',
    heightClass: 'h-[32%]',
    color: 'bg-primary/60'
  }
]

const Features = () => {
  return (
    <section id='features' className='py-8 sm:py-16 lg:py-24'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <MotionPreset
          fade
          slide={{ direction: 'down', offset: 50 }}
          blur
          transition={{ duration: 0.5 }}
          className='mb-12 space-y-4 text-center sm:mb-16 lg:mb-24'
        >
          <p className='text-primary text-sm font-medium uppercase'><FlowCopy text="Features" /></p>

          <h2 className='text-2xl font-semibold md:text-3xl lg:text-4xl'><FlowCopy text="Powerful Features, Simple to Use" /></h2>

          <p className='text-muted-foreground text-xl'>
            <FlowCopy text="Everything you need to manage sales, track growth, and stay focused-without the clutter." /></p>
        </MotionPreset>

        <div className='grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3'>
          {/* Column 1 */}
          <div className='flex flex-col gap-6'>
            {/* Product Reach Card */}
            <MotionPreset fade slide={{ direction: 'down', offset: 35 }} transition={{ duration: 0.5 }}>
              <Card className='gap-26.5 shadow-none'>
                <CardContent className='flex flex-col items-center gap-8'>
                  <MotionPreset
                    fade
                    slide={{ direction: 'down', offset: 35 }}
                    delay={0.15}
                    transition={{ duration: 0.5 }}
                  >
                    <StatCard
                      avatarIcon={<UsersRoundIcon className='size-4' />}
                      title='Total visitors'
                      statNumber='23.02K'
                      percentage={-6}
                    />
                  </MotionPreset>

                  <MotionPreset
                    fade
                    slide={{ direction: 'down', offset: 35 }}
                    delay={0.3}
                    transition={{ duration: 0.5 }}
                    className='relative grid w-full min-w-0 grid-cols-3 rounded-xl border px-2 py-6 sm:px-4'
                  >
                    {visitorData.map((item, index) => (
                      <div
                        key={index}
                        data-testid='feature-stage'
                        className={cn(
                          'flex min-w-0 flex-col items-center gap-2.5 border-dashed px-2 py-2 text-center sm:px-3',
                          index < visitorData.length - 1 && 'border-r'
                        )}
                      >
                        <span className='text-muted-foreground whitespace-nowrap text-sm'>{flowText(item.product)}</span>

                        <div className='text-2xl font-medium tabular-nums'>{item.percentage}%</div>
                        <div className='flex h-25 w-full items-end'>
                          <div className={cn('w-full rounded-xl', item.heightClass, item.color)}></div>
                        </div>
                        <div className='flex w-full min-w-0 items-center justify-center gap-1 sm:justify-between sm:gap-2'>
                          <span className='text-muted-foreground whitespace-nowrap text-sm tabular-nums'>{item.amount}</span>
                          {item.trend === 'up' ? (
                            <ArrowUpRightIcon className='size-4 shrink-0' />
                          ) : (
                            <ArrowDownLeftIcon className='size-4 shrink-0' />
                          )}
                        </div>
                      </div>
                    ))}
                    <Magnetic
                      range={130}
                      strength={0.25}
                      className='absolute inset-x-2 -bottom-14 mx-auto max-w-full sm:left-1/2 sm:right-auto sm:w-71.5 sm:-translate-x-1/2'
                    >
                      <MotionPreset
                        fade
                        zoom
                        delay={0.75}
                        transition={{ duration: 0.5 }}
                        className='bg-card flex items-center gap-2 rounded-xl border p-4 shadow-lg'
                      >
                        <Avatar className='size-9.5 shadow-md after:border-0'>
                          <AvatarFallback className='bg-primary/10 text-primary shrink-0'>
                            <ThumbsUpIcon className='size-4.5' />
                          </AvatarFallback>
                        </Avatar>
                        <p className='text-muted-foreground text-xs'>
                          <FlowCopy text="User are improved by" /><span className='text-card-foreground'>32%</span> <FlowCopy text="than last month and product reached to 2,432 new users" /></p>
                      </MotionPreset>
                    </Magnetic>
                  </MotionPreset>
                </CardContent>
                <CardContent className='flex flex-col gap-4'>
                  <MotionPreset
                    component='h5'
                    fade
                    slide={{ direction: 'down', offset: 35 }}
                    delay={0.45}
                    transition={{ duration: 0.5 }}
                    className='text-2xl font-semibold'
                  >
                    <FlowCopy text="Product reach" /></MotionPreset>
                  <MotionPreset
                    component='p'
                    fade
                    slide={{ direction: 'down', offset: 35 }}
                    delay={0.6}
                    transition={{ duration: 0.5 }}
                    className='text-muted-foreground text-base'
                  >
                    <FlowCopy text="See how many people discover and engage with your product visitors, views and conversion signals at a glance." /></MotionPreset>
                </CardContent>
              </Card>
            </MotionPreset>

            {/* Targeted Visibility Card */}
            <MotionPreset
              fade
              slide={{ direction: 'down', offset: 35 }}
              delay={0.9}
              transition={{ duration: 0.5 }}
              className='h-full'
            >
              <Card className='h-full justify-between gap-0 pt-0 shadow-none'>
                <MotionPreset
                  fade
                  slide={{ direction: 'down', offset: 35 }}
                  delay={1.05}
                  transition={{ duration: 0.5 }}
                  className='relative flex h-full items-center justify-center'
                >
                  <TargetVisibilityRippleBg className='text-border pointer-events-none size-45 select-none' />

                  <div className='absolute top-1/2 -translate-y-1/2'>
                    <Avatar className='size-16 rounded-full shadow-lg after:rounded-full'>
                      <AvatarFallback className='bg-background text-primary shrink-0'>
                        <UserIcon className='size-8 stroke-1' />
                      </AvatarFallback>
                    </Avatar>
                    <Badge className='absolute top-0 right-0 size-5 rounded-full px-1'>
                      <PlusIcon className='size-2.5' />
                    </Badge>
                  </div>

                  <MotionPreset
                    fade
                    className='absolute top-8 left-15 -rotate-5'
                    motionProps={{
                      animate: {
                        y: [0, -10, 0],
                        opacity: 1
                      },
                      transition: {
                        y: {
                          duration: 2,
                          repeat: Infinity,
                          ease: 'easeOut'
                        },
                        opacity: {
                          duration: 0.5,
                          delay: 1.2
                        }
                      }
                    }}
                  >
                    <Badge className='bg-background text-foreground border-border h-auto gap-2.5 px-3 py-1.5 transition-shadow duration-200 hover:shadow-sm'>
                      <ZapIcon className='size-3.5' />
                      <FlowCopy text="Athlete" /></Badge>
                  </MotionPreset>

                  <MotionPreset
                    fade
                    className='absolute bottom-10 left-10 rotate-5'
                    motionProps={{
                      animate: {
                        y: [0, -9, 0],
                        opacity: 1
                      },
                      transition: {
                        y: {
                          duration: 1.9,
                          repeat: Infinity,
                          ease: 'easeOut'
                        },
                        opacity: {
                          duration: 0.5,
                          delay: 1.35
                        }
                      }
                    }}
                  >
                    <Badge className='bg-background text-foreground border-border h-auto gap-2.5 px-3 py-1.5 transition-shadow duration-200 hover:shadow-sm'>
                      <PaintbrushIcon className='size-3.5' />
                      <FlowCopy text="Artists" /></Badge>
                  </MotionPreset>

                  <MotionPreset
                    fade
                    className='absolute top-8 right-5 -rotate-10'
                    motionProps={{
                      animate: {
                        y: [0, -10, 0],
                        opacity: 1
                      },
                      transition: {
                        y: {
                          duration: 2.1,
                          repeat: Infinity,
                          ease: 'easeOut'
                        },
                        opacity: {
                          duration: 0.5,
                          delay: 1.5
                        }
                      }
                    }}
                  >
                    <Badge className='bg-background text-foreground border-border h-auto gap-2.5 px-3 py-1.5 transition-shadow duration-200 hover:shadow-sm'>
                      <BriefcaseBusinessIcon className='size-3.5' />
                      <FlowCopy text="Professionals" /></Badge>
                  </MotionPreset>

                  <MotionPreset
                    fade
                    className='absolute right-12 bottom-10 rotate-10'
                    motionProps={{
                      animate: {
                        y: [0, -8, 0],
                        opacity: 1
                      },
                      transition: {
                        y: {
                          duration: 1.8,
                          repeat: Infinity,
                          ease: 'easeOut'
                        },
                        opacity: {
                          duration: 0.5,
                          delay: 1.65
                        }
                      }
                    }}
                  >
                    <Badge className='bg-background text-foreground border-border h-auto gap-2.5 px-3 py-1.5 transition-shadow duration-200 hover:shadow-sm'>
                      <GraduationCapIcon className='size-3.5' />
                      <FlowCopy text="Student" /></Badge>
                  </MotionPreset>
                </MotionPreset>

                <CardContent className='flex flex-col gap-4'>
                  <MotionPreset
                    component='h5'
                    fade
                    slide={{ direction: 'down', offset: 35 }}
                    delay={1.8}
                    inView={false}
                    transition={{ duration: 0.5 }}
                    className='text-2xl font-semibold'
                  >
                    <FlowCopy text="Targeted Visibility" /></MotionPreset>

                  <MotionPreset
                    component='p'
                    fade
                    slide={{ direction: 'down', offset: 35 }}
                    delay={1.95}
                    inView={false}
                    transition={{ duration: 0.5 }}
                    className='text-muted-foreground text-base'
                  >
                    <FlowCopy text="Show your product only to selected customers, segments or regions tiers for precise marketing." /></MotionPreset>
                </CardContent>
              </Card>
            </MotionPreset>
          </div>

          {/* Column 2 */}
          <div className='flex h-full flex-col gap-6'>
            {/* Goals & Targets Card */}
            <MotionPreset fade slide={{ direction: 'down', offset: 35 }} transition={{ duration: 0.5 }}>
              <GoalAndTargetCard />
            </MotionPreset>

            {/* Sales & Growth Card */}
            <MotionPreset
              fade
              slide={{ direction: 'down', offset: 35 }}
              delay={0.6}
              transition={{ duration: 0.5 }}
              className='grow'
            >
              <SalesGrowthCard />
            </MotionPreset>
          </div>

          {/* Column 3 */}
          <div className='flex flex-col gap-6 md:max-xl:col-span-2'>
            {/* Regular Updates Card */}
            <MotionPreset
              fade
              slide={{ direction: 'down', offset: 35 }}
              transition={{ duration: 0.5 }}
              className='flex-1'
            >
              <RegularUpdatesCard />
            </MotionPreset>
            {/* Customer Payments Card */}
            <MotionPreset
              fade
              slide={{ direction: 'down', offset: 35 }}
              delay={0.6}
              transition={{ duration: 0.5 }}
              className='flex-1'
            >
              <Card className='h-full justify-between shadow-none'>
                <MotionPreset
                  fade
                  slide={{ direction: 'down', offset: 35 }}
                  delay={0.75}
                  transition={{ duration: 0.5 }}
                  className='flex flex-col gap-1'
                >
                  <Marquee pauseOnHover reverse duration={30} gap={0.5} className='px-2 py-1.5'>
                    <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                      <Avatar className='size-9.5 rounded-[12px] after:border-0'>
                        <ProductLogo className='size-full' />
                      </Avatar>
                      <div className='flex flex-1 flex-col items-start gap-0.5'>
                        <span className='text-muted-foreground text-xs font-light'>09:15</span>
                        <span className='text-sm'><FlowCopy text="Riley Smith" /></span>
                      </div>
                      <span className='text-green-600 dark:text-green-400'><FlowCopy text="$2,000" /></span>
                    </div>

                    <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                      <Avatar className='size-9.5 rounded-[12px] after:border-0'>
                        <ProductLogo className='size-full' />
                      </Avatar>
                      <div className='flex flex-1 flex-col items-start gap-0.5'>
                        <span className='text-muted-foreground text-xs font-light'>11:45</span>
                        <span className='text-sm'><FlowCopy text="Taylor Morgan" /></span>
                      </div>
                      <span className='text-green-600 dark:text-green-400'><FlowCopy text="$2,200" /></span>
                    </div>

                    <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                      <Avatar className='size-9.5 rounded-[12px] after:border-0'>
                        <ProductLogo className='size-full' />
                      </Avatar>
                      <div className='flex flex-1 flex-col items-start gap-0.5'>
                        <span className='text-muted-foreground text-xs font-light'>14:45</span>
                        <span className='text-sm'><FlowCopy text="Alex Thomas" /></span>
                      </div>
                      <span className='text-green-600 dark:text-green-400'><FlowCopy text="$1,500" /></span>
                    </div>
                  </Marquee>

                  <Marquee pauseOnHover duration={30} gap={0.5} className='px-2 py-1.5'>
                    <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                      <Avatar className='size-9.5 rounded-[12px] after:border-0'>
                        <ProductLogo className='size-full' />
                      </Avatar>
                      <div className='flex flex-1 flex-col items-start gap-0.5'>
                        <span className='text-muted-foreground text-xs font-light'>19:15</span>
                        <span className='text-sm'><FlowCopy text="Jamie Parker" /></span>
                      </div>
                      <span className='text-green-600 dark:text-green-400'><FlowCopy text="$800" /></span>
                    </div>

                    <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                      <Avatar className='size-9.5 rounded-[12px] after:border-0'>
                        <ProductLogo className='size-full' />
                      </Avatar>
                      <div className='flex flex-1 flex-col items-start gap-0.5'>
                        <span className='text-muted-foreground text-xs font-light'>18:30</span>
                        <span className='text-sm'><FlowCopy text="Casey Reynolds" /></span>
                      </div>
                      <span className='text-green-600 dark:text-green-400'><FlowCopy text="$750" /></span>
                    </div>

                    <div className='flex w-58 items-center gap-3 rounded-xl border py-1.5 pr-3 pl-2 hover:shadow-md'>
                      <Avatar className='size-9.5 rounded-[12px] after:border-0'>
                        <ProductLogo className='size-full' />
                      </Avatar>
                      <div className='flex flex-1 flex-col items-start gap-0.5'>
                        <span className='text-muted-foreground text-xs font-light'>09:15</span>
                        <span className='text-sm'><FlowCopy text="Jordan Lee" /></span>
                      </div>
                      <span className='text-green-600 dark:text-green-400'><FlowCopy text="$3,250" /></span>
                    </div>
                  </Marquee>
                </MotionPreset>

                <CardContent className='flex flex-col gap-4'>
                  <MotionPreset
                    component='h5'
                    fade
                    slide={{ direction: 'down', offset: 35 }}
                    delay={0.9}
                    inView={false}
                    transition={{ duration: 0.5 }}
                    className='text-2xl font-semibold'
                  >
                    <FlowCopy text="Customer Payments" /></MotionPreset>

                  <MotionPreset
                    component='p'
                    fade
                    slide={{ direction: 'down', offset: 35 }}
                    delay={1.05}
                    inView={false}
                    transition={{ duration: 0.5 }}
                    className='text-muted-foreground text-base'
                  >
                    <FlowCopy text="Track who paid, how much, and the payment status — one clear ledger for sales, refunds and reconciliations." /></MotionPreset>
                </CardContent>
              </Card>
            </MotionPreset>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Features
