// Shares model eligibility between generation controls and request builders; demo mode comes from project access.
import type { GenerationExecutionMode } from "@uml-platform/contracts";
import { i18n } from "../i18n/i18n";
import { loadUserSettings, type UserSettings } from "./user-settings";

export function generationModelBlockedReason(
  mode: GenerationExecutionMode = "provider",
  settings: Pick<UserSettings, "providerConfigId" | "defaultModel" | "providerModelOptions"> = loadUserSettings(),
): string | null {
  if (mode === "offline-demo") return null;
  if (!settings.providerConfigId.trim() || settings.providerConfigId.trim() === "offline-demo") {
    return i18n.t("generationModel.providerRequired");
  }
  const model = settings.defaultModel.trim();
  if (!model) return i18n.t("generationModel.modelRequired");
  if (model === "offline-demo-fixed-artifacts" ||
    !settings.providerModelOptions.some((option) => option.trim() === model)) {
    return i18n.t("generationModel.modelUnavailable");
  }
  return null;
}
