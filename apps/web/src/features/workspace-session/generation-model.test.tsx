// Exercises direct generation actions and reactive eligibility without relying on disabled page buttons.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockWorkspaceRepository } from "../../services/workspace-repository/mock-repository";
import { patchUserSettings } from "../../shared/lib/user-settings";
import { createRule, withWorkspaceProviders } from "../../test/workspace-test-utils";
import { useWorkspaceSession } from "./state";

afterEach(() => localStorage.clear());
describe("session generation model guard", () => {
  it("blocks direct real generation actions before preflight mutations or requests", async () => {
    const repository = createMockWorkspaceRepository({ requirementText: "允许登录", rules: [createRule()] });
    repository.getProjectAccess = async () => ({ capabilities: ["update_project", "start_runs"], generationExecutionMode: "provider" });
    const spies = ["startRun", "startDesignRun", "startDocumentRun", "updateRequirementRules", "updateRequirementReviewState"] as const;
    for (const method of spies) repository[method] = vi.fn() as never;
    const { result } = renderHook(useWorkspaceSession, { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized && result.current.canStartRuns).toBe(true));
    expect(result.current.generationModelBlockedReason).toContain("供应商");
    await act(async () => {
      await result.current.generateRules();
      await result.current.generateDiagrams();
      await result.current.generateDesignDiagrams();
      await result.current.generateRequirementsSpec();
      await result.current.generateSoftwareDesignSpec();
      await result.current.generateFeasibilityStudy();
    });
    for (const method of spies) expect(repository[method]).not.toHaveBeenCalled();
    expect(result.current.generationTasks).toHaveLength(0);
    expect(result.current.errorMessage).toContain("供应商");
    act(() => patchUserSettings({ providerConfigId: "provider-1", defaultModel: "model-1", providerModelOptions: ["model-1"] }));
    expect(result.current.generationModelBlockedReason).toBeNull();
    act(() => patchUserSettings({ providerModelOptions: ["model-2"] }));
    expect(result.current.generationModelBlockedReason).toContain("已不可用");
    act(() => patchUserSettings({ providerConfigId: "" }));
    expect(result.current.generationModelBlockedReason).toContain("供应商");
  });
});
