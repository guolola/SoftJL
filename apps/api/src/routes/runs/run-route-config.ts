// Defines the stable public routes for each run kind.
export const RUN_ROUTE_CONFIG = {
  requirements: {
    startPath: "/api/runs",
    snapshotPath: "/api/runs/:runId",
    eventsPath: "/api/runs/:runId/events",
    notFoundMessage: "Run not found",
  },
  design: {
    startPath: "/api/design-runs",
    snapshotPath: "/api/design-runs/:runId",
    eventsPath: "/api/design-runs/:runId/events",
    notFoundMessage: "Design run not found",
  },
  
  document: {
    startPath: "/api/document-runs",
    snapshotPath: "/api/document-runs/:runId",
    eventsPath: "/api/document-runs/:runId/events",
    downloadPath: "/api/document-runs/:runId/download",
    notFoundMessage: "Document run not found",
  },
} as const;
