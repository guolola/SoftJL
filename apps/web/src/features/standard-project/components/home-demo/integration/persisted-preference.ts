// Keeps the upstream preference hook and effort storage while sharing the platform model selection.
import { createPersistedPreference as upstreamCreate, type PersistedPreference } from "../source/utils/persisted-preference";
import { loadUserSettings, patchUserSettings, USER_SETTINGS_CHANGED_EVENT } from "../../../../../shared/lib/user-settings";
import { canSelectHomeModel, isAvailableModelId } from "./model";
export { usePersistedPreference } from "../source/utils/persisted-preference";

// Retain source IDs and existing saved choices: low = No, medium = Yes; neither is a user-selectable intensity.
export const homeEffortPreference = upstreamCreate<string>({ key: "aui-home-effort", fallback: "low", read: raw => ["low", "medium"].includes(raw) ? raw : null });
export function createPersistedPreference<T>(options: Parameters<typeof upstreamCreate<T>>[0]): PersistedPreference<T> {
  if (options.key === "aui-home-effort") return homeEffortPreference as PersistedPreference<T>;
  if (options.key !== "aui-home-model") return upstreamCreate(options);
  return {
    get: () => loadUserSettings().defaultModel as T,
    getServerSnapshot: () => options.fallback,
    set: value => { if (typeof value === "string" && canSelectHomeModel() && isAvailableModelId(value)) patchUserSettings({ defaultModel: value }); },
    subscribe: listener => { window.addEventListener(USER_SETTINGS_CHANGED_EVENT, listener); return () => window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, listener); },
    resync: () => {},
  };
}
