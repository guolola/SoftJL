// Verifies dynamic provider model display helpers do not provide model candidates.
import { describe, expect, it } from "vitest";
import {
  getProviderModelDisplayName,
  getProviderModelLabel,
  inferProviderModelGroup,
  normalizeProviderModelCapability,
} from "./provider-model-display";

describe("provider model display helpers", () => {
  it("formats labels from dynamic provider model ids", () => {
    expect(getProviderModelLabel("Pro/moonshotai/Kimi-K2.6")).toBe("Kimi-K2.6");
    expect(getProviderModelDisplayName("Qwen/Qwen3.7-Max")).toMatchObject({
      triggerLabel: "Qwen3.7-Max",
      vendorLabel: "Qwen",
      shortLabel: "Qwen3.7-Max",
    });
  });

  it("infers groups without making models selectable", () => {
    expect(inferProviderModelGroup("gpt-5.5-pro", "Nonelinear")).toEqual({
      id: "openai",
      label: "OpenAI",
    });
    expect(inferProviderModelGroup("vendorless-ultra-model", "Nonelinear")).toEqual({
      id: "provider-nonelinear",
      label: "Nonelinear",
    });
  });

  it("normalizes missing capabilities as compatible", () => {
    expect(normalizeProviderModelCapability("qwen3.7-max")).toMatchObject({
      id: "qwen3.7-max",
      structuredOutputMode: "compatible",
      supportsJsonSchema: false,
      supportsJsonObject: false,
      modeLabel: "兼容模式",
    });
  });
});
