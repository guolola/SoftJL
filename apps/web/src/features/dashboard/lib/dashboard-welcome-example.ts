// Supplies ephemeral examples throughout welcome; confirmation exposes the untouched real account data.
import { dashboardArtifactTypes, dashboardSummarySchema, type DashboardSummary } from '@uml-platform/contracts'

export function buildDashboardWelcomeExample(summary: DashboardSummary): DashboardSummary {
  const date = new Date(summary.generatedAt)
  const point = (completed: number, failed: number) => {
    const runs = completed + failed + 2
    const requirements = Math.round(runs * .4), design = Math.round(runs * .35)
    return { runs, completed, failed, cancelled: 1, active: 1, requirements, design,
      document: runs - requirements - design, successRate: Math.round(completed / (completed + failed + 1) * 1000) / 10 }
  }
  const totals = { runs: 48, completed: 42, failed: 3, cancelled: 1, active: 2,
    requirements: 20, design: 18, document: 10, successRate: 91.3 }
  const monthly = Array.from({ length: 12 }, (_, index) => ({ ...point(12 + index * 3, index % 3 + 1),
    key: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 11 + index, 1)).toISOString().slice(0, 7) }))
  const daily = Array.from({ length: 7 }, (_, index) => ({ ...point(4 + index, index % 2),
    key: new Date(date.getTime() - (6 - index) * 86400000).toISOString().slice(0, 10) }))
  const projects = ['课程设计项目', '实验管理项目', '校园服务项目'].map((name, index) => ({
    id: `welcome-example-${index}`, name, status: 'active', owner: summary.currentUser,
    updatedAt: summary.generatedAt, members: 3, documents: 4, runs: 16, completed: 14,
    terminal: 15, successRate: 93.3, averageDurationMs: 61000, progress: null,
  }))
  return dashboardSummarySchema.parse({
    ...summary, totals: { ...totals, projects: 3, members: 5, models: 2 }, monthly, daily, projects,
    members: [summary.currentUser],
    weekly: { requirements: 20, design: 18, document: 10, total: 48, days: daily },
    artifactDurations: dashboardArtifactTypes.slice(0, 6).map((artifactType, index) => ({
      key: `welcome-artifact-${index}`, projectId: projects[index % 3].id, artifactId: `welcome-output-${index}`,
      artifactType, name: null, samples: 3, averageDurationMs: [48000, 61000, 83000, 43000, 55000, 72000][index], latestRunId: `welcome-run-${index}`,
    })),
    recentRuns: projects.map((project, index) => ({ runId: `welcome-run-${index}`, projectId: project.id,
      projectName: project.name, runKind: 'document', status: 'completed', model: '示例模型',
      createdAt: summary.generatedAt, startedAt: summary.generatedAt, completedAt: summary.generatedAt, durationMs: 61000 })),
  })
}
