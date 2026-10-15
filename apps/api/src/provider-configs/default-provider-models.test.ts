// Verifies managed provider configs preserve dynamic model catalogs.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProviderAllowedModels } from "./default-provider-models.js";

test("provider config model normalization does not add platform defaults", () => {
  const allowed = normalizeProviderAllowedModels("gpt-5.4", [
    "custom-model",
    "custom-model",
    "  qwen3.7-max  ",
  ]);

  assert.deepEqual(allowed, ["custom-model", "qwen3.7-max"]);
  assert.equal(allowed.includes("gpt-5.4"), false);
  assert.equal(allowed.includes("gpt-5.5-pro"), false);
  assert.equal(allowed.includes("claude-opus-4-7"), false);
  assert.equal(allowed.includes("gemini-3.1-pro-preview-thinking-medium"), false);
});

test("provider-specific model catalogs are returned unchanged", () => {
  const allowed = normalizeProviderAllowedModels(
    "deepseek-ai/DeepSeek-V4-Pro",
    [
      "deepseek-ai/DeepSeek-V4-Pro",
      "deepseek-ai/DeepSeek-V4-Flash",
      "Pro/moonshotai/Kimi-K2.6",
      "Pro/zai-org/GLM-5.1",
      "Pro/MiniMaxAI/MiniMax-M2.5",
      "Qwen/Qwen3.6-35B-A3B",
    ],
    { baseUrl: "https://api.siliconflow.cn/v1", provider: "siliconflow" },
  );

  assert.deepEqual(allowed, [
    "deepseek-ai/DeepSeek-V4-Pro",
    "deepseek-ai/DeepSeek-V4-Flash",
    "Pro/moonshotai/Kimi-K2.6",
    "Pro/zai-org/GLM-5.1",
    "Pro/MiniMaxAI/MiniMax-M2.5",
    "Qwen/Qwen3.6-35B-A3B",
  ]);
  assert.equal(allowed.includes("gpt-5.5-pro"), false);
  assert.equal(allowed.includes("gpt-5.4"), false);
});
