// Normalizes model choices against server-managed provider config policy.
import { normalizeProviderModelCapability } from "./provider-model-display";

export type ProviderModelPolicy = {
  defaultModel?: string | null;
  allowedModels?: string[] | null;
  modelCapabilities?: Record<
    string,
    {
      id?: string;
      supportsJsonSchema?: boolean;
      supportsJsonObject?: boolean;
      structuredOutputMode?: "strict_json" | "json_object" | "compatible";
      modeLabel?: string;
    }
  > | null;
  provider?: string | null;
  name?: string | null;
};

export type ProviderScopePolicy = {
  name: string;
  scopeType?: string | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  "openai": "OpenAI",
  "openai-compatible": "OpenAI Compatible",
  "siliconflow": "SiliconFlow",
  "comfly": "Comfly",
  "anthropic": "Claude",
  "claude": "Claude",
  "google": "Google",
  "deepseek": "DeepSeek",
  "minimax": "Minimax",
  "aliyun": "Aliyun",
  "zhipu": "智谱",
};

export function getProviderAllowedModels(config: ProviderModelPolicy | null | undefined) {
  const normalized = new Set(
    (config?.allowedModels ?? [])
      .map((model) => model.trim())
      .filter(Boolean),
  );
  return Array.from(normalized);
}

export function getProviderModelCapabilities(
  config: ProviderModelPolicy | null | undefined,
) {
  const allowedModels = new Set(getProviderAllowedModels(config));
  return Object.fromEntries(
    Object.entries(config?.modelCapabilities ?? {}).flatMap(([model, capability]) => {
      const normalizedModel = model.trim();
      if (!normalizedModel || !allowedModels.has(normalizedModel)) return [];
      const normalized = normalizeProviderModelCapability(normalizedModel, capability);
      return normalized ? [[normalizedModel, { ...capability, ...normalized }]] : [];
    }),
  );
}

export function resolveProviderModel(
  config: ProviderModelPolicy | null | undefined,
  currentModel: string,
) {
  const allowedModels = getProviderAllowedModels(config);
  const trimmedCurrent = currentModel.trim();
  if (trimmedCurrent && allowedModels.includes(trimmedCurrent)) {
    return trimmedCurrent;
  }
  return allowedModels[0] ?? "";
}

export function getProviderLabel(config: ProviderModelPolicy | null | undefined) {
  const provider = config?.provider?.trim();
  if (provider) {
    const normalized = provider.toLowerCase();
    if (PROVIDER_LABELS[normalized]) return PROVIDER_LABELS[normalized];
    return provider
      .split(/[-_\s]+/u)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return config?.name?.trim() || "托管 Provider";
}

function providerScopePriority(config: ProviderScopePolicy) {
  if (config.scopeType === "user") return 0;
  if (config.scopeType === "system") return 1;
  if (config.scopeType === "project") return 2;
  return 3;
}

export function sortProviderConfigsByScope<T extends ProviderScopePolicy>(
  configs: T[],
) {
  return [...configs].sort((left, right) => {
    const priority = providerScopePriority(left) - providerScopePriority(right);
    if (priority !== 0) return priority;
    return left.name.localeCompare(right.name, "zh-Hans-CN");
  });
}
