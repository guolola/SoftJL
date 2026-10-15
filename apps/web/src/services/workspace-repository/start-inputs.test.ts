// Ensures every request builder requires valid real settings and only explicit demo context enables placeholders.
import { afterEach, describe, expect, it } from "vitest";
import type { GenerationExecutionMode, RequirementBaseline } from "@uml-platform/contracts";
import { createProviderSettingsInput, createStartRunInput, createStartDesignRunInput,  createStartDocumentRunInput, createStartFeasibilityRunInput } from "./start-inputs";
import { patchUserSettings } from "../../shared/lib/user-settings";

afterEach(() => localStorage.clear());
const builders = [
  (mode?: GenerationExecutionMode) => createStartRunInput("需求", [], [], [], [], [], mode),
  (mode?: GenerationExecutionMode) => createStartDesignRunInput({} as RequirementBaseline, [], [], [], [], [], [], [], [], mode),
  (mode?: GenerationExecutionMode) => createStartDocumentRunInput("feasibilityStudy", "需求", [], [], [], [], [], [], [], [], undefined, null, null, mode),
  (mode?: GenerationExecutionMode) => createStartFeasibilityRunInput(["context"], mode),
];
describe("generation payload eligibility", () => {
  it.each(builders)("requires real settings unless demo context is explicit %#", (build) => {
    expect(() => build()).toThrow("供应商");
    expect(build("offline-demo").providerSettings).toEqual({ providerConfigId: "offline-demo", model: "offline-demo-fixed-artifacts" });
    patchUserSettings({ providerConfigId: "provider-1", defaultModel: "model-1", providerModelOptions: ["model-1"] });
    expect(build("provider").providerSettings).toEqual({ providerConfigId: "provider-1", model: "model-1" });
    patchUserSettings({ providerModelOptions: ["model-2"] });
    expect(() => build("provider")).toThrow("已不可用");
    expect(build("offline-demo").providerSettings.model).toBe("offline-demo-fixed-artifacts");
  });
  it("rejects missing models even when a provider has available alternatives", () => {
    patchUserSettings({ providerConfigId: "provider-1", defaultModel: "", providerModelOptions: ["model-1"] });
    expect(() => createProviderSettingsInput()).toThrow("选择用于生成的模型");
  });
});
