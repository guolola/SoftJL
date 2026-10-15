// Covers frontend normalization for admin-managed provider model policies.
import { describe, expect, it } from "vitest";
import {
  getProviderAllowedModels,
  getProviderLabel,
  resolveProviderModel,
  sortProviderConfigsByScope,
} from "./provider-config-models";

describe("provider config model helpers", () => {
  it("uses only the provider allowed model list as selectable models", () => {
    expect(
      getProviderAllowedModels({
        defaultModel: "gpt-5.5",
        allowedModels: ["gpt-5.5-pro", "gpt-5.5", "gpt-5.5-pro"],
      }),
    ).toEqual(["gpt-5.5-pro", "gpt-5.5"]);
  });

  it("returns an empty model when the provider has no allowed models", () => {
    expect(
      resolveProviderModel(
        {
          defaultModel: "gpt-5.5",
          allowedModels: [],
        },
        "glm-5.1",
      ),
    ).toBe("");
  });

  it("falls back to the provider default when the current model is not allowed", () => {
    expect(
      resolveProviderModel(
        {
          defaultModel: "gpt-5.5",
          allowedModels: ["gpt-5.5"],
        },
        "glm-5.1",
      ),
    ).toBe("gpt-5.5");
  });

  it("formats managed provider labels for model picker grouping", () => {
    expect(getProviderLabel({ provider: "siliconflow" })).toBe("SiliconFlow");
    expect(getProviderLabel({ provider: "openai-compatible" })).toBe("OpenAI Compatible");
    expect(getProviderLabel({ provider: "custom_provider" })).toBe("Custom Provider");
  });

  it("sorts providers by user, system, project, then other scopes", () => {
    expect(
      sortProviderConfigsByScope([
        { id: "project", name: "项目 Provider", scopeType: "project" },
        { id: "other", name: "其他 Provider", scopeType: "organization" },
        { id: "system", name: "系统 Provider", scopeType: "system" },
        { id: "user-b", name: "用户 B", scopeType: "user" },
        { id: "user-a", name: "用户 A", scopeType: "user" },
      ]).map((config) => config.id),
    ).toEqual(["user-a", "user-b", "system", "project", "other"]);
  });
});
