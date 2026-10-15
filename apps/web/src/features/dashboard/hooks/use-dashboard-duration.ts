// Keeps duration filtering and pagination in the dashboard feature, outside the imported template.
import { useState } from 'react'
import type { DashboardSummary } from '@uml-platform/contracts'
import { buildDashboardDurationView, type DurationFilter } from '../lib/dashboard-duration-view'

export function useDashboardDuration(data: DashboardSummary | null, t: (key: string, options?: Record<string, unknown>) => string) {
  const [filter, setFilter] = useState<DurationFilter>({ mode: 'type', projectId: 'all', query: '', page: 0, family: 'all' })
  const set = (key: 'mode' | 'projectId' | 'query' | 'family', value: string) => setFilter(previous => ({ ...previous, [key]: value, page: 0 }))
  return { ...buildDashboardDurationView(data, t, filter), mode: filter.mode, projectId: filter.projectId, query: filter.query, family: filter.family,
    onFamilyChange: (value: string) => set('family', value),
    onModeChange: (value: string) => set('mode', value), onProjectChange: (value: string) => set('projectId', value), onQueryChange: (value: string) => set('query', value),
    onPageChange: (page: number) => setFilter(previous => ({ ...previous, page })) }
}
