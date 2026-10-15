// Flow 2.0.0 template source; only runtime, content and business integration adaptations.
'use client'
import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy';

import { useEffect, useState } from 'react'

import { TrendingDownIcon, TrendingUpIcon, TriangleAlertIcon, UserPlusIcon, UsersIcon } from 'lucide-react'
import { motion } from 'motion/react'

import { Badge } from '@/features/marketing-site/template/components/ui/badge'
import { Card, CardContent } from '@/features/marketing-site/template/components/ui/card'
import { MotionPreset } from '@/features/marketing-site/template/components/ui/motion-preset'
import { NumberTicker } from '@/features/marketing-site/template/components/ui/number-ticker'

import RegularUpdatesRippleBg from '@/features/marketing-site/template/components/blocks/features/regular-updates-ripple-bg'

import Logo from '@/features/marketing-site/template/assets/svg/flow-logo'

export type NotificationCard = {
  id: string
  productName: string
  productImage: string
  productAlt: string
  percentageChange: number
  stats: {
    reach: number
    users: number
    queries: number
  }
}

const notificationsList: NotificationCard[] = [
  {
    id: '1',
    productName: 'Headset 22R',
    productImage: '/help/images/docs-documents.png',
    productAlt: 'headset',
    percentageChange: -2.5,
    stats: { reach: 2432, users: 142, queries: 36 }
  },
  {
    id: '2',
    productName: 'Dell Vision 7',
    productImage: '/help/images/docs-feasibility.png',
    productAlt: 'laptop',
    percentageChange: 5.6,
    stats: { reach: 1235, users: 138, queries: 28 }
  },
  {
    id: '3',
    productName: 'Playstation 5',
    productImage: '/help/images/docs-testing.png',
    productAlt: 'play-station',
    percentageChange: 10,
    stats: { reach: 2696, users: 169, queries: 18 }
  }
]

const RegularUpdatesCard = () => {
  const [notifications, setNotifications] = useState<NotificationCard[]>(notificationsList)
  const [activeIndex, setActiveIndex] = useState<NotificationCard>(notificationsList[0])

  useEffect(() => {
    const interval = setInterval(() => {
      setNotifications(prevCards => {
        const newArray = [...prevCards]

        setActiveIndex(newArray[newArray.length - 1])
        newArray.unshift(newArray.pop()!)

        return newArray
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  return (
    <Card className='h-full gap-12 shadow-none'>
      <MotionPreset
        fade
        slide={{ direction: 'down', offset: 35 }}
        delay={0.15}
        transition={{ duration: 0.5 }}
        className='relative flex h-full justify-center'
      >
        <div className='absolute inset-x-3.5 flex min-h-29 justify-center gap-4'>
          <div className='bg-card flex w-27 flex-col items-start gap-2.5 rounded-xl border p-3 shadow-lg'>
            <div className='grid size-9.5 place-content-center rounded-full border'>
              <UsersIcon className='size-5' />
            </div>
            <div className='space-y-1'>
              <h5 className='text-base font-medium'>
                <NumberTicker value={activeIndex.stats.reach} />
              </h5>
              <p className='text-muted-foreground text-xs'><FlowCopy text="Product Reach" /></p>
            </div>
          </div>
          <div className='bg-card flex w-27 flex-col items-start gap-2.5 rounded-xl border p-3 shadow-lg'>
            <div className='grid size-9.5 place-content-center rounded-full border'>
              <UserPlusIcon className='size-5' />
            </div>
            <div className='space-y-1'>
              <h5 className='text-base font-medium'>
                <NumberTicker value={activeIndex.stats.users} />
              </h5>
              <p className='text-muted-foreground text-xs'><FlowCopy text="New users" /></p>
            </div>
          </div>
          <div className='bg-card flex w-27 flex-col items-start gap-2.5 rounded-xl border p-3 shadow-lg'>
            <div className='grid size-9.5 place-content-center rounded-full border'>
              <TriangleAlertIcon className='size-5' />
            </div>
            <div className='space-y-1'>
              <h5 className='text-base font-medium'>
                <NumberTicker value={activeIndex.stats.queries} />
              </h5>
              <p className='text-muted-foreground text-xs'><FlowCopy text="User queries" /></p>
            </div>
          </div>
        </div>
        <RegularUpdatesRippleBg className='text-border pointer-events-none size-118 select-none' />
        <Logo className='absolute top-1/2 size-30 -translate-y-1/2' />

        {notifications.map((notification, index) => (
          <motion.div
            key={notification.id}
            className='bg-card absolute bottom-0 left-1/2 flex h-20 w-72 -translate-x-1/2 items-center justify-between rounded-xl border p-4 shadow-xl md:w-75 xl:w-72'
            style={{
              transformOrigin: 'bottom center'
            }}
            animate={{
              bottom: (index - 2) * -8,
              scale: 1 - index * 0.1,
              opacity: 1 - index * 0.25,
              zIndex: notifications.length - index
            }}
            transition={{
              duration: 0.5,
              ease: 'easeInOut'
            }}
          >
            <div className='flex flex-col gap-1'>
              <h5 className='text-xl font-semibold'>{flowText(notification.productName)}</h5>
              <Badge className='bg-primary/10 [a&]:hover:bg-primary/5 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40 text-primary focus-visible:outline-none'>
                {notification.percentageChange > 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                {notification.percentageChange}%
              </Badge>
            </div>

            <img src={notification.productImage} alt={notification.productAlt} className='size-13' />
          </motion.div>
        ))}
      </MotionPreset>

      <CardContent className='flex flex-col gap-4'>
        <MotionPreset
          component='h5'
          fade
          slide={{ direction: 'down', offset: 35 }}
          delay={0.3}
          transition={{ duration: 0.5 }}
          className='text-2xl font-semibold'
        >
          <FlowCopy text="Regular Updates" /></MotionPreset>
        <MotionPreset
          component='p'
          fade
          slide={{ direction: 'down', offset: 35 }}
          delay={0.45}
          transition={{ duration: 0.5 }}
          className='text-muted-foreground text-base'
        >
          <FlowCopy text="Get regular real-time alerts and notifications for orders, payments, and customer activity—so nothing slips through the cracks" /></MotionPreset>
      </CardContent>
    </Card>
  )
}

export default RegularUpdatesCard
