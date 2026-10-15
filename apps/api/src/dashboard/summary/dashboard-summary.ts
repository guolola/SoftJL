// Aggregates authorized project metadata and run summaries for dashboard-shell-06.
import type { DashboardRun, DashboardSummary, DocumentLibraryItem } from "@uml-platform/contracts";
import type { AuthStore, ProjectMemberRecord, ProjectRecord, UserRecord } from "../../auth/in-memory-auth-store.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import type { RunRecord, RunRecordStore } from "../../runs/records/run-record-store.js";
import { dashboardArtifactTimings } from "../../runs/records/dashboard-artifact-timings.js";
import { buildDashboardProgress } from "./dashboard-progress.js";

const DAY = 86400000;
const OFFSET = 8 * 3600000;
function validDate(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
export function dashboardRunFromRecord(record: RunRecord): DashboardRun | null {
  if (!record.metadata?.projectId) return null;
  const snapshot = record.snapshot;
  const startIndex = record.events.findIndex(event => event.type === "stage_started");
  const endIndex = record.events.findIndex(event => ["completed", "failed", "cancelled"].includes(event.type));
  const settings = "providerSettings" in snapshot ? snapshot.providerSettings : null;
  const runKind = "selectedArtifacts" in snapshot ? "feasibility" : "documentKind" in snapshot ? "document" : "designModelTraceability" in snapshot ? "design" : "requirements";
  return {
    runId: snapshot.runId, projectId: record.metadata.projectId,
    runKind,
    status: record.terminal && ["running", "queued"].includes(snapshot.status) ? "failed" : snapshot.status,
    model: (settings && "model" in settings ? settings.model : record.metadata.model)?.trim() || null,
    createdAt: validDate(record.metadata.createdAt),
    startedAt: validDate(record.eventCreatedAt?.[startIndex]),
    completedAt: validDate(record.metadata.completedAt ?? record.eventCreatedAt?.[endIndex]),
    artifactTimings: dashboardArtifactTimings({ runKind, status: snapshot.status,
      ...("documentKind" in snapshot ? { documentId: snapshot.documentId, documentKind: snapshot.documentKind, fileName: snapshot.fileName } : {}),
      ...("models" in snapshot ? { models: snapshot.models } : {}),
    }, record.events, record.eventCreatedAt ?? []),
  };
}
export function dashboardDuration(run: Pick<DashboardRun, "startedAt" | "completedAt">) {
  if (!run.startedAt || !run.completedAt) return null;
  const duration = Date.parse(run.completedAt) - Date.parse(run.startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}
function aggregate(runs: DashboardRun[]) {
  const completed = runs.filter(run => run.status === "completed").length;
  const failed = runs.filter(run => run.status === "failed").length;
  const cancelled = runs.filter(run => run.status === "cancelled").length;
  const terminal = completed + failed + cancelled;
  return { runs: runs.length, completed, failed, cancelled,
    active: runs.length - terminal,
    requirements: runs.filter(run => ["requirements", "feasibility"].includes(run.runKind)).length,
    design: runs.filter(run => run.runKind === "design").length,
    document: runs.filter(run => run.runKind === "document").length,
    successRate: terminal ? Math.round(completed / terminal * 1000) / 10 : null };
}
type ProjectSource = { project: ProjectRecord; members: ProjectMemberRecord[]; owner: UserRecord | null; documents: Pick<DocumentLibraryItem, "id" | "status" | "documentKind">[]; workspace?: Record<string, unknown> };
function person(user: { id: string; displayName: string; avatarUrl?: string | null }) {
  return { userId: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl ?? null };
}
const localKey = (time: number) => new Date(time + OFFSET).toISOString().slice(0, 10);

export function buildDashboardSummary(user: UserRecord, sources: ProjectSource[], inputRuns: DashboardRun[], now = new Date()): DashboardSummary {
  // Authorization is applied before every aggregation, including member/model counts and rankings.
  const accessible = new Set(sources.filter(source => source.project.status !== "deleted").map(source => source.project.id));
  const runs = inputRuns.filter(run => accessible.has(run.projectId));
  const members = new Map<string, DashboardSummary["members"][number]>();
  const projects = sources.filter(source => accessible.has(source.project.id)).map(({ project, members: projectMembers, owner, documents, workspace }) => {
    const active = projectMembers.filter(member => member.status === "active" && member.userId);
    for (const member of active) members.set(member.userId!, { userId: member.userId!, displayName: member.displayName || member.email.split("@")[0], avatarUrl: member.avatarUrl ?? null });
    const projectRuns = runs.filter(run => run.projectId === project.id);
    const totals = aggregate(projectRuns);
    const durations = projectRuns.filter(run => run.status === "completed").map(dashboardDuration).filter((duration): duration is number => duration !== null);
    return { id: project.id, name: project.name, status: project.status as "active" | "archived", updatedAt: project.updatedAt,
      owner: owner ? person(owner) : null, members: new Set(active.map(member => member.userId)).size,
      documents: new Set(documents.filter(document => document.status !== "deleted").map(document => document.id)).size,
      runs: totals.runs, completed: totals.completed, terminal: totals.completed + totals.failed + totals.cancelled,
      successRate: totals.successRate, progress: buildDashboardProgress(workspace ?? {}, documents),
      averageDurationMs: durations.length ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : null };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const localNow = new Date(now.getTime() + OFFSET);
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const key = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth() - 11 + i, 1)).toISOString().slice(0, 7);
    return { key, ...aggregate(runs.filter(run => run.createdAt && localKey(Date.parse(run.createdAt)).startsWith(key))) };
  });
  const midnight = Date.parse(`${localKey(now.getTime())}T00:00:00+08:00`);
  const dayTotals = (time: number) => { const key = localKey(time); return { key, ...aggregate(runs.filter(run => run.createdAt && localKey(Date.parse(run.createdAt)) === key)) }; };
  const daily = Array.from({ length: 7 }, (_, i) => dayTotals(midnight - (6 - i) * DAY));
  const monday = midnight - ((localNow.getUTCDay() + 6) % 7) * DAY;
  const days = Array.from({ length: 7 }, (_, i) => dayTotals(monday + i * DAY));
  const weeklyRuns = runs.filter(run => run.createdAt && Date.parse(run.createdAt) >= monday && Date.parse(run.createdAt) <= now.getTime());
  const weeklyTotals = aggregate(weeklyRuns);
  const artifactGroups = new Map<string, { summary: DashboardSummary["artifactDurations"][number]; total: number; latest: string }>();
  for (const run of runs) for (const artifact of run.artifactTimings ?? []) {
    const key = JSON.stringify([run.projectId, artifact.artifactType, artifact.artifactId]);
    let group = artifactGroups.get(key);
    if (!group) {
      group = { summary: { key, projectId: run.projectId, artifactId: artifact.artifactId, artifactType: artifact.artifactType,
        name: artifact.name, samples: 0, averageDurationMs: null, latestRunId: run.runId }, total: 0, latest: "" };
      artifactGroups.set(key, group);
    }
    const duration = dashboardDuration(artifact);
    if (duration !== null) { group.total += duration; group.summary.samples++; }
    if ((run.createdAt ?? "") >= group.latest) {
      group.latest = run.createdAt ?? ""; group.summary.latestRunId = run.runId; group.summary.name = artifact.name;
    }
  }
  const artifactDurations = [...artifactGroups.values()].map(({ summary, total }) => ({ ...summary,
    averageDurationMs: summary.samples ? Math.round(total / summary.samples) : null }));
  return { generatedAt: now.toISOString(), timezone: "Asia/Hong_Kong", currentUser: person(user),
    members: Array.from(members.values()).sort((a, b) => a.userId.localeCompare(b.userId)),
    totals: { ...aggregate(runs), projects: projects.length, members: members.size, models: new Set(runs.map(run => run.model?.trim()).filter(Boolean)).size },
    monthly, daily, weekly: { requirements: weeklyTotals.requirements, design: weeklyTotals.design, document: weeklyTotals.document, total: weeklyRuns.length, days },
    projects, artifactDurations, recentRuns: [...runs].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.runId.localeCompare(b.runId)).slice(0, 5).map(run => ({ ...run, projectName: projects.find(project => project.id === run.projectId)!.name, durationMs: dashboardDuration(run) })) };
}

