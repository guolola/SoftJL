// Covers persisted user settings defaults and normalization behavior.
import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_USER_SETTINGS, USER_SETTINGS_STORAGE_KEY, loadUserSettings, patchUserSettings } from "./user-settings";

describe("user settings defaults", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("enables the completion sound by default and persists muting", () => {
    expect(loadUserSettings().completionSound).toBe(true);
    patchUserSettings({ completionSound: false });
    expect(JSON.parse(localStorage.getItem(USER_SETTINGS_STORAGE_KEY)!)).toMatchObject({ completionSound: false });
    expect(loadUserSettings().completionSound).toBe(false);
    localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify({ completionSound: "off" }));
    expect(loadUserSettings().completionSound).toBe(true);
  });

  it("does not seed a static default model without a provider", () => {
    expect(DEFAULT_USER_SETTINGS.defaultModel).toBe("");
    expect(loadUserSettings().defaultModel).toBe("");
  });

  it("does not infer capabilities from retired boolean flags or retain removed preferences", () => {
    localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify({
      providerConfigId: "provider", providerModelOptions: ["model"],
      providerModelCapabilities: { model: { supportsJsonSchema: true, supportsJsonObject: true } },
      imageModel: "retired", fontSize: "lg",
    }));
    const settings = loadUserSettings();
    expect(settings.providerModelCapabilities).toEqual({});
    expect(settings).not.toHaveProperty("imageModel");
    expect(settings).not.toHaveProperty("fontSize");
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
