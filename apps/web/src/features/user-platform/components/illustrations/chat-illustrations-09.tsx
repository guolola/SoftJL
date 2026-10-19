// Adapts the supplied chat-illustrations-09 animation for a decorative project mode preview.
'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Avatar, AvatarBadge, AvatarFallback } from '../../../../shared/ui/avatar'
import { ShimmerSkeleton } from './shimmer-skeleton'
import { OrderUseCasePreview } from './order-use-case-preview'
import { OrderClassPreview } from './order-class-preview'

import { cn } from '../../../../shared/ui/utils'
import { MessagesSquareIcon, RefreshCwIcon, EyeIcon, ArrowUpIcon } from 'lucide-react'

const GENERATE_START_DELAY = 500
const GENERATE_DURATION = 1800
const RESULT_REVEAL_DELAY = 420
const ACTIONS_DELAY = 300
const DONE_HOLD = 2400
const RESET_FADE_DURATION = 450
const LOOP_RESET_DELAY = 700
const ITEM_TRANSITION = { duration: 0.4, ease: 'easeOut' as const }
const RESULTS = [
  { kind: 'usecase', Preview: OrderUseCasePreview },
  { kind: 'class', Preview: OrderClassPreview },
] as const

type Phase = 'prompt' | 'generating' | 'revealing' | 'done' | 'resetting'

const ChatIllustrations09 = () => {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('prompt')
  const [resolvedCount, setResolvedCount] = useState(0)

  // Stop phase timers for reduced motion; show the completed artwork instead.
  useEffect(() => {
    if (reducedMotion) return
    if (phase === 'prompt') {
      const timer = setTimeout(() => setPhase('generating'), GENERATE_START_DELAY)

      return () => clearTimeout(timer)
    }

    if (phase === 'generating') {
      const timer = setTimeout(() => setPhase('revealing'), GENERATE_DURATION)

      return () => clearTimeout(timer)
    }
  }, [phase, reducedMotion])

  useEffect(() => {
    if (reducedMotion) return
    if (phase !== 'revealing') return

    if (resolvedCount >= RESULTS.length) {
      const timer = setTimeout(() => setPhase('done'), ACTIONS_DELAY)

      return () => clearTimeout(timer)
    }

    const timer = setTimeout(() => setResolvedCount(count => count + 1), RESULT_REVEAL_DELAY)

    return () => clearTimeout(timer)
  }, [phase, resolvedCount, reducedMotion])

  useEffect(() => {
    if (reducedMotion) return
    if (phase === 'done') {
      const timer = setTimeout(() => setPhase('resetting'), DONE_HOLD)

      return () => clearTimeout(timer)
    }

    if (phase === 'resetting') {
      const timer = setTimeout(() => {
        setResolvedCount(0)
        setPhase('prompt')
      }, RESET_FADE_DURATION + LOOP_RESET_DELAY)

      return () => clearTimeout(timer)
    }
  }, [phase, reducedMotion])

  const displayPhase = reducedMotion ? 'done' : phase
  const showGrid = reducedMotion || phase === 'generating' || phase === 'revealing' || phase === 'done'

  return (
    <div className='relative isolate inline-flex h-fit items-center justify-center self-start'>
      <div
        aria-hidden='true'
        className='border-foreground/10 bg-muted/40 absolute -inset-2 -z-10 rounded-3xl border backdrop-blur-sm'
      />

      <div className='bg-card relative w-75 divide-y overflow-hidden rounded-2xl border shadow-md md:w-70 lg:w-80'>
        <div className='flex items-center gap-3 px-4 py-3'>
          <Avatar className='ring-border ring-2'>
            <AvatarFallback className='bg-muted text-muted-foreground'>
              <MessagesSquareIcon className='size-4' />
            </AvatarFallback>
            <AvatarBadge className='ring-background bg-primary' />
          </Avatar>
          <div>
            <p className='text-sm font-semibold'>{t('projects.createForm.illustration.chat.title')}</p>
            <p className='text-primary text-xs'>{t(`projects.createForm.illustration.chat.${displayPhase === 'generating' || displayPhase === 'revealing' ? 'generating' : displayPhase === 'done' ? 'done' : 'ready'}`)}</p>
          </div>
        </div>

        <div
          className={cn(
            'flex h-60 flex-col justify-end gap-2 overflow-hidden p-3 transition-opacity duration-450',
            displayPhase === 'resetting' && 'opacity-0'
          )}
        >
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={ITEM_TRANSITION}
            className='flex flex-col items-end gap-1'
          >
            <div className='bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-br-sm px-3 py-2 text-xs'>
              {t('projects.createForm.illustration.chat.prompt')}
            </div>
          </motion.div>

          {showGrid && (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={ITEM_TRANSITION}
              className='flex flex-col gap-1.5'
            >
              {displayPhase === 'generating' && (
                <div className='flex items-center gap-1.5'>
                  <motion.span
                    className='bg-foreground/60 size-1.5 rounded-full'
                    animate={{ scale: [0.75, 1, 0.75], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <span className='text-muted-foreground text-[10px]'>{t('projects.createForm.illustration.chat.generating')}</span>
                </div>
              )}

              <div className='grid grid-cols-2 gap-2'>
                {RESULTS.map(({ kind, Preview }, index) => {
                  const resolved = reducedMotion || index < resolvedCount
                  return (
                    <div key={kind} className='relative h-32 overflow-hidden rounded-lg border bg-muted/20'>
                      {!resolved && <ShimmerSkeleton className='absolute inset-0' />}
                      <AnimatePresence>
                        {resolved && (
                          <motion.div
                            initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.35, ease: 'easeOut' }}
                            className='absolute inset-0 flex flex-col'
                          >
                            <div className='min-h-0 flex-1'><Preview /></div>
                            <span className='bg-card block h-4 border-t text-center text-[9px] leading-4'>{t(`projects.createForm.illustration.diagram.${kind}`)}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}

          {displayPhase === 'done' && (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className='flex items-center gap-1.5'
            >
              <span className='inline-flex items-center border h-6 gap-1 rounded-full px-2 text-[10px]'>
                <RefreshCwIcon className='size-2.5' />
                {t('projects.createForm.illustration.chat.regenerate')}
              </span>
              <span className='inline-flex items-center border h-6 gap-1 rounded-full px-2 text-[10px]'>
                <EyeIcon className='size-2.5' />
                {t('projects.createForm.illustration.chat.viewModel')}
              </span>
            </motion.div>
          )}
        </div>

        <div className='flex items-center gap-2 p-3'>
          <span className='bg-muted text-muted-foreground flex h-9 flex-1 items-center rounded-full px-4 text-xs'>{t('projects.createForm.illustration.chat.input')}</span>
          <span
            className='flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 size-9 shrink-0 rounded-full'
          >
            <ArrowUpIcon className='size-4' />
          </span>
        </div>
      </div>
    </div>
  )
}

export default ChatIllustrations09