export async function loadDashboardSummary({ authStore, runs, documentLibrary, user, now }: { authStore: AuthStore; runs: RunRecordStore; documentLibrary: DocumentLibrary; user: UserRecord; now?: Date }) {
  const projects = (await authStore.listProjectsForUser(user.id)).filter(project => project.status !== "deleted");
  const sources: ProjectSource[] = [];
  // Bound metadata reads, but visit every accessible project rather than sampling the first five.
  for (let i = 0; i < projects.length; i += 4) {
    sources.push(...await Promise.all(projects.slice(i, i + 4).map(async project => {
      const [members, owner, documents, workspace] = await Promise.all([
        authStore.listProjectMembers(project.id), authStore.getUser(project.ownerUserId),
        documentLibrary.listAllDocuments({ projectId: project.id, includeDeleted: false }),
        authStore.getProjectWorkspace(project.id),
      ]);
      return { project, members, owner: owner ?? null, documents, workspace: workspace.state };
    })));
  }
  const projectIds = projects.map(project => project.id);
  const summaries = runs.listDashboardRuns ? await runs.listDashboardRuns(projectIds) : Array.from(runs.values()).flatMap(record => { const summary = dashboardRunFromRecord(record); return summary ? [summary] : []; });
  return buildDashboardSummary(user, sources, summaries, now);
}
