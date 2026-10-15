// Verifies server-mode defaults and revokes demo access immediately on project switches and failed loads.
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import { useWorkspacePermissions } from "./workspace-permissions";

describe("project generation access", () => {
  it("does not retain demo mode while loading a different project", async () => {
    const demo = createMockWorkspaceRepository();
    const real = createMockWorkspaceRepository();
    let resolve!: (value: { capabilities: string[] }) => void;
    real.getProjectAccess = () => new Promise((done) => { resolve = done; });
    const { result, rerender } = renderHook(({ repository }) => useWorkspacePermissions(repository), { initialProps: { repository: demo } });
    await waitFor(() => expect(result.current.generationExecutionMode).toBe("offline-demo"));
    rerender({ repository: real });
    expect(result.current.generationExecutionMode).toBe("provider");
    expect(result.current.canStartRuns).toBe(false);
    await act(async () => resolve({ capabilities: ["update_project", "start_runs"] }));
    expect(result.current.generationExecutionMode).toBe("provider");
    expect(result.current.canStartRuns).toBe(true);
    rerender({ repository: demo });
    await waitFor(() => expect(result.current.generationExecutionMode).toBe("offline-demo"));
  });
  it("fails closed and ignores a response from an abandoned project", async () => {
    const slow = createMockWorkspaceRepository();
    let resolve!: (value: { capabilities: string[]; generationExecutionMode: "offline-demo" }) => void;
    slow.getProjectAccess = () => new Promise((done) => { resolve = done; });
    const failed = createMockWorkspaceRepository();
    failed.getProjectAccess = vi.fn().mockRejectedValue(new Error("network"));
    const { result, rerender } = renderHook(({ repository }) => useWorkspacePermissions(repository), { initialProps: { repository: slow } });
    rerender({ repository: failed });
    await waitFor(() => expect(result.current.reason).toContain("无法确认"));
    await act(async () => resolve({ capabilities: ["update_project", "start_runs"], generationExecutionMode: "offline-demo" }));
    expect(result.current.generationExecutionMode).toBe("provider");
    expect(result.current.canStartRuns).toBe(false);
  });
});
