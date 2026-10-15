import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateProviderConfigCache,
  loadProviderConfigs,
} from "./provider-config-cache";

describe("provider config request cache", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    invalidateProviderConfigCache();
  });

  it("shares an in-flight request and reuses the fresh response for the same user", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ providerConfigs: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const firstRequest = loadProviderConfigs("user-1");
    const secondRequest = loadProviderConfigs("user-1");

    expect(firstRequest).toBe(secondRequest);
    await Promise.all([firstRequest, secondRequest]);
    await loadProviderConfigs("user-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reloads after the user-scoped cache is invalidated", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ providerConfigs: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await loadProviderConfigs("user-1");
    invalidateProviderConfigCache("user-1");
    await loadProviderConfigs("user-1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
