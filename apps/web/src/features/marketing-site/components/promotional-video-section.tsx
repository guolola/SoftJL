// Defers video loading until first open, then retains the player and its buffered media.
'use client'

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlayIcon, XIcon } from 'lucide-react'

import { FlowCopy, flowText } from '@/features/marketing-site/model/flow-copy'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog'
import { VideoPlayer } from '@/shared/ui/video-player'

export function PromotionalVideoSection() {
  useTranslation()
  const [open, setOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  function handleOpenChange(nextOpen: boolean) {
    // Keep the same media element and source so reopening can reuse buffered data.
    if (nextOpen) {
      setHasOpened(true)
      // The first mount uses autoplay; later opens resume from the user gesture.
      void videoRef.current?.play().catch(() => { /* Native controls remain available if playback is blocked. */ })
    } else {
      videoRef.current?.pause()
    }
    setOpen(nextOpen)
  }

  return (
    <section id='product-video' aria-labelledby='product-video-title' className='px-4 py-8 sm:px-6 sm:py-16 lg:px-8 lg:py-24'>
      <div className='mx-auto max-w-4xl space-y-6 sm:space-y-8'>
        <div className='space-y-4 text-center'>
          <p className='text-primary text-sm font-medium uppercase'><FlowCopy text='Product video' /></p>
          <h2 id='product-video-title' className='text-2xl font-semibold md:text-3xl lg:text-4xl'>
            <FlowCopy text='See the platform in action' />
          </h2>
          <p className='text-muted-foreground mx-auto max-w-2xl text-base sm:text-lg'>
            <FlowCopy text='Watch our promotional video to get to know the platform.' />
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <div className='flex justify-center'>
            <DialogTrigger render={<Button size='lg' className='rounded-full px-6' />}>
              <PlayIcon aria-hidden='true' />
              <FlowCopy text='Watch promotional video' />
            </DialogTrigger>
          </div>
          {hasOpened && (
            <DialogContent keepMounted showCloseButton={false} className='max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:max-w-5xl sm:p-6'>
              <DialogHeader className='pr-10'>
                <DialogTitle><FlowCopy text='Platform promotional video' /></DialogTitle>
                <DialogDescription><FlowCopy text='Watch our promotional video to get to know the platform.' /></DialogDescription>
              </DialogHeader>
              <DialogClose render={<Button variant='ghost' size='icon-sm' className='absolute top-3 right-3 sm:top-4 sm:right-4' />} aria-label={flowText('Close video')}>
                <XIcon aria-hidden='true' />
              </DialogClose>
              <VideoPlayer
                ref={videoRef}
                src='https://tuolola.oss-cn-chengdu.aliyuncs.com/video/bilibili.mp4'
                title={flowText('Platform promotional video')}
                autoPlay
                preload={open ? 'metadata' : 'none'}
                className='rounded-xl'
              />
            </DialogContent>
          )}
        </Dialog>
      </div>
    </section>
  )
}
