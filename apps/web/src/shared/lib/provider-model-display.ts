// Formats dynamically configured provider model ids without supplying candidates.
export type ProviderModelGroup = {
  id: string;
  label: string;
};

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
  const normalized = modelId.toLowerCase();
  if (/(^|[/_.-])(deepseek|deepseek-ai)([/_.-]|$)/u.test(normalized)) {
    return { id: "deepseek", label: "DeepSeek" };
  }
  if (/(^|[/_.-])(kimi|moonshot|moonshotai)([/_.-]|$)/u.test(normalized)) {
    return { id: "kimi", label: "Kimi" };
  }
  if (/(^|[/_.-])(qwen|qwen\d|aliyun|dashscope)([/_.-]|$)/u.test(normalized)) {
    return { id: "qwen", label: "Qwen" };
  }
  if (/(^|[/_.-])(glm|zai-org|zhipu|thudm)([/_.-]|$)/u.test(normalized)) {
    return { id: "zhipu", label: "智谱" };
  }
  if (/(^|[/_.-])(minimax|minimaxai)([/_.-]|$)/u.test(normalized)) {
    return { id: "minimax", label: "Minimax" };
  }
  if (/(^|[/_.-])(doubao|seed)([/_.-]|$)/u.test(normalized)) {
    return { id: "doubao", label: "豆包" };
  }
  if (/(^|[/_.-])(ernie|wenxin)([/_.-]|$)/u.test(normalized)) {
    return { id: "ernie", label: "文心" };
  }
  if (/(^|[/_.-])(hunyuan)([/_.-]|$)/u.test(normalized)) {
    return { id: "hunyuan", label: "混元" };
  }
  if (/(^|[/_.-])(step|stepfun)([/_.-]|$)/u.test(normalized)) {
    return { id: "step", label: "阶跃星辰" };
  }
  if (/(^|[/_.-])(spark|xunfei|iflytek)([/_.-]|$)/u.test(normalized)) {
    return { id: "xunfei", label: "讯飞星火" };
  }
  if (/(^|[/_.-])(claude|anthropic)([/_.-]|$)/u.test(normalized)) {
    return { id: "claude", label: "Claude" };
  }
  if (/(^|[/_.-])(gemini|gemma|google)([/_.-]|$)/u.test(normalized)) {
    return { id: "google", label: "Google" };
  }
  if (/(^|[/_.-])(gpt|openai|o3|o4)([/_.-]|$)/u.test(normalized)) {
    return { id: "openai", label: "OpenAI" };
  }

  const label = fallbackLabel.trim() || "托管 Provider";
  return { id: `provider-${normalizeGroupId(label)}`, label };
}

export function getProviderModelDisplayName(modelId: string, fallbackLabel = "") {
  const shortLabel = getProviderModelLabel(modelId);
  const vendor = inferProviderModelGroup(modelId, fallbackLabel);
  return {
    triggerLabel: modelId.trim() ? shortLabel : "未选择模型",
    vendorLabel: vendor.label,
    shortLabel,
  };
}

export function normalizeProviderModelCapability(
  modelId: string,
  capability?: Partial<ModelCapability> | null,
): ModelCapability {
  const structuredOutputMode =
    capability?.structuredOutputMode === "strict_json" ||
    capability?.structuredOutputMode === "json_object" ||
    capability?.structuredOutputMode === "compatible"
      ? capability.structuredOutputMode
      : capability?.supportsJsonSchema === true
        ? "strict_json"
        : capability?.supportsJsonObject === true
          ? "json_object"
          : "compatible";
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
