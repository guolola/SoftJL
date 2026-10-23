// Routes structured output only from explicit current provider capabilities.
import { providerModelCapabilitySchema, type ProviderModelCapability, type ProviderSettings } from "@uml-platform/contracts";
import type { ChatCompletionResponseFormat, JsonSchemaResponseFormat } from "./llm-transport.js";

export interface ModelCapability {
  supportsJsonSchema: boolean;
  supportsJsonObject: boolean;
  structuredOutputMode: "strict_json" | "json_object" | "compatible";
  modeLabel: string;
  warning?: string;
}

export type ModelCapabilitySource =
  | ProviderModelCapability
  | Pick<ProviderSettings, "model" | "modelCapability">;

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
  if (!input || typeof input !== "object") {
    throw new Error("Provider settings require explicit persisted model capabilities");
  }
  const capability = "model" in input ? input.modelCapability : input;
  if (!capability) throw new Error("Provider settings require explicit persisted model capabilities");
  return capabilityFromPersisted(providerModelCapabilitySchema.parse(capability));
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
