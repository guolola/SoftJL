// Verifies run changes refresh project history immediately without relying on active-run polling.
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useProjectOverview } from "./user-platform-pages";
import { platformApi } from "../services/platform-api";
import { notifyProjectRunsChanged } from "../../../shared/lib/project-run-events";

vi.mock("../services/platform-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/platform-api")>();
  return { ...actual, platformApi: { ...actual.platformApi,
    getProject: vi.fn(async () => ({ project: { id: "project-a" } })),
    listProjectMembers: vi.fn(async () => ({ members: [] })),
    listProjectRuns: vi.fn(async () => ({ runs: [] })),
    listProjectDocuments: vi.fn(async () => ({ documents: [] })),
  } };
});

beforeEach(() => vi.clearAllMocks());

it("refreshes the current project's history after a failed run and ignores other projects", async () => {
  const { result } = renderHook(() => useProjectOverview("project-a"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const failed = { runId: "failed-run", status: "failed", operationType: "requirement_modeling" as const };
  vi.mocked(platformApi.listProjectRuns).mockResolvedValue({ projectId: "project-a", runs: [failed] });
  act(() => notifyProjectRunsChanged("project-b", "other-run"));
  expect(platformApi.listProjectRuns).toHaveBeenCalledTimes(1);
  act(() => notifyProjectRunsChanged("project-a", failed.runId));
  await waitFor(() => expect(result.current.runs).toEqual([failed]));
  expect(platformApi.listProjectRuns).toHaveBeenCalledTimes(2);
});
