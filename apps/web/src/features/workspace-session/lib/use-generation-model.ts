// Keeps model eligibility reactive when the provider, its catalog, model, or locale changes.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GenerationExecutionMode } from "@uml-platform/contracts";
import { generationModelBlockedReason } from "../../../shared/lib/generation-model";
import { loadUserSettings, USER_SETTINGS_CHANGED_EVENT, USER_SETTINGS_STORAGE_KEY } from "../../../shared/lib/user-settings";

export function useGenerationModel(mode: GenerationExecutionMode) {
  useTranslation();
  const [settings, setSettings] = useState(loadUserSettings);
  useEffect(() => {
    const sync = () => setSettings(loadUserSettings());
    const onStorage = (event: StorageEvent) => {
      if (event.key === USER_SETTINGS_STORAGE_KEY || event.key === null) sync();
    };
    sync();
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return generationModelBlockedReason(mode, settings);
}
