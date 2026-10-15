// Deduplicates the user-scoped provider catalog across background sync and settings views.
import { platformApi } from "./platform-api";

type ProviderConfigListResponse = Awaited<
  ReturnType<typeof platformApi.listProviderConfigs>
>;

const PROVIDER_CONFIG_CACHE_TTL_MS = 30_000;

type ProviderConfigCacheEntry = {
  response: ProviderConfigListResponse | null;
  loadedAt: number;
  pending: Promise<ProviderConfigListResponse> | null;
};

const providerConfigCache = new Map<string, ProviderConfigCacheEntry>();

function getCacheEntry(userId: string) {
  const existing = providerConfigCache.get(userId);
  if (existing) return existing;

  const entry: ProviderConfigCacheEntry = {
    response: null,
    loadedAt: 0,
    pending: null,
  };
  providerConfigCache.set(userId, entry);
  return entry;
}

export function loadProviderConfigs(
  userId: string,
  options: { force?: boolean } = {},
) {
  const entry = getCacheEntry(userId);
  if (entry.pending) return entry.pending;

  const cachedResponse = entry.response;
  const cacheIsFresh =
    cachedResponse !== null &&
    Date.now() - entry.loadedAt < PROVIDER_CONFIG_CACHE_TTL_MS;
  if (!options.force && cacheIsFresh) {
    return Promise.resolve(cachedResponse);
  }

  const pending = platformApi
    .listProviderConfigs()
    .then((response) => {
      entry.response = response;
      entry.loadedAt = Date.now();
      return response;
    })
    .finally(() => {
      if (entry.pending === pending) entry.pending = null;
    });
  entry.pending = pending;
  return pending;
}

export function invalidateProviderConfigCache(userId?: string) {
  if (userId) {
    providerConfigCache.delete(userId);
    return;
  }
  providerConfigCache.clear();
}
