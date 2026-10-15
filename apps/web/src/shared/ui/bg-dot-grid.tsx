// AdminCN full-navbar 1.0.0 template source; only runtime, content and business integration adaptations.
'use client'

import { useEffect, useRef } from 'react'

import { cn } from '@/shared/ui/utils'

interface DotGridProps {
  className?: string
  dotSize?: number
  gap?: number
  baseColor?: string
  activeColor?: string
  radius?: number
  displacement?: number
  maxScale?: number
}

interface Dot {
  x: number
  y: number

  offsetX: number
  offsetY: number

  targetX: number
  targetY: number

  scale: number
  targetScale: number
}

export function DotGrid({
  className,
  dotSize = 2,
  gap = 22,
  baseColor = 'var(--primary)',
  activeColor = 'var(--background)',
  radius = 140,
  displacement = 10,
  maxScale = 3
}: DotGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) return

    const ctx = canvas.getContext('2d')

    if (!ctx) return

    let animationFrame: number

    const dots: Dot[] = []

    const mouse = {
      x: -9999,
      y: -9999,

      targetX: -9999,
      targetY: -9999
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()

      const dpr = window.devicePixelRatio || 1

      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      dots.length = 0

      for (let x = gap / 2; x < rect.width; x += gap) {
        for (let y = gap / 2; y < rect.height; y += gap) {
          dots.push({
            x,
            y,

            offsetX: 0,
            offsetY: 0,

            targetX: 0,
            targetY: 0,

            scale: 1,
            targetScale: 1
          })
        }
      }
    }

    resize()

    const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor

    const resolveColor = (value: string) => {
      const varMatch = value.match(/^var\(\s*(--[^,\s)]+)(?:\s*,\s*([^)]+))?\s*\)$/)

      if (!varMatch) return value

      const [, variableName, fallback] = varMatch
      const resolved = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()

      return resolved || fallback?.trim() || value
    }

    const animate = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const resolvedBaseColor = resolveColor(baseColor)
      const resolvedActiveColor = resolveColor(activeColor)

      ctx.clearRect(0, 0, width, height)

      mouse.x = lerp(mouse.x, mouse.targetX, 0.15)
      mouse.y = lerp(mouse.y, mouse.targetY, 0.15)

      for (const dot of dots) {
        const dx = dot.x - mouse.x
        const dy = dot.y - mouse.y

        const distance = Math.sqrt(dx * dx + dy * dy)

        const influence = Math.max(0, 1 - distance / radius)

        if (influence > 0) {
          const angle = Math.atan2(dy, dx)

          dot.targetX = Math.cos(angle) * displacement * influence

          dot.targetY = Math.sin(angle) * displacement * influence

          dot.targetScale = 1 + influence * (maxScale - 1)
        } else {
          dot.targetX = 0
          dot.targetY = 0
          dot.targetScale = 1
        }

        dot.offsetX = lerp(dot.offsetX, dot.targetX, 0.12)

        dot.offsetY = lerp(dot.offsetY, dot.targetY, 0.12)

        dot.scale = lerp(dot.scale, dot.targetScale, 0.12)

        const opacity = 0.25 + influence * 0.75

        const drawX = dot.x + dot.offsetX
        const drawY = dot.y + dot.offsetY

        ctx.beginPath()

        ctx.arc(drawX, drawY, dotSize * dot.scale, 0, Math.PI * 2)

        if (influence > 0.05) {
          ctx.globalAlpha = 1
          ctx.shadowBlur = influence * 20

          ctx.shadowColor = resolvedActiveColor

          ctx.fillStyle = resolvedActiveColor
        } else {
          ctx.shadowBlur = 0
          ctx.globalAlpha = opacity
          ctx.fillStyle = resolvedBaseColor
        }

        ctx.fill()
        ctx.globalAlpha = 1
      }

      animationFrame = requestAnimationFrame(animate)
    }

    animate()

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()

      mouse.targetX = e.clientX - rect.left

      mouse.targetY = e.clientY - rect.top
    }

    const handleLeave = () => {
      mouse.targetX = -9999
      mouse.targetY = -9999
    }

    const observer = new ResizeObserver(resize)

    observer.observe(canvas)

    window.addEventListener('mousemove', handleMove)

    window.addEventListener('mouseleave', handleLeave)

    return () => {
      cancelAnimationFrame(animationFrame)

      observer.disconnect()

      window.removeEventListener('mousemove', handleMove)

      window.removeEventListener('mouseleave', handleLeave)
    }
  }, [dotSize, gap, radius, displacement, maxScale, baseColor, activeColor])

  return <canvas ref={canvasRef} className={cn('absolute inset-0 h-full w-full', className)} />
}
