// Draws the supplied orbit curves and moves software brand logos along their sampled paths.
'use client'

import { useEffect, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import type { OrbitBrandLogo } from '@/features/marketing-site/template/content/trusted-brands'
import { cn } from '@/shared/ui/utils'
import LeftLine from './hero-leftline'
import RightLine from './hero-rightline'
import { HERO_ORBIT_CENTER, HERO_ORBIT_HEIGHT, HERO_ORBIT_VISIBLE_TOP, HERO_ORBIT_WIDTH, LEFT_LINE_WIDTH, heroOrbitPaths } from './hero-orbit-paths'

const NUM_SAMPLES = 42
const FADE_IN_END = 0.07
const FADE_OUT_START = 0.85

// The time and opacity arrays must match the sampled positions in hero-orbit-paths.ts.
const TIMES = [0, FADE_IN_END, ...Array.from({ length: NUM_SAMPLES }, (_, index) => FADE_IN_END + (1 - FADE_IN_END) * ((index + 1) / NUM_SAMPLES))]
const OPACITY_FRAMES = TIMES.map((time, index) => index === 0 ? 0 : time >= FADE_OUT_START ? Math.max(0, 1 - (time - FADE_OUT_START) / (1 - FADE_OUT_START)) : 1)

function OrbitIcon({ item, size }: { item: OrbitBrandLogo; size: number }) {
  const path = heroOrbitPaths[item.pathId]
  const reduceMotion = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const opacity = useMotionValue(0)
  const startDistance = Math.hypot(HERO_ORBIT_CENTER.x - path.fromX, HERO_ORBIT_CENTER.y - path.fromY)
  const distance = useTransform([x, y], latest => {
    const [latestX, latestY] = latest as number[]
    return Math.hypot(HERO_ORBIT_CENTER.x - path.fromX - latestX, HERO_ORBIT_CENTER.y - path.fromY - latestY)
  })
  const scale = useTransform(distance, [0, startDistance * 0.5, startDistance], [0.6, 0.8, 1])

  useEffect(() => {
    if (reduceMotion) {
      // Keep icons visible on their curves when motion is disabled.
      const midpoint = Math.floor(path.dx.length / 2)
      x.set(path.dx[midpoint])
      y.set(path.dy[midpoint])
      opacity.set(1)
      return
    }
    const transition = { duration: 9.6, delay: item.delay, repeat: Infinity, ease: 'linear' as const, times: TIMES }
    const controls = [
      animate(x, [0, ...path.dx], transition),
      animate(y, [0, ...path.dy], transition),
      animate(opacity, OPACITY_FRAMES, transition)
    ]
    return () => controls.forEach(control => control.stop())
  }, [item.delay, opacity, path, reduceMotion, x, y])

  return (
    <motion.div data-brand-name={item.name} style={{ position: 'absolute', left: path.fromX - size / 2, top: path.fromY - HERO_ORBIT_VISIBLE_TOP - size / 2, width: size, height: size, zIndex: 5, x, y, opacity, scale }}>
      <div className={cn('flex size-full items-center justify-center rounded-full border p-2 shadow-sm', item.lightBackground ? 'bg-white' : 'bg-card')}>
        {/* Preserve brand colors; only black-and-white marks invert for contrast in dark mode. */}
        <img src={item.image} alt='' width={size} height={size} className={cn('size-full object-contain', item.monochrome && 'dark:invert')} />
      </div>
    </motion.div>
  )
}

export default function OrbitConnections({ items, centerImage }: { items: OrbitBrandLogo[]; centerImage: ReactNode }) {
  return (
    <div aria-hidden='true' style={{ position: 'relative', width: HERO_ORBIT_WIDTH, height: HERO_ORBIT_HEIGHT, margin: '0 auto' }}>
      <div style={{ position: 'absolute', left: 0, top: -HERO_ORBIT_VISIBLE_TOP, pointerEvents: 'none' }}><LeftLine /></div>
      <div style={{ position: 'absolute', left: LEFT_LINE_WIDTH, top: -HERO_ORBIT_VISIBLE_TOP, pointerEvents: 'none' }}><RightLine /></div>
      <div style={{ position: 'absolute', left: HERO_ORBIT_CENTER.x - 50, top: HERO_ORBIT_CENTER.y - HERO_ORBIT_VISIBLE_TOP - 50, width: 100, height: 100, zIndex: 10 }}>
        {centerImage}
      </div>
      {items.map(item => <OrbitIcon key={item.pathId} item={item} size={44} />)}
    </div>
  )
}
