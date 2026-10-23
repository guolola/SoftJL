// Keeps generation and notification preferences independent from provider configuration drafts.
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  saveUserSettings,
  type UserSettings,
} from "../../../shared/lib/user-settings";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { Switch } from "../../../shared/ui/switch";
import { SettingRow } from "./block37-preferences";
import type { GlobalSettingsActions } from "./global-settings-panel";

const preferences = [

  { key: "showStaleBanner", label: "staleBanner" },
  { key: "completionSound", label: "completionSound" },
] as const;
const selectPreferences = (settings: UserSettings) => ({

  showStaleBanner: settings.showStaleBanner,
  completionSound: settings.completionSound,
});

type Props = {
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
};

export const WorkspacePreferencesPanel = forwardRef<GlobalSettingsActions, Props>(function WorkspacePreferencesPanel({ active, onDirtyChange }, ref) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => selectPreferences(loadUserSettings()));
  const [saved, setSaved] = useState(draft);

  useEffect(() => {
    if (!active) return;
    const next = selectPreferences(loadUserSettings());
    setDraft(next);
    setSaved(next);
  }, [active]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useImperativeHandle(ref, () => ({
    save: () => {
      try {
        // Merge only this page's fields so a provider saved on another page stays selected.
        saveUserSettings({ ...loadUserSettings(), ...draft });
        setSaved(draft);
        floatingAlert.success(t("providerSettings.saved"));
      } catch {
        floatingAlert.error(t("providerSettings.saveFailed"));
      }
    },
    reset: () => setDraft(selectPreferences(DEFAULT_USER_SETTINGS)),
  }));

  return (
    <div className="space-y-2">
      {preferences.map(({ key, label }) => (
        <SettingRow key={key} label={t(`providerSettings.${label}`)} hint={t(`providerSettings.${label}Hint`)} htmlFor={`preference-${key}`}>
          <Switch id={`preference-${key}`} checked={draft[key]} onCheckedChange={value => setDraft(current => ({ ...current, [key]: value }))} />
        </SettingRow>
      ))}
    </div>
  );
});
