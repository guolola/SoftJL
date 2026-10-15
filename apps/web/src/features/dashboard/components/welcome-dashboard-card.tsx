// Applies Comet perspective only during the dashboard welcome, preserving real card content and state.
'use client'

import { cloneElement, type ReactElement } from 'react'
import { CometCard } from '@/shared/ui/aceternity/comet-card'
import { cn } from '@/shared/ui/utils'
import type { WelcomePhase } from '../hooks/use-welcome-scene'
import styles from './welcome-dashboard-card.module.css'

type Props = {
  card: ReactElement<{ className?: string }>
  index: number
  phase: WelcomePhase
  reducedMotion: boolean
}

const REST_POSITIONS = [
  { x: .45, y: .32 }, { x: -.3, y: -.4 }, { x: -.45, y: .32 },
  { x: .5, y: -.28 }, { x: -.5, y: .28 }, { x: .35, y: -.45 },
  { x: -.42, y: -.34 }, { x: .42, y: -.34 },
]

export function WelcomeDashboardCard({ card, index, phase, reducedMotion }: Props) {
  const floating = phase === 'floating' && !reducedMotion
  const locked = phase !== 'settled'
  // During return, the source springs can ease toward zero. Once settled, all hover effects are off.
  const effectDisabled = reducedMotion || phase === 'settled' || phase === 'preparing'
  const content = (
    <div className={styles.businessContent} data-welcome-business inert={locked || undefined}>
      {cloneElement(card, { className: 'h-full min-w-0' })}
    </div>
  )
  return (
    <div className={cn(card.props.className, styles.outer)} data-welcome-card={index}
      data-welcome-effect='comet-card' data-card-phase={phase}>
      <CometCard disabled={effectDisabled} restPosition={floating ? REST_POSITIONS[index] : undefined} className={styles.comet}>
        {content}
      </CometCard>
    </div>
  )
}
