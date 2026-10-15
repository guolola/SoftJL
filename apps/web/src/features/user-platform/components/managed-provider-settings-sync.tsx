// Keeps persisted model settings aligned with the server-managed provider catalog after login.
import { useEffect } from "react";
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from "../../../shared/lib/user-settings";
import {
  getProviderAllowedModels,
  getProviderLabel,
  getProviderModelCapabilities,
  resolveProviderModel,
  sortProviderConfigsByScope,
} from "../../../shared/lib/provider-config-models";
import {
  type PlatformAccountProfileResponse,
  type PlatformProviderConfig,
} from "../services/platform-api";
import { loadProviderConfigs } from "../services/provider-config-cache";

function sameSettings(left: UserSettings, right: UserSettings) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function resolveManagedProviderSettingsSync(
  providerConfigs: PlatformProviderConfig[],
  current: UserSettings,
): UserSettings | null {
  const activeConfigs = sortProviderConfigsByScope(
    providerConfigs.filter((config) => config.status === "active"),
  );
  const selectedProvider =
    activeConfigs.find((config) => config.id === current.providerConfigId.trim()) ??
    activeConfigs[0];

  if (!selectedProvider) {
    const cleared = {
      ...current,
      providerConfigId: "",
      providerModelCapabilities: {},
      providerModelOptions: [],
      providerLabel: "",
      providerDefaultModelSeededFor: "",
      defaultModel: DEFAULT_USER_SETTINGS.defaultModel,
    };
    return sameSettings(current, cleared) ? null : cleared;
  }

  const shouldSeedProviderDefault =
    current.providerConfigId.trim() !== selectedProvider.id ||
    current.providerDefaultModelSeededFor !== selectedProvider.id;
  const nextDefaultModel = shouldSeedProviderDefault
    ? resolveProviderModel(selectedProvider, selectedProvider.defaultModel ?? "")
    : resolveProviderModel(selectedProvider, current.defaultModel);

  const next = {
    ...current,
    providerConfigId: selectedProvider.id,
    providerModelCapabilities: getProviderModelCapabilities(selectedProvider),
    providerModelOptions: getProviderAllowedModels(selectedProvider),
    providerLabel: getProviderLabel(selectedProvider),
    providerDefaultModelSeededFor: selectedProvider.id,
    defaultModel: nextDefaultModel,
  };
  return sameSettings(current, next) ? null : next;
}

export function ManagedProviderSettingsSync({
  session,
}: {
  session: PlatformAccountProfileResponse | null;
}) {
  const userId = session?.user?.id ?? "";

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const refreshProviderSettings = () => {
      loadProviderConfigs(userId)
        .then((response) => {
          if (cancelled) return;
          const next = resolveManagedProviderSettingsSync(
            response.providerConfigs,
            loadUserSettings(),
          );
          if (next) {
            saveUserSettings(next);
          }
        })
        .catch(() => {
          // Keep route rendering independent from catalog refresh failures.
        });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshProviderSettings();
    };

    refreshProviderSettings();
    window.addEventListener("focus", refreshProviderSettings);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshProviderSettings);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [userId]);

  return null;
}
