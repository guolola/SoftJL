// Owns the real dashboard's welcome animation and restores shell interaction when cards settle.
'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { animate } from 'motion/react'
import { buildWelcomeLayout, floatingPose, poseTransform, REST_POSE, returningPose, type FloatingCard, type WelcomePose } from '../lib/welcome-layout'

export type WelcomePhase = 'preparing' | 'floating' | 'returning' | 'settled'
const OWNED_STYLES = ['transform', 'transform-origin', 'opacity', 'box-shadow', 'z-index', 'will-change'] as const
type CardState = { element: HTMLElement; saved: string[]; pose: WelcomePose; floating?: FloatingCard }

export function useWelcomeScene({ enabled = true, onComplete }: { enabled?: boolean; onComplete?: () => void } = {}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<WelcomePhase>(enabled ? 'preparing' : 'settled')
  const [reducedMotion, setReducedMotion] = useState(false)
  const phaseRef = useRef<WelcomePhase>(enabled ? 'preparing' : 'settled')
  const completeRef = useRef(onComplete)
  completeRef.current = onComplete
  const confirmRef = useRef<() => void>(() => {})

  useLayoutEffect(() => {
    if (!enabled) return
    const stage = stageRef.current
    const grid = gridRef.current
    if (!stage || !grid) return
    const elements = Array.from(grid.querySelectorAll<HTMLElement>('[data-testid="dashboard-06-grid"] > [data-welcome-card]'))
    const cards: CardState[] = elements.map(element => ({ element, saved: OWNED_STYLES.map(key => element.style.getPropertyValue(key)), pose: { ...REST_POSE } }))
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduce = media.matches
    let disposed = false
    let frame = 0
    let layoutFrame = 0
    let returnAnimation: ReturnType<typeof animate> | undefined
    let viewport = { width: 0, height: 0 }
    let startedAt = 0
    const overflowBefore = new Map<HTMLElement, string>()
    const heightBefore = stage.style.getPropertyValue('--welcome-height')
    const unlockShell = () => {
      overflowBefore.forEach((value, element) => { element.style.overflow = value })
      overflowBefore.clear()
      if (heightBefore) stage.style.setProperty('--welcome-height', heightBefore)
      else stage.style.removeProperty('--welcome-height')
    }
    const lockShell = () => {
      // Freeze page scrolling while the sidebar/header retain their navigation and theme controls.
      let current: HTMLElement = stage
      while (current.parentElement) {
        const parent = current.parentElement
        if (!overflowBefore.has(parent)) overflowBefore.set(parent, parent.style.overflow)
        parent.style.overflow = 'hidden'
        current = parent
      }
    }

    const transition = (next: WelcomePhase) => {
      phaseRef.current = next
      if (!disposed) setPhase(next)
    }
    const restore = () => cards.forEach(card => {
      OWNED_STYLES.forEach((key, index) => {
        const value = card.saved[index]
        if (value) card.element.style.setProperty(key, value)
        else card.element.style.removeProperty(key)
      })
      delete card.element.dataset.welcomeDepth
    })
    const draw = (card: CardState, pose: WelcomePose) => {
      card.pose = pose
      card.element.style.transform = reduce ? '' : poseTransform(pose)
      card.element.style.opacity = String(pose.opacity)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(layoutFrame)
      returnAnimation?.stop()
      returnAnimation = undefined
    }
    const settle = () => {
      if (disposed) return
      stop()
      restore()
      unlockShell()
      completeRef.current?.()
      transition('settled')
    }
    const tick = (now: number) => {
      if (disposed || phaseRef.current !== 'floating' || reduce) return
      // Only idle drift belongs here. The imported Aceternity components own all pointer tilt/glare.
      cards.forEach(card => {
        if (card.floating) draw(card, floatingPose(card.floating, (now - startedAt) / 1000))
      })
      frame = requestAnimationFrame(tick)
    }
    const measure = () => {
      if (disposed || phaseRef.current === 'settled' || phaseRef.current === 'returning') return
      cancelAnimationFrame(frame)
      restore()
      stage.style.setProperty('--welcome-height', `${Math.max(360, window.innerHeight - stage.getBoundingClientRect().top)}px`)
      const bounds = stage.getBoundingClientRect()
      viewport = { width: bounds.width, height: bounds.height }
      if (bounds.width <= 0 || bounds.height <= 0) return
      const rects = cards.map(({ element }) => {
        const rect = element.getBoundingClientRect()
        return { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height }
      })
      const layout = buildWelcomeLayout(viewport, rects)
      cards.forEach((card, index) => {
        card.floating = layout[index]
        card.element.style.transformOrigin = 'center center'
        if (reduce) {
          draw(card, { ...REST_POSE, opacity: .18 })
        } else if (card.floating) {
          card.element.dataset.welcomeDepth = String(card.floating.depth)
          card.element.style.willChange = 'transform'
          card.element.style.zIndex = String(card.floating.depth + 1)
          draw(card, floatingPose(card.floating, (performance.now() - startedAt) / 1000))
        } else {
          draw(card, { ...REST_POSE, opacity: 0 })
        }
      })
      transition('floating')
      if (!reduce) frame = requestAnimationFrame(tick)
    }
    const scheduleMeasure = () => {
      if (phaseRef.current === 'settled') return
      // A viewport change mid-return ends at the new natural grid instead of an obsolete destination.
      if (phaseRef.current === 'returning') { settle(); return }
      cancelAnimationFrame(layoutFrame)
      layoutFrame = requestAnimationFrame(measure)
    }
    const start = () => {
      stop()
      restore()
      transition('preparing')
      stage.scrollTop = 0
      if (window.scrollY) window.scrollTo({ top: 0, behavior: 'instant' })
      lockShell()
      startedAt = performance.now()
      layoutFrame = requestAnimationFrame(measure)
    }
    confirmRef.current = () => {
      // Phase ref guards same-frame clicks before React commits the returning state.
      if (phaseRef.current !== 'floating') return
      stop()
      transition('returning')
      const from = cards.map(card => ({ ...card.pose }))
      returnAnimation = animate(0, 1, {
        duration: reduce ? .2 : 1.2,
        ease: 'linear',
        onUpdate: value => cards.forEach((card, index) => {
          const progress = reduce ? value : (value * 1200 - Math.min(index, 7) * 24) / 1000
          draw(card, returningPose(from[index], progress))
        }),
        onComplete: settle,
      })
    }
    const onMotionPreference = () => {
      reduce = media.matches
      setReducedMotion(reduce)
      scheduleMeasure()
    }
    setReducedMotion(reduce)
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(stage)
    observer.observe(grid)
    window.addEventListener('resize', scheduleMeasure)
    media.addEventListener('change', onMotionPreference)
    // Font loading can change card geometry without a window resize.
    void document.fonts?.ready.then(() => { if (!disposed) scheduleMeasure() })
    start()
    return () => {
      disposed = true
      stop()
      restore()
      unlockShell()
      observer.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
      media.removeEventListener('change', onMotionPreference)
      confirmRef.current = () => {}
    }
  }, [enabled])

  const confirm = useCallback(() => confirmRef.current(), [])
  return { phase, stageRef, gridRef, confirm, reducedMotion }
}
