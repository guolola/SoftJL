// Supplies explicit current structured-output metadata to direct pipeline tests without provider discovery.
import type { ProviderModelCapability } from "@uml-platform/contracts";

export function strictTestModelCapability(modelId: string): ProviderModelCapability {
  return { id: modelId, category: "text_chat", structuredOutputMode: "strict_json", supportsJsonSchema: true,
    supportsJsonObject: true, strictJson: true, modeLabel: "严格 JSON", probeStatus: "strict",
    probedAt: "2026-10-18T00:00:00.000Z" };
}

export function compatibleTestModelCapability(modelId: string): ProviderModelCapability {
  return { ...strictTestModelCapability(modelId), structuredOutputMode: "compatible", supportsJsonSchema: false,
    supportsJsonObject: false, strictJson: false, modeLabel: "兼容模式", probeStatus: "compatible" };
}
