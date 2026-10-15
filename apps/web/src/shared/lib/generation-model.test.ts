// Covers real-model eligibility and the explicit demo exemption independently of page state.
import { afterEach, describe, expect, it } from "vitest";
import { generationModelBlockedReason } from "./generation-model";
import { loadUserSettings, USER_SETTINGS_STORAGE_KEY } from "./user-settings";

afterEach(() => localStorage.clear());
describe("generation model eligibility", () => {
  const valid = { providerConfigId: "provider-1", defaultModel: "model-1", providerModelOptions: ["model-1"] };
  it.each([
    [{ ...valid, providerConfigId: "" }, "供应商"],
    [{ ...valid, defaultModel: "" }, "选择用于生成的模型"],
    [{ ...valid, defaultModel: "removed" }, "已不可用"],
    [{ ...valid, providerModelOptions: [] }, "已不可用"],
    [{ ...valid, providerConfigId: "offline-demo" }, "供应商"],
    [{ ...valid, defaultModel: "offline-demo-fixed-artifacts", providerModelOptions: ["offline-demo-fixed-artifacts"] }, "已不可用"],
  ])("blocks invalid real settings %# but allows explicit demos", (settings, reason) => {
    expect(generationModelBlockedReason("provider", settings)).toContain(reason);
    expect(generationModelBlockedReason("offline-demo", settings)).toBeNull();
  });
  it("accepts a valid current catalog selection", () => {
    expect(generationModelBlockedReason("provider", valid)).toBeNull();
  });
  it.each(["", "removed"])("does not silently replace a missing or retired selection: %s", (defaultModel) => {
    localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify({ ...valid, defaultModel }));
    expect(loadUserSettings().defaultModel).toBe(defaultModel);
    expect(generationModelBlockedReason()).not.toBeNull();
  });
});
