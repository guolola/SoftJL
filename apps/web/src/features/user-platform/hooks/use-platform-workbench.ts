// Aggregates platform-wide workbench data for the dashboard page.
// Source constraint: the API exposes listProjects() globally but runs/documents/members only per
// project, so activity widgets are built from a bounded fan-out over the most recently updated
// projects, with project-derived fallbacks when that fan-out is skipped or fails (runsLoaded=false).
import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";

import {
  platformApi,
  type PlatformProject,
  type PlatformRunSummary,
} from "../services/platform-api";
import type {
  WorkbenchData,
  WorkbenchKpi,
  WorkbenchProjectListItem,
  WorkbenchTimelineEntry,
  WorkbenchWeeklyPoint,
} from "@/shared/template/blocks/dashboard/workbench-data";

type Translator = TFunction;

const MAX_FANOUT_PROJECTS = 5;
const FANOUT_CONCURRENCY = 2;

const TIMELINE_FILLS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--primary)",
];

const LIST_COLORS = [
  "bg-chart-2/10 text-chart-2",
  "bg-chart-5/10 text-chart-5",
  "bg-chart-3/10 text-chart-3",
  "bg-chart-1/10 text-chart-1",
];

const LIST_ICONS: WorkbenchProjectListItem["iconKind"][] = ["web", "mobile", "card", "design"];

const WEEKDAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const RUN_KIND_STAGES = ["requirements", "design",  "document"] as const;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Monday-based weekday index (0=Mon .. 6=Sun).
function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short" });
}

function lastSevenMonths(reference: Date): { key: string; label: string }[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(reference.getFullYear(), reference.getMonth() - (6 - index), 1);
    return { key: `${date.getFullYear()}-${date.getMonth()}`, label: monthLabel(date) };
  });
}

