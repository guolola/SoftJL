// Non-blocking, top-centered alerts for short-lived operation feedback.
'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, CircleAlert, TriangleAlert, X, XCircle } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/ui/utils'

export type FloatingAlertTone = 'success' | 'info' | 'warning' | 'destructive'
export type FloatingAlertInput = {
  id?: string
  title: React.ReactNode
  description?: React.ReactNode
  tone?: FloatingAlertTone
  durationMs?: number
}

type FloatingAlertListener = (alert: FloatingAlertInput) => void
type FloatingAlertOptions = Omit<FloatingAlertInput, 'title' | 'tone'>

type FloatingAlertEntry = FloatingAlertInput & { id: string; tone: FloatingAlertTone; durationMs: number }
type FloatingAlertContextValue = {
  showAlert: (alert: FloatingAlertInput) => string
  dismissAlert: (id: string) => void
}

const fallbackFloatingAlertContext: FloatingAlertContextValue = {
  showAlert: alert => alert.id ?? '',
  dismissAlert: () => undefined
}

const FloatingAlertContext = React.createContext<FloatingAlertContextValue>(fallbackFloatingAlertContext)
const floatingAlertListeners = new Set<FloatingAlertListener>()
let pendingFloatingAlerts: FloatingAlertInput[] = []

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Allows non-component workflows to publish through the same fixed alert viewport.
export function showFloatingAlert(input: FloatingAlertInput) {
  const id = input.id ?? makeId()
  const alert = { ...input, id }
  if (typeof window === 'undefined') return id
  if (floatingAlertListeners.size === 0) {
    pendingFloatingAlerts = [...pendingFloatingAlerts.filter(item => item.id !== id), alert].slice(-3)
  } else {
    floatingAlertListeners.forEach(listener => listener(alert))
  }
  return id
}

export const floatingAlert = {
  message: (title: React.ReactNode, options: FloatingAlertOptions = {}) =>
    showFloatingAlert({ ...options, title, tone: 'info' }),
  success: (title: React.ReactNode, options: FloatingAlertOptions = {}) =>
    showFloatingAlert({ ...options, title, tone: 'success' }),
  warning: (title: React.ReactNode, options: FloatingAlertOptions = {}) =>
    showFloatingAlert({ ...options, title, tone: 'warning' }),
  error: (title: React.ReactNode, options: FloatingAlertOptions = {}) =>
    showFloatingAlert({ ...options, title, tone: 'destructive' })
}

function FloatingAlertCard({ alert, onDismiss }: { alert: FloatingAlertEntry; onDismiss: () => void }) {
  const startedAt = React.useRef(Date.now())
  const remaining = React.useRef(alert.durationMs)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const hovered = React.useRef(false)
  const focused = React.useRef(false)
  const onDismissRef = React.useRef(onDismiss)
  onDismissRef.current = onDismiss

  const startTimer = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    if (hovered.current || focused.current) return
    startedAt.current = Date.now()
    timer.current = setTimeout(() => {
      timer.current = null
      onDismissRef.current()
    }, remaining.current)
  }, [])
  const pauseTimer = React.useCallback(() => {
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
  }, [])

  React.useEffect(() => {
    // Replacing an alert with the same ID starts its new display interval.
    remaining.current = alert.durationMs
    startTimer()
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [alert, startTimer])

  const Icon = alert.tone === 'success' ? CheckCircle2 : alert.tone === 'warning' ? TriangleAlert : alert.tone === 'destructive' ? XCircle : CircleAlert
  return (
    <Alert
      className={cn(
        'w-full min-w-0 items-center text-foreground shadow-xl backdrop-blur-xl [overflow-wrap:anywhere] *:[svg]:row-span-1 *:[svg]:translate-y-0',
        alert.tone === 'success' && 'border-success/45 bg-success/10 *:[svg]:text-success',
        alert.tone === 'info' && 'border-info/45 bg-info/10 *:[svg]:text-info',
        alert.tone === 'warning' && 'border-warning/45 bg-warning/10 *:[svg]:text-warning',
        alert.tone === 'destructive' && 'border-destructive/45 bg-destructive/10 *:[svg]:text-destructive'
      )}
      onMouseEnter={() => { hovered.current = true; pauseTimer() }}
      onMouseLeave={() => { hovered.current = false; startTimer() }}
      onFocusCapture={() => { focused.current = true; pauseTimer() }}
      onBlurCapture={event => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        focused.current = false
        startTimer()
      }}
    >
      <Icon aria-hidden='true' />
      <AlertTitle>{alert.title}</AlertTitle>
      {alert.description ? <AlertDescription className='col-start-2'>{alert.description}</AlertDescription> : null}
      <AlertAction className={cn(!alert.description && 'top-1/2 -translate-y-1/2')}>
        <Button type='button' variant='ghost' size='icon-xs' aria-label='关闭提示' onClick={onDismiss}>
          <X />
        </Button>
      </AlertAction>
    </Alert>
  )
}

export function FloatingAlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = React.useState<FloatingAlertEntry[]>([])
  const reduceMotion = useReducedMotion()
  const dismissAlert = React.useCallback((id: string) => setAlerts(current => current.filter(alert => alert.id !== id)), [])
  const showAlert = React.useCallback((input: FloatingAlertInput) => {
    const id = input.id ?? makeId()
    const tone = input.tone ?? 'info'
    const entry: FloatingAlertEntry = {
      ...input,
      id,
      tone,
      durationMs: input.durationMs ?? 2500
    }
    setAlerts(current => [...current.filter(alert => alert.id !== id), entry].slice(-3))
    return id
  }, [])
  const value = React.useMemo(() => ({ showAlert, dismissAlert }), [dismissAlert, showAlert])
  React.useEffect(() => {
    const listener: FloatingAlertListener = alert => showAlert(alert)
    floatingAlertListeners.add(listener)
    const pending = pendingFloatingAlerts
    pendingFloatingAlerts = []
    pending.forEach(listener)
    return () => { floatingAlertListeners.delete(listener) }
  }, [showAlert])
  const overlayPortalTarget = typeof document === 'undefined'
    ? null
    : document.querySelector<HTMLElement>('[data-slot="dialog-content"][data-open], [data-slot="drawer-content"]')
  const viewport = (
    <div className='font-sans pointer-events-none fixed inset-x-4 top-4 z-[100] mx-auto flex max-w-xl flex-col items-center gap-2 sm:top-20' aria-live='polite' aria-atomic='false'>
      <AnimatePresence initial={false} mode='popLayout'>
        {alerts.map(alert => (
          <motion.div
            key={alert.id}
            data-slot='floating-alert-item'
            // Each alert follows its own content width; long messages stay within the viewport.
            className='pointer-events-auto w-fit min-w-0 max-w-full'
            layout={!reduceMotion}
            initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
          >
            <FloatingAlertCard alert={alert} onDismiss={() => dismissAlert(alert.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )

  return (
    <FloatingAlertContext.Provider value={value}>
      {children}
      {overlayPortalTarget ? createPortal(viewport, overlayPortalTarget) : viewport}
    </FloatingAlertContext.Provider>
  )
}

export function useFloatingAlert() {
  return React.useContext(FloatingAlertContext)
}
