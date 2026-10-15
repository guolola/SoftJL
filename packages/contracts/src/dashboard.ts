// Defines the authenticated dashboard's data contract, independent of presentation blocks.
import { z } from "zod";
import { runStatusSchema } from "./runs.js";
import { diagramKindSchema, designDiagramKindSchema } from "./requirements.js";
import { documentKindSchema } from "./documents.js";

// Keep zero-sample categories visible and synchronized with supported production artifacts.
export const dashboardArtifactTypes = [
  ...diagramKindSchema.options.map(kind => `requirements:${kind}`),
  ...designDiagramKindSchema.options.map(kind => `design:${kind}`),
  "feasibility:context", "feasibility:business-flow", "feasibility:implementation",
  ...documentKindSchema.options.map(kind => `document:${kind}`),
];

const count = z.number().int().nonnegative();
const rate = z.number().min(0).max(100).nullable();
const timestamp = z.string().datetime({ offset: true }).nullable();
export const dashboardRunKindSchema = z.enum(["requirements", "feasibility", "design", "document"]);
export const dashboardProgressStages = ["feasibility", "requirements", "design", "document"] as const;
// The workspace exposes context under feasibility, so its legacy requirements alias is excluded.
export const dashboardProgressArtifactTypes = dashboardArtifactTypes.filter(type => type !== "requirements:context");
export const dashboardArtifactTimingSchema = z.object({
  artifactId: z.string(), artifactType: z.string(), name: z.string().nullable(),
  startedAt: timestamp, completedAt: timestamp,
});
export type DashboardArtifactTiming = z.infer<typeof dashboardArtifactTimingSchema>;
export const dashboardRunSchema = z.object({
  runId: z.string().min(1), projectId: z.string().min(1),
  runKind: dashboardRunKindSchema, status: runStatusSchema,
  model: z.string().nullable(), createdAt: timestamp, startedAt: timestamp, completedAt: timestamp,
  artifactTimings: z.array(dashboardArtifactTimingSchema).optional(),
});
export type DashboardRun = z.infer<typeof dashboardRunSchema>;

const member = z.object({ userId: z.string().min(1), displayName: z.string(), avatarUrl: z.string().nullable() });
const totals = z.object({
  runs: count, completed: count, failed: count, cancelled: count, active: count,
  requirements: count, design: count, document: count, successRate: rate,
});
export const dashboardSummarySchema = z.object({
  generatedAt: z.string().datetime({ offset: true }), timezone: z.literal("Asia/Hong_Kong"),
  currentUser: member, members: z.array(member),
  totals: totals.extend({ projects: count, members: count, models: count }),
  monthly: z.array(totals.extend({ key: z.string() })).length(12),
  daily: z.array(totals.extend({ key: z.string() })).length(7),
  weekly: z.object({ requirements: count, design: count, document: count, total: count,
    days: z.array(totals.extend({ key: z.string() })).length(7) }),
  projects: z.array(z.object({
    id: z.string(), name: z.string(), status: z.enum(["active", "archived"]),
    updatedAt: z.string(), owner: member.nullable(), members: count, documents: count,
    runs: count, completed: count, terminal: count, successRate: rate,
    averageDurationMs: z.number().nonnegative().nullable(),
    progress: z.object({ completed: count, total: count, percentage: rate,
      stages: z.array(z.object({ kind: dashboardRunKindSchema, completed: count, total: count })).length(4).optional(),
    }).nullable().optional(),
  })),
  artifactDurations: z.array(z.object({
    key: z.string(), projectId: z.string(), artifactId: z.string(), artifactType: z.string(),
    name: z.string().nullable(), samples: count, averageDurationMs: z.number().nonnegative().nullable(),
    latestRunId: z.string(),
  })).default([]),
  recentRuns: z.array(dashboardRunSchema.extend({ projectName: z.string(), durationMs: z.number().nonnegative().nullable() })).max(5),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
