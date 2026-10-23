// Verifies overview/history sharing, explicit refreshes, and account-safe run-list invalidation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platformApi, PlatformApiError } from "../../src/features/user-platform/services/platform-api";
import { createHttpWorkspaceRepository } from "../../src/services/workspace-repository/http-repository";
import { readProjectRuns, invalidateProjectRunReads, PROJECT_RUNS_REUSE_MS } from "../../src/services/workspace-repository/project-run-reads";

const payload = (projectId = "project", runId = "run-1") => ({ projectId, runs: [{ runId, operationType: "requirement_modeling", runKind: "requirements", status: "completed", startedAt: "2026-10-23T01:00:00.000Z" }] });
const response = (projectId?: string, runId?: string) => new Response(JSON.stringify(payload(projectId, runId)), { status: 200 });

beforeEach(() => invalidateProjectRunReads());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("project run-list reads", () => {
  it("shares concurrent and recent reads between overview and workspace history", async () => {
    let finish!: (result: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const repository = createHttpWorkspaceRepository({ projectId: "project" });
    const overview = platformApi.listProjectRuns("project", { maxAgeMs: PROJECT_RUNS_REUSE_MS });
    const history = repository.listRunHistory({ maxAgeMs: PROJECT_RUNS_REUSE_MS });
    finish(response());
    expect((await overview).runs[0].runId).toBe("run-1");
    expect((await history)[0].id).toBe("run-1");
    await repository.listRunHistory({ maxAgeMs: PROJECT_RUNS_REUSE_MS });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes explicitly, expires reuse, and keeps projects separate", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetch = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetch);
    await readProjectRuns("project");
    await readProjectRuns("project");
    expect(fetch).toHaveBeenCalledTimes(2);
    now += PROJECT_RUNS_REUSE_MS;
    await readProjectRuns("project", { maxAgeMs: PROJECT_RUNS_REUSE_MS });
    await readProjectRuns("other-project", { maxAgeMs: PROJECT_RUNS_REUSE_MS });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it.each(["uml-auth-session-changed", "uml-generation-completed"])("invalidates cached lists on %s", async eventName => {
    const fetch = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetch);
    await readProjectRuns("project");
    window.dispatchEvent(new Event(eventName));
    await readProjectRuns("project", { maxAgeMs: PROJECT_RUNS_REUSE_MS });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not reuse an invalidated pending response or cache a failed read", async () => {
    let finish!: (result: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(new Response('{}', { status: 403 })).mockImplementation(async () => response("project", "run-new"));
    vi.stubGlobal("fetch", fetch);
    const old = readProjectRuns("project");
    invalidateProjectRunReads("project");
    finish(response("project", "run-old"));
    await old;
    await expect(platformApi.listProjectRuns("project")).rejects.toBeInstanceOf(PlatformApiError);
    expect((await readProjectRuns("project", { maxAgeMs: PROJECT_RUNS_REUSE_MS })).runs[0].runId).toBe("run-new");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
