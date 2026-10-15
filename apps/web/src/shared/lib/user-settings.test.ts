// Covers persisted user settings defaults and normalization behavior.
import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_USER_SETTINGS, USER_SETTINGS_STORAGE_KEY, loadUserSettings } from "./user-settings";

describe("user settings defaults", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not seed a static default model without a provider", () => {
    expect(DEFAULT_USER_SETTINGS.defaultModel).toBe("");
    expect(loadUserSettings().defaultModel).toBe("");
  });

  it("clears persisted models when no provider is selected", () => {
    localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        defaultModel: "retired-model",
      }),
    );

    expect(loadUserSettings().defaultModel).toBe("");
  });

  it("keeps server-managed provider models outside the static catalog", () => {
    localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        providerConfigId: "provider-system-siliconflow",
        providerLabel: "SiliconFlow",
        providerModelOptions: [
          "deepseek-ai/DeepSeek-V4-Pro",
          "Qwen/Qwen3.5-72B-Instruct",
        ],
        providerModelCapabilities: {
          "deepseek-ai/DeepSeek-V4-Pro": {
            id: "deepseek-ai/DeepSeek-V4-Pro",
            structuredOutputMode: "strict_json",
            supportsJsonSchema: true,
            supportsJsonObject: true,
            modeLabel: "严格 JSON",
          },
          "retired-model": {
            id: "retired-model",
            supportsJsonSchema: true,
          },
        },
        defaultModel: "deepseek-ai/DeepSeek-V4-Pro",
      }),
    );

    expect(loadUserSettings()).toMatchObject({
      providerConfigId: "provider-system-siliconflow",
      providerLabel: "SiliconFlow",
      providerModelOptions: [
        "deepseek-ai/DeepSeek-V4-Pro",
        "Qwen/Qwen3.5-72B-Instruct",
      ],
      providerModelCapabilities: {
        "deepseek-ai/DeepSeek-V4-Pro": {
          id: "deepseek-ai/DeepSeek-V4-Pro",
          structuredOutputMode: "strict_json",
          supportsJsonSchema: true,
          supportsJsonObject: true,
          modeLabel: "严格 JSON",
        },
      },
      defaultModel: "deepseek-ai/DeepSeek-V4-Pro",
    });
  });
});
