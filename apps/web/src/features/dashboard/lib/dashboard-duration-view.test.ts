// Covers weighted means, identity drill-down, project scope and pagination of artifact durations.
import { describe, expect, it } from 'vitest'
import { dashboardFixture } from '../testing/dashboard-fixture'
import { buildDashboardDurationView, formatArtifactDuration } from './dashboard-duration-view'
const t = (key: string) => key
const filter = { mode: 'type', projectId: 'all', query: '', page: 0 }
describe('artifact duration view', () => {
  it('weights valid samples and preserves groups without timing data', () => {
    const summary = dashboardFixture()
    summary.artifactDurations = [
      { ...summary.artifactDurations[0], samples: 1, averageDurationMs: 10000 },
      { ...summary.artifactDurations[2], samples: 3, averageDurationMs: 30000 },
      { ...summary.artifactDurations[1], samples: 0, averageDurationMs: null },
    ]
    const view = buildDashboardDurationView(summary, t, filter)
    expect(view.items[0]).toMatchObject({ seconds: 25, samples: 4 })
    expect(view.items[1].seconds).toBeNull()
    expect(view.items[1].duration).toBe('—')
  })
  it('filters precise identities and projects and clamps/reset-compatible pagination', () => {
    const summary = dashboardFixture()
    expect(buildDashboardDurationView(summary, t, { ...filter, mode: 'artifact' }).pageCount).toBe(2)
    const view = buildDashboardDurationView(summary, t, { mode: 'artifact', projectId: 'p-0', query: '需求说明书 0', page: 9 })
    expect(view.page).toBe(0)
    expect(view.total).toBe(1)
    expect(view.items[0]).toMatchObject({ name: '需求说明书 0.docx', projectId: 'p-0', seconds: 63 })
    expect(buildDashboardDurationView(summary, t, { ...filter, query: 'missing' }).items.every(row => row.seconds === null)).toBe(true)
  })
  it('shows requirements/design/documents with no samples and preserves subsecond precision', () => {
    const summary = dashboardFixture(0)
    for (const family of ['requirements', 'design', 'document', 'feasibility']) {
      const view = buildDashboardDurationView(summary, t, { ...filter, family })
      expect(view.total).toBeGreaterThan(0)
      expect(view.items[0].name).toContain(`artifactTypes.${family}_`)
      expect(view.items[0].seconds).toBeNull()
      expect(view.hasSamples).toBe(false)
    }
    expect(formatArtifactDuration(123)).toBe('123ms')
    expect(formatArtifactDuration(1234)).toBe('1.2s')
    expect(formatArtifactDuration(63400)).toBe('1m 3.4s')
  })
})
