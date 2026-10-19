// Shares the platform's selected provider/model with the homepage composer and Modelpedia context data.
import { useEffect, useState } from "react";
import { loadUserSettings, USER_SETTINGS_CHANGED_EVENT } from "../../../shared/lib/user-settings";
import type { ModelContextSettings } from "@uml-platform/contracts";
import { standardApi } from "../services/standard-api";

export function useConversationSettings(projectId: string) {
  const [settings, setSettings] = useState(loadUserSettings);
  const identity = JSON.stringify([projectId, settings.providerConfigId, settings.defaultModel]);
  const [resolved, setResolved] = useState<{ identity: string; context: ModelContextSettings }>({ identity: "", context: undefined });
  useEffect(() => {
    const update = () => setSettings(loadUserSettings());
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, update);
    return () => window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, update);
  }, []);
  useEffect(() => {
    let active = true;
    if (settings.providerConfigId && settings.defaultModel) void (async () => {
      try {
        const context = await standardApi.modelContext(projectId, settings.providerConfigId, settings.defaultModel);
        if (active) setResolved({ identity, context });
      } catch { /* Unknown metadata never fabricates a model capability or capacity. */ }
    })();
    return () => { active = false; };
  }, [identity, projectId, settings.providerConfigId, settings.defaultModel]);
  return { settings, modelContext: resolved.identity === identity ? resolved.context : undefined };
}
