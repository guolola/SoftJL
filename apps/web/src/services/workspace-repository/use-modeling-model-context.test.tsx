// Verifies saved personal capabilities refresh current-model constraints without changing provider selection.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_USER_SETTINGS, saveUserSettings } from "../../shared/lib/user-settings";
import { notifyProviderModelMetadataChanged } from "../../shared/lib/provider-model-metadata";
import { useModelingModelContext } from "./use-modeling-model-context";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
it("reloads both selected-model limits and model-list badges after saving", async () => {
  saveUserSettings({ ...DEFAULT_USER_SETTINGS, providerConfigId: "provider", defaultModel: "model" });
  let vision = true;
  const fetchMock = vi.fn(async (input: string) => {
    const model = { model: "model", contextBudget: vision ? 128000 : 64000,
      capacity: { context: vision ? 128000 : 64000, output: 4096, source: "user", matchedId: null, updatedAt: null,
        capabilities: { vision, reasoning: false, toolCall: null } } };
    return Response.json(String(input).includes("/model-contexts?") ? { models: [model] } : model);
  });
  vi.stubGlobal("fetch", fetchMock);
  const hook = renderHook(() => useModelingModelContext("project"));
  await waitFor(() => expect(hook.result.current.modelContext?.capacity.capabilities?.vision).toBe(true));
  await waitFor(() => expect(hook.result.current.modelContexts.model?.capacity.capabilities?.vision).toBe(true));
  vision = false;
  act(() => notifyProviderModelMetadataChanged("provider"));
  expect(hook.result.current.modelContext).toBeUndefined();
  await waitFor(() => expect(hook.result.current.modelContext?.contextBudget).toBe(64000));
  await waitFor(() => expect(hook.result.current.modelContexts.model?.capacity.capabilities?.vision).toBe(false));
  expect(hook.result.current.settings.providerConfigId).toBe("provider");
  expect(fetchMock).toHaveBeenCalledTimes(4);
});
