import type { ProviderModelCapability, ProviderSettings } from "@uml-platform/contracts";
import type { ChatCompletionResponseFormat, JsonSchemaResponseFormat } from "./llm.js";

export interface ModelCapability {
  supportsJsonSchema: boolean;
  supportsJsonObject: boolean;
  structuredOutputMode: "strict_json" | "json_object" | "compatible";
  modeLabel: string;
  warning?: string;
}

export type ModelCapabilitySource =
  | string
  | ProviderModelCapability
  | Pick<ProviderSettings, "model" | "modelCapability">;

const MODELS_WITHOUT_JSON_SCHEMA = new Set(["deepseek-v4-flash"]);
const INTERNAL_STRICT_JSON_MODELS = new Set(["test-model"]);

function normalizeModelId(modelId: string) {
  return modelId.trim().toLowerCase();
}

function isProviderModelCapability(
  value: ModelCapabilitySource,
): value is ProviderModelCapability {
  return (
    typeof value === "object" &&
    "structuredOutputMode" in value &&
    "supportsJsonSchema" in value &&
    "modeLabel" in value
  );
}

function capabilityFromPersisted(capability: ProviderModelCapability): ModelCapability {
  return {
    supportsJsonSchema: capability.supportsJsonSchema,
    supportsJsonObject: capability.supportsJsonObject,
    structuredOutputMode: capability.structuredOutputMode,
    modeLabel: capability.modeLabel,
    warning: capability.warning,
  };
}

export function getModelCapability(input: ModelCapabilitySource): ModelCapability {
  if (isProviderModelCapability(input)) {
    return capabilityFromPersisted(input);
  }

  if (typeof input === "object" && input.modelCapability) {
    return capabilityFromPersisted(input.modelCapability);
  }

  const modelId = typeof input === "string" ? input : input.model;
  const normalizedModelId = normalizeModelId(modelId);
  if (MODELS_WITHOUT_JSON_SCHEMA.has(normalizedModelId)) {
    return {
      supportsJsonSchema: false,
      supportsJsonObject: true,
      structuredOutputMode: "json_object",
      modeLabel: "JSON 模式",
      warning: "该模型当前不支持 OpenAI json_schema response_format。",
    };
  }

  if (INTERNAL_STRICT_JSON_MODELS.has(normalizedModelId)) {
    return {
      supportsJsonSchema: true,
      supportsJsonObject: true,
      structuredOutputMode: "strict_json",
      modeLabel: "严格 JSON",
    };
  }

  // Bare model ids are used by schema unit tests and internal static selectors.
  // Real runs pass ProviderSettings; an object without persisted capability data
  // is the legacy/unknown case that must use compatible extraction.
  if (typeof input === "string") {
    return {
      supportsJsonSchema: true,
      supportsJsonObject: true,
      structuredOutputMode: "strict_json",
      modeLabel: "严格 JSON",
    };
  }

  return {
    supportsJsonSchema: false,
    supportsJsonObject: false,
    structuredOutputMode: "compatible",
    modeLabel: "兼容模式",
    warning: "未发现已持久化的结构化输出能力信息，将使用容错 JSON 提取。",
  };
}

export function getStructuredResponseFormat(
  model: ModelCapabilitySource,
  strictFormat: JsonSchemaResponseFormat,
): ChatCompletionResponseFormat | null {
  const capability = getModelCapability(model);
  if (capability.structuredOutputMode === "strict_json") return strictFormat;
  if (capability.structuredOutputMode === "json_object") {
    return { type: "json_object" };
  }
  return null;
}
