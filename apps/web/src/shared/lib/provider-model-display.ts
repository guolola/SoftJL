// Formats dynamically configured provider model ids without supplying candidates.
import { providerStructuredOutputModeSchema } from "@uml-platform/contracts";

export type ProviderModelGroup = {
  id: string;
  label: string;
};

// Both modeling menus identify brands from model names, including gateway-prefixed IDs.
const modelBrands = [
  { id: "deepseek", label: "DeepSeek", keywords: ["deepseek"] },
  { id: "kimi", label: "Kimi", keywords: ["kimi", "moonshot"] },
  { id: "qwen", label: "Qwen", keywords: ["qwen", "aliyun", "dashscope"] },
  { id: "zhipu", label: "智谱", keywords: ["glm", "zai", "zhipu", "thudm"] },
  { id: "minimax", label: "Minimax", keywords: ["minimax"] },
  { id: "mimo", label: "MiMo", keywords: ["mimo", "xiaomi"] },
  { id: "doubao", label: "豆包", keywords: ["doubao", "seed"] },
  { id: "ernie", label: "文心", keywords: ["ernie", "wenxin"] },
  { id: "hunyuan", label: "混元", keywords: ["hunyuan"] },
  { id: "step", label: "阶跃星辰", keywords: ["step"] },
  { id: "xunfei", label: "讯飞星火", keywords: ["spark", "xunfei", "iflytek"] },
  { id: "claude", label: "Claude", keywords: ["claude", "anthropic"] },
  { id: "google", label: "Google", keywords: ["gemini", "gemma", "google"] },
  { id: "openai", label: "OpenAI", keywords: ["gpt", "openai"] },
  { id: "groq", label: "Groq", keywords: ["groq"] },
  { id: "meta", label: "Meta", keywords: ["meta"] },
  { id: "mistral", label: "Mistral", keywords: ["mistral"] },
  { id: "openrouter", label: "OpenRouter", keywords: ["openrouter"] },
  { id: "xai", label: "xAI", keywords: ["xai", "grok"] },
];

export type ModelCapability = {
  id?: string;
  supportsJsonSchema: boolean;
  supportsJsonObject: boolean;
  structuredOutputMode: "strict_json" | "json_object" | "compatible";
  modeLabel: string;
  warning?: string;
};

function normalizeGroupId(label: string) {
  return label.toLowerCase().replace(/\s+/gu, "-");
}

export function getProviderModelLabel(modelId: string) {
  const trimmed = modelId.trim();
  if (!trimmed) return "未选择模型";
  const parts = trimmed.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
}

export function inferProviderModelGroup(
  modelId: string,
  fallbackLabel: string,
): ProviderModelGroup {
  // Prefer the model name over gateway namespaces such as openrouter/qwen3.8-max.
  for (const name of [getProviderModelLabel(modelId), modelId]) {
    const normalized = name.toLowerCase();
    const brand = modelBrands.find(group => group.keywords.some(keyword => normalized.includes(keyword)));
    if (brand) return { id: brand.id, label: brand.label };
  }
  if (/(^|[/_.-])o[134]([/_.-]|$)/u.test(modelId.toLowerCase())) {
    return { id: "openai", label: "OpenAI" };
  }

  const label = fallbackLabel.trim() || "托管 Provider";
  return { id: `provider-${normalizeGroupId(label)}`, label };
}

export function normalizeProviderModelCapability(
  modelId: string,
  capability?: Partial<ModelCapability> | null,
): ModelCapability | null {
  const mode = providerStructuredOutputModeSchema.safeParse(capability?.structuredOutputMode);
  // Missing mode metadata stays unknown; retired boolean flags cannot establish a capability.
  if (!mode.success) return null;
  const structuredOutputMode = mode.data;
  return {
    id: capability?.id ?? modelId,
    structuredOutputMode,
    supportsJsonSchema: structuredOutputMode === "strict_json",
    supportsJsonObject:
      structuredOutputMode === "strict_json" ||
      structuredOutputMode === "json_object",
    modeLabel:
      capability?.modeLabel ??
      (structuredOutputMode === "strict_json"
        ? "严格 JSON"
        : structuredOutputMode === "json_object"
          ? "JSON 模式"
          : "兼容模式"),
    warning:
      capability?.warning ??
      (structuredOutputMode === "compatible" && modelId.trim()
        ? "该模型将使用普通输出，并通过校验与修复重试保证结构。"
        : undefined),
  };
}
