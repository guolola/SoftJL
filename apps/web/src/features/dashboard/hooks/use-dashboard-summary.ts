// Owns dashboard fetching, cancellation and retry without substituting sample data.
import { useCallback, useEffect, useState } from 'react'
import type { DashboardSummary } from '@uml-platform/contracts'
import { dashboardApi } from '../services/dashboard-api'

export function useDashboardSummary() {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    dashboardApi.getSummary(controller.signal).then(summary => {
      if (!controller.signal.aborted) setData(summary)
    }).catch(cause => {
      if (!controller.signal.aborted) { setData(null); setError(cause instanceof Error ? cause.message : String(cause)) }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])
  return { data, loading, error, reload }
}
