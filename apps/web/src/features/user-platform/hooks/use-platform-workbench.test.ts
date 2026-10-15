import { describe, expect, it } from "vitest";

import type { PlatformProject, PlatformRunSummary } from "../services/platform-api";
import {
  buildWorkbenchData,
  initialsFromName,
  projectToItem,
  type ProjectRuns,
} from "./use-platform-workbench";

// Identity translator: returns the key (plus interpolated total) so assertions stay readable.
const t = ((key: string, options?: { total?: number }) =>
  options && options.total !== undefined ? `${key}:${options.total}` : key) as never;

const NOW = new Date("2026-09-21T12:00:00.000Z");

function makeProject(overrides: Partial<PlatformProject> = {}): PlatformProject {
  return {
    id: "p1",
    name: "Library System",
    description: null,
    visibility: "private",
    status: "active",
    ownerUserId: "u1",
    ownerDisplayName: "Amanda Lee",
    ownerAvatarUrl: null,
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    lastGeneratedAt: "2026-09-19T00:00:00.000Z",
    memberCount: 3,
    memberPreviews: [],
    ...overrides,
  } as PlatformProject;
}

function makeRun(overrides: Partial<PlatformRunSummary> = {}): PlatformRunSummary {
  return {
    runId: "r1",
    status: "completed",
    runKind: "design",
    model: "gpt-test",
    createdAt: "2026-09-15T00:00:00.000Z",
    startedAt: "2026-09-15T00:00:00.000Z",
    completedAt: "2026-09-15T00:00:00.000Z",
    ...overrides,
  } as PlatformRunSummary;
}

describe("buildWorkbenchData", () => {
  it("aggregates KPIs, timeline, weekly, funnel and table rows from real runs", () => {
    const projects = [
      makeProject(),
      makeProject({ id: "p2", name: "Campus Wallet", visibility: "team", memberCount: 2 }),
    ];
    const runsByProject: ProjectRuns[] = [
      {
        project: projects[0],
        runs: [
          makeRun({ runKind: "requirements" }),
          makeRun({ runId: "r2", runKind: "design", status: "completed", model: "gpt-a" }),
          makeRun({ runId: "r3", runKind: "code", status: "failed", model: "gpt-b" }),
        ],
      },
      { project: projects[1], runs: [makeRun({ runId: "r4", runKind: "document" })] },
    ];

    const data = buildWorkbenchData(projects, runsByProject, true, t, NOW);

    expect(data.runsLoaded).toBe(true);
    expect(data.kpis).toHaveLength(4);
    expect(data.kpis[0].value).toBe("2"); // projects
    expect(data.kpis[1].value).toBe("5"); // members 3 + 2
    expect(data.kpis[2].value).toBe("4"); // total runs
    expect(data.kpis[3].value).toBe("3"); // distinct models gpt-test/gpt-a/gpt-b
    expect(data.weekly.data).toHaveLength(7);
    expect(data.conversion.conversionData.map((entry) => entry.title)).toEqual([
      "gpt-test",
      "gpt-a",
      "gpt-b",
    ]);
    expect(data.tableRows).toHaveLength(2);
  });

  it("falls back to project-derived data when the run fan-out fails", () => {
    const projects = [makeProject()];
    const data = buildWorkbenchData(projects, [], false, t, NOW);

    expect(data.runsLoaded).toBe(false);
    expect(data.kpis[3].value).toBe("—"); // models unknown without runs
    expect(data.kpis[2].value).toBe("1"); // projects with lastGeneratedAt
    // Weekly falls back to project creation weekdays with zeroed success line.
    expect(data.weekly.data.every((point) => point.pv === 0)).toBe(true);
  });
});

describe("projectToItem", () => {
  it("maps visibility/status onto the datatable enums", () => {
    const item = projectToItem(makeProject({ visibility: "team", status: "archived" }), NOW);
    expect(item.role).toBe("editor");
    expect(item.plan).toBe("basic");
    expect(item.fallback).toBe("AL");
  });

  it("marks never-generated projects as pending", () => {
    const item = projectToItem(makeProject({ lastGeneratedAt: null }), NOW);
    expect(item.status).toBe("pending");
  });
});

describe("initialsFromName", () => {
  it("derives initials from one or many words", () => {
    expect(initialsFromName("Amanda Lee")).toBe("AL");
    expect(initialsFromName("Cher")).toBe("CH");
    expect(initialsFromName("")).toBe("?");
  });
});
