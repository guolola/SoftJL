// Verifies dynamic provider model display helpers do not provide model candidates.
import { describe, expect, it } from "vitest";
import {
  getProviderModelLabel,
  inferProviderModelGroup,
  normalizeProviderModelCapability,
} from "./provider-model-display";

describe("provider model display helpers", () => {
  it("formats labels from dynamic provider model ids", () => {
    expect(getProviderModelLabel("Pro/moonshotai/Kimi-K2.6")).toBe("Kimi-K2.6");
    expect(getProviderModelLabel("Qwen/Qwen3.7-Max")).toBe("Qwen3.7-Max");
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

  it.each([
    ["deepseek", ["deepseek-v4.1-flash", "deepseek-v4-flash-vision-exp", "deepseek-v4-pro", "deepseek-v4-flash"]],
    ["zhipu", ["glm-5.3-flash", "glm-5.3", "glm-5.2"]],
    ["xunfei", ["xunfei-spark-x1-0725", "xunfei-spark-lite"]],
    ["qwen", ["qwen3.8-flash", "qwen3.8-max", "qwen3.7-plus", "qwen3.7-max"]],
    ["mimo", ["mimo-v2.6-pro", "mimo-v2.5-pro"]],
    ["minimax", ["MiniMax-M3", "MiniMax-M2.7-highspeed", "MiniMax-M2.7"]],
    ["doubao", ["doubao-seed-evolving", "doubao-seed-2-1-turbo-260628", "doubao-seed-2-1-pro-260628", "Doubao-Seed-2.0-mini", "Doubao-Seed-2.0-lite", "Doubao-Seed-2.0-pro"]],
    ["ernie", ["ernie-5.1", "ERNIE-X1.1-Preview", "ERNIE-5.0", "ERNIE-5.0-Thinking-Preview", "ERNIE-4.5-Turbo-32K"]],
    ["step", ["step-3.7-flash", "step-3.5-flash"]],
    ["kimi", ["kimi-k3", "kimi-k2.7-code"]],
  ])("recognizes the configured %s models independently of provider labels", (providerId, modelIds) => {
    for (const modelId of modelIds) {
      expect(inferProviderModelGroup(modelId, "系统默认").id).toBe(providerId);
    }
  });

  it.each([
    ["openrouter/Qwen38-Max", "qwen"],
    ["Pro/moonshotai/Kimi-K3", "kimi"],
    ["zai/glm-5.3", "zhipu"],
    ["Xiaomi/MiMo-V2.6-Pro", "mimo"],
    ["claude-opus-4.8", "claude"],
    ["gemini-3.1-pro", "google"],
    ["o1-mini", "openai"],
    ["o3", "openai"],
    ["o4-mini", "openai"],
    ["groq/llama-3", "groq"],
    ["meta/llama-3", "meta"],
    ["mistral-large", "mistral"],
    ["openrouter/auto", "openrouter"],
    ["xai/grok-4", "xai"],
  ])("recognizes brand keywords and gateway prefixes in %s", (modelId, providerId) => {
    expect(inferProviderModelGroup(modelId, "系统默认").id).toBe(providerId);
  });

  it("keeps missing modes unknown even when retired flags claim support", () => {
    expect(normalizeProviderModelCapability("qwen3.7-max")).toBeNull();
    expect(normalizeProviderModelCapability("qwen3.7-max", { supportsJsonSchema: true })).toBeNull();
  });

  it("derives display fields only from an explicit current output mode", () => {
    expect(normalizeProviderModelCapability("qwen3.7-max", { structuredOutputMode: "compatible" })).toMatchObject({
      id: "qwen3.7-max",
      structuredOutputMode: "compatible",
      supportsJsonSchema: false,
      supportsJsonObject: false,
      modeLabel: "兼容模式",
    });
  });
});
