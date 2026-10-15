// Composes the accepted welcome over real dashboard content, after data loading and authentication.
'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { NeuralButton } from '@/shared/ui/neural-button'
import { PageContainer } from '@/shared/template/layout/page'
import { useWelcomeScene } from '../hooks/use-welcome-scene'
import { completeDashboardWelcome, needsDashboardWelcome } from '../lib/dashboard-welcome-storage'
import { WelcomeDashboardCard } from './welcome-dashboard-card'
import styles from './dashboard-welcome.module.css'

type CardRenderer = (card: ReactElement<{ className?: string }>, index: number) => ReactNode

export function DashboardWelcome({ userId, children }: {
  userId?: string
  children: (renderCard: CardRenderer, welcomeActive: boolean) => ReactNode
}) {
  const [enabled] = useState(() => needsDashboardWelcome(userId))
  const { phase, stageRef, gridRef, confirm, reducedMotion } = useWelcomeScene({
    enabled, onComplete: () => completeDashboardWelcome(userId),
  })
  const locked = phase !== 'settled'
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let focusFrame = 0
    if (locked) confirmRef.current?.focus({ preventScroll: true })
    // Focus after layout unlock so the browser has cleared inert/hidden controls and the new card geometry.
    else if (enabled) focusFrame = requestAnimationFrame(() => stageRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(focusFrame)
  }, [phase, enabled, locked, stageRef])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && phase === 'floating') {
      event.preventDefault()
      confirm()
    }
  }

  return <div ref={stageRef} className={`${styles.stage} ${locked ? styles.active : ''}`}
    role='region' aria-label='仪表盘' tabIndex={-1}
    data-testid='welcome-stage' data-welcome-phase={phase}>
    <div ref={gridRef} aria-hidden={locked || undefined}>
      <PageContainer>
        {children((card, index) => <WelcomeDashboardCard key={index} card={card} index={index} phase={phase} reducedMotion={reducedMotion} />, locked)}
      </PageContainer>
    </div>
    {locked && <div className={styles.overlay} role='dialog' aria-modal='false' aria-labelledby='workspace-welcome-title'
      aria-describedby='workspace-welcome-description' onKeyDown={onKeyDown}>
      <div className={styles.content}>
        <h1 id='workspace-welcome-title' className={styles.title} aria-label='欢迎来到工作台🎉'>
          <span>欢迎来到</span><br /><span>工作台<span className={styles.confetti}>🎉</span></span>
        </h1>
        <p id='workspace-welcome-description'>让灵感浮现，让创造从这里开始。</p>
        <NeuralButton ref={confirmRef} size='lg' className={styles.confirm} aria-disabled={phase !== 'floating'}
          reducedMotion={reducedMotion} onClick={() => { if (phase === 'floating') confirm() }}>
          确认，进入工作台<ArrowRight size={17} />
        </NeuralButton>
      </div>
    </div>}
    <span className='sr-only' role='status'>{phase === 'returning' ? '组件正在回到各自的位置。' : enabled && phase === 'settled' ? '工作台已就绪，可以开始体验。' : ''}</span>
  </div>
}
