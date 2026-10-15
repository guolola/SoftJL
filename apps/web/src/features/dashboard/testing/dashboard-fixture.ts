// Provides deterministic summary data only for dashboard tests and temporary visual verification.
import { dashboardProgressArtifactTypes, dashboardProgressStages, dashboardSummarySchema, type DashboardSummary } from '@uml-platform/contracts'
export function dashboardFixture(projectCount = 7): DashboardSummary {
  const rawTotals = { runs: 10, completed: 6, failed: 2, cancelled: 1, active: 1, requirements: 4, design: 4, document: 2, successRate: 66.7 }
  const totals = projectCount ? rawTotals : { runs: 0, completed: 0, failed: 0, cancelled: 0, active: 0, requirements: 0, design: 0, document: 0, successRate: null }
  const owner = { userId: 'owner', displayName: '项目负责人', avatarUrl: null }
  return dashboardSummarySchema.parse({
    generatedAt: '2026-10-10T04:00:00Z', timezone: 'Asia/Hong_Kong', currentUser: owner, members: projectCount ? [owner] : [],
    artifactDurations: projectCount ? Array.from({ length: 8 }, (_, i) => ({ key: `artifact-${i}`, projectId: `p-${i % projectCount}`, artifactId: `doc-${i}`, artifactType: i % 2 ? 'feasibility:implementation' : 'document:requirementsSpec',
      name: i % 2 ? null : `需求说明书 ${i}.docx`, samples: i === 7 ? 0 : 2, averageDurationMs: i === 7 ? null : 63000 + i * 1000, latestRunId: `run-${i}` })) : [],
    totals: { ...totals, projects: projectCount, members: projectCount ? 1 : 0, models: projectCount ? 2 : 0, ...(projectCount ? {} : { runs: 0, completed: 0, failed: 0, cancelled: 0, active: 0, requirements: 0, design: 0, document: 0, successRate: null }) },
    monthly: Array.from({ length: 12 }, (_, i) => ({ ...totals, key: new Date(Date.UTC(2025, 10 + i, 1)).toISOString().slice(0, 7), ...(projectCount ? {} : { runs: 0, completed: 0, failed: 0, cancelled: 0, active: 0, requirements: 0, design: 0, document: 0, successRate: null }) })),
    daily: Array.from({ length: 7 }, (_, i) => ({ ...totals, key: `2026-10-${String(4 + i).padStart(2, '0')}` })),
    weekly: { requirements: totals.requirements, design: totals.design, document: totals.document, total: totals.runs, days: Array.from({ length: 7 }, (_, i) => ({ ...totals, key: `2026-10-${String(5 + i).padStart(2, '0')}` })) },
    projects: Array.from({ length: projectCount }, (_, i) => ({ id: `p-${i}`, name: i === 0 ? '图书馆系统' : `项目 ${i}`, status: i === 6 ? 'archived' : 'active', owner, updatedAt: '2026-10-10T00:00:00Z', members: 1, documents: 2, runs: 10, completed: 6, terminal: i === 6 ? 0 : 9, successRate: i === 6 ? null : 66.7, averageDurationMs: i === 6 ? null : 63000,
      progress: { completed: i === 6 ? 0 : 15, total: 20, percentage: i === 6 ? 0 : 75, stages: dashboardProgressStages.map(kind => ({ kind, completed: i === 6 ? 0 : ({ feasibility: 3, requirements: 7, design: 5, document: 0 })[kind], total: dashboardProgressArtifactTypes.filter(type => type.startsWith(`${kind}:`)).length })) },
    })),
    recentRuns: projectCount ? [{ runId: 'r-1', projectId: 'p-0', projectName: '图书馆系统', runKind: 'document', status: 'completed', model: 'model-a', createdAt: '2026-10-09T18:00:00Z', startedAt: '2026-10-09T18:01:00Z', completedAt: '2026-10-09T18:02:03Z', durationMs: 63000 }] : [],
  })
}
