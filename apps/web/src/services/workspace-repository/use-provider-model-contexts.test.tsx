// Verifies model-list metadata cannot leak between provider choices or advertise failed responses.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useProviderModelContexts } from "./use-provider-model-contexts";
import { notifyProviderModelMetadataChanged } from "../../shared/lib/provider-model-metadata";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const response = (model: string) => new Response(JSON.stringify({ models: [{ model, contextBudget: 48000,
  capacity: { context: null, output: null, source: "unknown", matchedId: null, updatedAt: null,
    capabilities: { reasoning: true, vision: null, toolCall: null } } }] }), { status: 200 });

it("hides old choices immediately and ignores late responses when a provider changes", async () => {
  let finish!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response("a")).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(response("c")));
  const hook = renderHook(({ provider }) => useProviderModelContexts("project", provider), { initialProps: { provider: "a" } });
  await waitFor(() => expect(hook.result.current.a?.capacity.capabilities?.reasoning).toBe(true));
  hook.rerender({ provider: "b" });
  expect(hook.result.current).toEqual({});
  hook.rerender({ provider: "c" });
  await waitFor(() => expect(hook.result.current.c).toBeDefined());
  await act(async () => { finish(response("b")); });
  expect(Object.keys(hook.result.current)).toEqual(["c"]);
});

it("keeps failed metadata unknown and skips requests without an authorized project", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
  const hook = renderHook(({ project }: { project: string | null }) => useProviderModelContexts(project, "provider"), { initialProps: { project: null as string | null } });
  expect(fetch).not.toHaveBeenCalled();
  hook.rerender({ project: "project" });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(hook.result.current).toEqual({});
});

it("refreshes edited provider metadata immediately and ignores changes to other providers", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response("a")).mockResolvedValueOnce(response("updated"));
  vi.stubGlobal("fetch", fetchMock);
  const hook = renderHook(() => useProviderModelContexts("project", "provider"));
  await waitFor(() => expect(hook.result.current.a).toBeDefined());
  act(() => notifyProviderModelMetadataChanged("other"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  act(() => notifyProviderModelMetadataChanged("provider"));
  expect(hook.result.current).toEqual({});
  await waitFor(() => expect(hook.result.current.updated).toBeDefined());
  expect(hook.result.current.a).toBeUndefined();
});
