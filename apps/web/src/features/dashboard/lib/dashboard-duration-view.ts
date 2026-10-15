// Builds weighted artifact averages and precise output drill-down from authorized summary groups.
import { dashboardArtifactTypes, type DashboardSummary } from '@uml-platform/contracts'

export type DurationFilter = { mode: string; projectId: string; query: string; page: number; family?: string }
export function formatArtifactDuration(value: number | null) {
  if (value === null) return '—'
  if (value < 1000) return `${Math.round(value)}ms`
  const seconds = Math.round(value / 100) / 10
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${Math.round((seconds % 60) * 10) / 10}s`
}
type Translate = (key: string, options?: Record<string, unknown>) => string
export function buildDashboardDurationView(data: DashboardSummary | null, t: Translate, filter: DurationFilter) {
  const projects = data?.projects.map(project => ({ id: project.id, name: project.name })) ?? []
  const projectNames = new Map(projects.map(project => [project.id, project.name]))
  const entries = (data?.artifactDurations ?? []).filter(item => filter.projectId === 'all' || item.projectId === filter.projectId)
  const groups = new Map<string, { key: string; artifactType: string; name: string; projectId: string; subtitle: string; samples: number; sum: number }>()
  if (filter.mode === 'type') for (const type of dashboardArtifactTypes) groups.set(type, {
    key: type, artifactType: type, name: t(`artifactTypes.${type.replace(':', '_')}`), projectId: '', subtitle: '', samples: 0, sum: 0,
  })
  for (const item of entries) {
    const typeLabel = t(`artifactTypes.${item.artifactType.replace(':', '_')}`)
    const key = filter.mode === 'artifact' ? item.key : item.artifactType
    const group = groups.get(key) ?? { key, artifactType: item.artifactType, name: filter.mode === 'artifact' ? item.name || typeLabel : typeLabel,
      projectId: filter.mode === 'artifact' ? item.projectId : '', subtitle: filter.mode === 'artifact' ? `${projectNames.get(item.projectId) ?? ''} · ${typeLabel}` : '', samples: 0, sum: 0 }
    // Group averages must be weighted by valid sample count, never averaged equally.
    group.samples += item.samples
    group.sum += (item.averageDurationMs ?? 0) * item.samples
    groups.set(key, group)
  }
  const query = filter.query.trim().toLocaleLowerCase()
  const rows = [...groups.values()].map(group => ({ ...group, averageDurationMs: group.samples ? group.sum / group.samples : null }))
    .filter(group => !filter.family || filter.family === 'all' || group.artifactType.startsWith(`${filter.family}:`))
    .filter(group => `${group.name} ${group.subtitle}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => (b.averageDurationMs ?? -1) - (a.averageDurationMs ?? -1) || a.key.localeCompare(b.key))
  const pageCount = Math.max(1, Math.ceil(rows.length / 6))
  const page = Math.min(filter.page, pageCount - 1)
  const colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--primary)']
  const pageRows = rows.slice(page * 6, (page + 1) * 6)
  return { projects, page, pageCount, total: rows.length, hasSamples: rows.some(row => row.samples > 0),
    items: Array.from({ length: 6 }, (_, i) => {
      const row = pageRows[i]
      return { key: row?.key ?? `empty-${i}`, sr: page * 6 + i + 1, name: row?.name ?? '', subtitle: row?.subtitle ?? '', projectId: row?.projectId ?? '',
        samples: row?.samples ?? 0, seconds: row?.averageDurationMs === null || !row ? null : row.averageDurationMs / 1000,
        duration: row ? formatArtifactDuration(row.averageDurationMs) : '—', fill: colors[i] }
    }) }
}