export function initialsFromName(name?: string | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function pctChange(current: number, previous: number): { trend: "up" | "down"; change: string } {
  if (previous <= 0) {
    return { trend: "up", change: current > 0 ? "+100%" : "+0%" };
  }
  const ratio = ((current - previous) / previous) * 100;
  const rounded = Math.round(ratio);
  return {
    trend: rounded < 0 ? "down" : "up",
    change: `${rounded >= 0 ? "+" : ""}${rounded}%`,
  };
}

function isTerminalSuccess(run: PlatformRunSummary): boolean {
  return run.status === "completed";
}

function withinDays(date: Date | null, reference: Date, days: number): boolean {
  if (!date) return false;
  const diff = reference.getTime() - date.getTime();
  return diff >= 0 && diff <= days * MS_PER_DAY;
}

export type ProjectRuns = { project: PlatformProject; runs: PlatformRunSummary[] };

// Pure builder — unit-testable without the API or React.
export function buildWorkbenchData(
  projects: PlatformProject[],
  runsByProject: ProjectRuns[],
  runsLoaded: boolean,
  t: Translator,
  now: Date = new Date(),
): WorkbenchData {
  const allRuns = runsByProject.flatMap((entry) => entry.runs);
  const sortedProjects = [...projects].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  // KPI: projects created in the last 7 days vs the previous 7 days.
  const createdLast7 = projects.filter((p) => withinDays(parseDate(p.createdAt), now, 7)).length;
  const createdPrev7 = projects.filter((p) => {
    const date = parseDate(p.createdAt);
    if (!date) return false;
    const diff = now.getTime() - date.getTime();
    return diff > 7 * MS_PER_DAY && diff <= 14 * MS_PER_DAY;
  }).length;
  const projectsTrend = pctChange(createdLast7, createdPrev7);

  const memberTotal = projects.reduce((sum, p) => sum + (p.memberCount ?? 0), 0);
  const completedRuns = allRuns.filter(isTerminalSuccess).length;
  const distinctModels = new Set(allRuns.map((r) => r.model).filter(Boolean)).size;

  const kpis: WorkbenchKpi[] = [
    {
      kind: "projects",
      title: t("dashboard.kpi.projects"),
      value: String(projects.length),
      trend: projectsTrend.trend,
      changePercentage: projectsTrend.change,
      badgeContent: t("dashboard.kpi.projectsBadge"),
    },
    {
      kind: "members",
      title: t("dashboard.kpi.members"),
      // Approximate: memberCount is per-project, so a user in several projects is counted more than
      // once. Client-side dedupe is impossible without a global member roster endpoint.
      value: String(memberTotal),
      trend: "up",
      changePercentage: "+0%",
      badgeContent: t("dashboard.kpi.membersBadge"),
    },
    {
      kind: "runs",
      title: t("dashboard.kpi.runs"),
      value: runsLoaded
        ? String(allRuns.length)
        : String(projects.filter((p) => p.lastGeneratedAt).length),
      trend: "up",
      changePercentage: "+0%",
      badgeContent: runsLoaded ? t("dashboard.kpi.runsBadge") : t("dashboard.kpi.runsFallbackBadge"),
    },
    {
      kind: "models",
      title: t("dashboard.kpi.models"),
      value: runsLoaded ? String(distinctModels) : "—",
      trend: "up",
      changePercentage: "+0%",
      badgeContent: t("dashboard.kpi.modelsBadge"),
    },
  ];

  // Timeline: most recently updated projects as Gantt bars (createdAt -> last activity).
  const timelineProjects = sortedProjects.slice(0, 6);
  const entries: WorkbenchTimelineEntry[] = timelineProjects.flatMap((project, index) => {
    const start = parseDate(project.createdAt) ?? parseDate(project.updatedAt);
    const end =
      parseDate(project.lastGeneratedAt) ?? parseDate(project.updatedAt) ?? start;
    if (!start || !end) return [];
    return [
      {
        name: initialsFromName(project.ownerDisplayName ?? project.name),
        project: project.name,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        fill: TIMELINE_FILLS[index % TIMELINE_FILLS.length],
      },
    ];
  });

  const timelineList: WorkbenchProjectListItem[] = sortedProjects.slice(0, 4).map((project, index) => ({
    iconKind: LIST_ICONS[index % LIST_ICONS.length],
    title: project.name,
    tasks: t("dashboard.timeline.tasks", { total: project.memberCount ?? 0 }),
    colorClassName: LIST_COLORS[index % LIST_COLORS.length],
  }));

  // Token usage by weekday. The user-facing API exposes no per-run token metrics yet
  // (generationUsage is only a rate-limit quota), so real data renders zeros until it does.
  const weeklyData: WorkbenchWeeklyPoint[] = WEEKDAY_KEYS.map(label => ({ name: label, uv: 0, pv: 0 }));

  // AI model usage: invocation counts per distinct run.model, top 4 by volume.
  const months = lastSevenMonths(now);
  const modelCountMap = allRuns.reduce<Record<string, number>>((acc, run) => {
    const model = run.model || "unknown";
    acc[model] = (acc[model] ?? 0) + 1;
    return acc;
  }, {});
  const modelCounts = Object.entries(modelCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const totalInvocations = allRuns.length;
  const totalConversion =
    totalInvocations > 0 && modelCounts.length > 0
      ? Math.round((modelCounts[0][1] / totalInvocations) * 100)
      : 0;

  const conversionChartData = months.map((month) => ({
    month: month.label,
    conversion: allRuns.filter((run) => {
      const date = parseDate(run.createdAt);
      return date ? `${date.getFullYear()}-${date.getMonth()}` === month.key : false;
    }).length,
  }));

  // Performance: members from top-project previews; series from monthly/weekday run counts.
  const memberPreviews = sortedProjects
    .flatMap((project) => project.memberPreviews ?? [])
    .filter((member) => member.displayName)
    .slice(0, 4)
    .map((member) => ({
      name: member.displayName as string,
      initials: initialsFromName(member.displayName),
      ...(member.avatarUrl ? { src: member.avatarUrl } : {}),
    }));

  const topOwner = sortedProjects[0];
  const designRuns = allRuns.filter((run) => run.runKind === "design").length;
  const codeRuns = allRuns.filter((run) => run.runKind === "code").length;
  const failedRuns = allRuns.filter((run) => run.status === "failed").length;
  const successRate = allRuns.length > 0 ? Math.round((completedRuns / allRuns.length) * 100) : 0;

  const monthlyRunTotals = months.map((month) => ({
    label: month.label,
    value: allRuns.filter((run) => {
      const date = parseDate(run.createdAt);
      return date ? `${date.getFullYear()}-${date.getMonth()}` === month.key : false;
    }).length,
  }));

  const weekdayRunTotals = WEEKDAY_KEYS.map((label, index) => ({
    label,
    value: allRuns.filter((run) => {
      const date = parseDate(run.startedAt) ?? parseDate(run.createdAt);
      return date ? weekdayIndex(date) === index : false;
    }).length,
  }));

  // Bottom table: projects mapped onto the datatable-user Item shape (presentational reuse).
  const tableRows = sortedProjects.map((project) => projectToItem(project, now));

  return {
    kpis,
    timeline: {
      title: t("dashboard.timeline.title"),
      description: t("dashboard.timeline.description", { total: projects.length }),
      entries,
      listTitle: t("dashboard.timeline.listTitle"),
      listDescription: t("dashboard.timeline.listDescription", { total: timelineList.length }),
      projects: timelineList,
    },
    weekly: {
      title: t("dashboard.weekly.title"),
      data: weeklyData,
      barLabel: t("dashboard.weekly.barLabel"),
      lineLabel: t("dashboard.weekly.lineLabel"),
      summaryValue: "—",
      summaryLabel: t("dashboard.weekly.summaryLabel"),
    },
    conversion: {
      title: t("dashboard.conversion.title"),
      subTitle: t("dashboard.conversion.subtitle"),
      totalConversion,
      conversionTrend: "up",
      percentageChange: 0,
      conversionData: modelCounts.map(([model, count]) => ({
        title: model,
        stat: t("dashboard.conversion.stat", { total: count }),
        trend: "up",
        percentageChange: totalInvocations > 0 ? Math.round((count / totalInvocations) * 100) : 0,
      })),
      chartData: conversionChartData,
    },
    performance: {
      title: t("dashboard.performance.title"),
      members: {
        tabLabel: t("dashboard.performance.membersTab"),
        person: {
          name: topOwner?.ownerDisplayName || t("dashboard.performance.unknownOwner"),
          role: t("dashboard.performance.ownerRole"),
          initials: initialsFromName(topOwner?.ownerDisplayName || topOwner?.name),
          ...(topOwner?.ownerAvatarUrl ? { src: topOwner.ownerAvatarUrl } : {}),
        },
        badgeLabel: t("dashboard.performance.totalProjects"),
        badgeValue: String(projects.length),
        highlightLabel: t("dashboard.performance.completedRuns"),
        highlightValue: String(completedRuns),
        highlightTrend: "up",
        highlightPct: `${successRate}%`,
        members: memberPreviews,
        viewAllLabel: t("dashboard.performance.viewAll"),
        footerStrong: t("dashboard.performance.membersFooterStrong"),
        footerText: t("dashboard.performance.membersFooterText"),
      },
      area: {
        tabLabel: t("dashboard.performance.areaTab"),
        leftStat: { label: t("dashboard.performance.designRuns"), value: String(designRuns), trend: "up" },
        rightStat: { label: t("dashboard.performance.codeRuns"), value: String(codeRuns), trend: "up" },
        headlineLabel: t("dashboard.performance.monthlyRuns"),
        headlineValue: String(allRuns.length),
        headlineTrend: "up",
        headlinePct: `${successRate}%`,
        chartLabel: t("dashboard.performance.runsLabel"),
        chartData: monthlyRunTotals,
        footerStrong: t("dashboard.performance.areaFooterStrong"),
        footerText: t("dashboard.performance.areaFooterText"),
      },
      bar: {
        tabLabel: t("dashboard.performance.barTab"),
        leftStat: { label: t("dashboard.performance.succeeded"), value: String(completedRuns), trend: "up" },
        rightStat: { label: t("dashboard.performance.failed"), value: String(failedRuns), trend: "down" },
        headlineLabel: t("dashboard.performance.weekdayRuns"),
        headlineValue: String(allRuns.length),
        headlineTrend: failedRuns > completedRuns ? "down" : "up",
        headlinePct: `${successRate}%`,
        chartLabel: t("dashboard.performance.runsLabel"),
        chartData: weekdayRunTotals,
        footerStrong: t("dashboard.performance.barFooterStrong"),
        footerText: t("dashboard.performance.barFooterText"),
      },
    },
    tableRows,
    runsLoaded,
  };
}

// Maps a project onto the datatable-user Item union. role/plan/billing are user-management enums
// reused presentationally: visibility->role, status->plan, member-count->billing.
export function projectToItem(project: PlatformProject, now: Date = new Date()): WorkbenchData["tableRows"][number] {
  const roleByVisibility: Record<string, WorkbenchData["tableRows"][number]["role"]> = {
    private: "admin",
    team: "editor",
    public: "subscriber",
    course: "maintainer",
    class: "author",
  };
  const planByStatus: Record<string, WorkbenchData["tableRows"][number]["plan"]> = {
    active: "enterprise",
    archived: "basic",
    draft: "team",
  };
  const lastGenerated = parseDate(project.lastGeneratedAt);
  const status: WorkbenchData["tableRows"][number]["status"] = !project.lastGeneratedAt
    ? "pending"
    : withinDays(lastGenerated, now, 7)
      ? "active"
      : "inactive";

  return {
    id: project.id,
    avatar: project.ownerAvatarUrl ?? "",
    fallback: initialsFromName(project.ownerDisplayName ?? project.name),
    user: project.name,
    email: project.ownerDisplayName || project.visibility,
    role: roleByVisibility[project.visibility] ?? "editor",
    plan: planByStatus[project.status] ?? "company",
    billing: (project.memberCount ?? 0) > 1 ? "auto-debit" : "manual-cash",
    status,
  };
}

async function fetchRunsBounded(projects: PlatformProject[]): Promise<ProjectRuns[]> {
  const targets = [...projects]
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .slice(0, MAX_FANOUT_PROJECTS);

  const results: ProjectRuns[] = [];
  for (let index = 0; index < targets.length; index += FANOUT_CONCURRENCY) {
    const chunk = targets.slice(index, index + FANOUT_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((project) => platformApi.listProjectRuns(project.id)),
    );
    settled.forEach((result, chunkIndex) => {
      if (result.status === "fulfilled") {
        results.push({ project: chunk[chunkIndex], runs: result.value.runs });
      }
    });
  }
  return results;
}

export type PlatformWorkbenchState = {
  data: WorkbenchData | null;
  loading: boolean;
  error: string;
  projectCount: number;
  runsLoaded: boolean;
  reload: () => void;
};

export function usePlatformWorkbench(
  t: Translator,
  locale: string,
  options: { enabled?: boolean } = {},
): PlatformWorkbenchState {
  const enabled = options.enabled ?? true;
  const [projects, setProjects] = useState<PlatformProject[]>([]);
  const [runsByProject, setRunsByProject] = useState<ProjectRuns[]>([]);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setProjects([]);
      setRunsByProject([]);
      setRunsLoaded(false);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    platformApi
      .listProjects()
      .then(async (response) => {
        if (!active) return;
        setProjects(response.projects);
        try {
          const runs = await fetchRunsBounded(response.projects);
          if (!active) return;
          setRunsByProject(runs);
          setRunsLoaded(runs.length > 0);
        } catch {
          if (!active) return;
          setRunsByProject([]);
          setRunsLoaded(false);
        }
      })
      .catch((err) => {
        if (!active) return;
        setProjects([]);
        setRunsByProject([]);
        setRunsLoaded(false);
        setError(localizeCaughtFailure(err, t("errors.http.unknown")));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, reloadToken]);

  const data = useMemo(() => {
    if (loading || error) return null;
    return buildWorkbenchData(projects, runsByProject, runsLoaded, t);
  }, [loading, error, projects, runsByProject, runsLoaded, t, locale]);

  return {
    data,
    loading,
    error,
    projectCount: projects.length,
    runsLoaded,
    reload: () => setReloadToken((token) => token + 1),
  };
}
