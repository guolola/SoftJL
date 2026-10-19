// Resolves current model capabilities for engineering or ordinary project generation controls.
import { useEffect, useState } from "react";
import { modelContextSettingsSchema, type ModelContextSettings } from "@uml-platform/contracts";
import { requestJson } from "../api-client";
import { loadUserSettings, USER_SETTINGS_CHANGED_EVENT, USER_SETTINGS_STORAGE_KEY } from "../../shared/lib/user-settings";

export function useModelingModelContext(projectId: string | null) {
  const [settings, setSettings] = useState(loadUserSettings);
  const [resolved, setResolved] = useState<{ identity: string; context: ModelContextSettings }>();
  const identity = JSON.stringify([projectId, settings.providerConfigId, settings.defaultModel]);
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
  useEffect(() => {
    let active = true;
    if (projectId && settings.providerConfigId && settings.defaultModel) {
      const query = new URLSearchParams({ providerConfigId: settings.providerConfigId, model: settings.defaultModel });
      void (async () => {
        try {
          const response = await requestJson<unknown>(`/api/projects/${encodeURIComponent(projectId)}/model-context?${query}`);
          const context = modelContextSettingsSchema.parse(response);
          if (active && context.model === settings.defaultModel) setResolved({ identity, context });
        } catch { /* Unknown capabilities must never enable image or reasoning input. */ }
      })();
    }
    return () => { active = false; };
  }, [identity, projectId, settings.defaultModel, settings.providerConfigId]);
  return { settings, modelContext: resolved?.identity === identity ? resolved.context : undefined };
}
