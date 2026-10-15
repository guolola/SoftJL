// Presents the sidebar promotion and defers media loading until the user opens it.
import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../../shared/ui/dialog';
import { VideoPlayer } from '../../../shared/ui/video-player';

export function SidebarPromotionalVideoCard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  function handleOpenChange(nextOpen: boolean) {
    // Retain the player after first use to preserve playback progress and buffered media.
    if (nextOpen) {
      setHasOpened(true);
      void videoRef.current?.play().catch(() => { /* Native controls allow manual playback. */ });
    } else {
      videoRef.current?.pause();
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div data-slot='sidebar-promotional-video-card' className='bg-background mx-1 mb-2 flex flex-col items-start gap-4 rounded-md p-4 pb-0 group-data-[collapsible=icon]:hidden'>
        <p className='text-xl font-semibold'>{t('media.promo.title')}</p>
        <p className='text-sm'>{t('media.promo.description')}</p>
        <DialogTrigger render={<Button />}>
          {t('media.promo.watch')}
        </DialogTrigger>
        <DialogTrigger aria-label={t('media.promo.play')} render={<Button variant='ghost' className='h-auto w-full self-center rounded-none p-0 hover:bg-transparent hover:opacity-80' />}>
          {/* Preserve the cutout's alpha so it blends directly into the card in every theme. */}
          <img
            src='/marketing/generated/sidebar-product-video.webp'
            alt=''
            aria-hidden='true'
            width={520}
            height={364}
            className='block h-auto w-full object-contain'
          />
        </DialogTrigger>
      </div>
      {hasOpened && (
        <DialogContent keepMounted showCloseButton={false} className='max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:max-w-5xl sm:p-6'>
          <DialogHeader className='pr-10'>
            <DialogTitle>{t('media.promo.title')}</DialogTitle>
            <DialogDescription>{t('media.promo.description')}</DialogDescription>
          </DialogHeader>
          <DialogClose render={<Button variant='ghost' size='icon-sm' className='absolute top-3 right-3 sm:top-4 sm:right-4' />} aria-label={t('media.promo.close')}>
            <X aria-hidden='true' />
          </DialogClose>
          <VideoPlayer
            ref={videoRef}
            src='https://tuolola.oss-cn-chengdu.aliyuncs.com/video/bilibili.mp4'
            title={t('media.promo.title')}
            autoPlay
            preload={open ? 'metadata' : 'none'}
            className='rounded-xl'
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
