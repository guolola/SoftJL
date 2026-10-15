// Normalizes provider-managed model catalogs without adding platform defaults.
import { ProviderConfigPolicyError } from "./provider-url-policy.js";
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

export function requireAllowedModels(
  defaultModel: string,
  allowedModels: string[] | undefined,
  context: { baseUrl: string; provider: string },
) {
  const normalized = normalizeProviderAllowedModels(defaultModel, allowedModels, context);
  if (normalized.length === 0) {
    throw new ProviderConfigPolicyError(
      "Provider config requires at least one allowed model",
    );
  }
  if (!normalized.includes(defaultModel)) {
    throw new ProviderConfigPolicyError(
      "Provider default model must be included in allowed models",
    );
  }
  return normalized;
}
