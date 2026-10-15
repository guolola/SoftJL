// Normalizes provider-managed model catalogs without adding platform defaults.
export function normalizeProviderAllowedModels(
  _defaultModel: string,
  allowedModels?: string[] | null,
  _context?: {
    baseUrl?: string | null;
    provider?: string | null;
  },
) {
  const normalized = new Set(
    (allowedModels ?? [])
      .map((model) => model.trim())
      .filter(Boolean),
  );
  return Array.from(normalized);
}
