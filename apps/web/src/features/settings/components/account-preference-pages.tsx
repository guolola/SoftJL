// Connects the supported block37 controls to platform drafts without adding unsupported preference rows.
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TabsContent } from "../../../shared/ui/tabs";
import { Button } from "../../../shared/ui/button";
import { cn } from "../../../shared/ui/utils";
import { themePresets, type ThemePresetKey } from "../../../shared/ui/theme-provider";
import type { useAccountPreferences } from "../lib/use-account-preferences";
import { Segmented, SelectField, SettingRow } from "./block37-preferences";

export function AccountPreferencePages({ preferences }: { preferences: ReturnType<typeof useAccountPreferences> }) {
  const { t } = useTranslation();
  const { draft, update, theme } = preferences;
  const mode = draft.mode === "system" ? theme.systemTheme : draft.mode;
  const palettes = [
    { value: "default" as ThemePresetKey, label: t("account.block37.defaultPalette"), color: mode === "dark" ? "oklch(0.922 0 0)" : "oklch(0.205 0 0)" },
    ...Object.entries(themePresets).map(([value, preset]) => ({ value: value as ThemePresetKey, label: preset.label, color: preset.styles[mode].primary })),
  ];
  return <>
    <TabsContent value="theme" keepMounted className="space-y-2">
      <SettingRow label={t("account.block37.mode")} hint={t("account.block37.modeHint")}>
        <Segmented label={t("account.block37.mode")} value={draft.mode} onChange={value => update("mode", value)} options={[
          { value: "light", label: t("account.block37.light"), icon: <SunIcon className="size-3.5" /> },
          { value: "dark", label: t("account.block37.dark"), icon: <MoonIcon className="size-3.5" /> },
          { value: "system", label: t("account.block37.system"), icon: <MonitorIcon className="size-3.5" /> },
        ]} />
      </SettingRow>
      <SettingRow label={t("account.block37.palette")} hint={t("account.block37.paletteHint")}>
        <div className="flex flex-wrap gap-2.5 sm:max-w-56" role="radiogroup" aria-label={t("account.block37.palette")}>
          {palettes.map(item => <Button key={item.value} variant="ghost" size="icon-sm" type="button" role="radio" aria-checked={draft.preset === item.value} aria-label={item.label} title={item.label}
            onClick={() => update("preset", item.value)} style={{ backgroundColor: item.color, color: mode === "dark" ? "black" : "white", outlineColor: item.color }}
            className={cn("focus-visible:ring-ring/50 ring-offset-background flex size-8 items-center justify-center rounded-full border-0 ring-offset-2 transition-all outline-none hover:scale-110 focus-visible:ring-3", draft.preset === item.value && "outline-2 outline-offset-2")}>
            {draft.preset === item.value && <CheckIcon className="size-3.5" />}
          </Button>)}
        </div>
      </SettingRow>
    </TabsContent>
    <TabsContent value="layout" keepMounted className="space-y-2">
      <SettingRow label={t("account.block37.sidebar")} hint={t("account.block37.sidebarHint")}>
        <Segmented label={t("account.block37.sidebar")} value={draft.sidebar} onChange={value => update("sidebar", value)} options={[
          { value: "expanded", label: t("account.block37.expanded") }, { value: "collapsed", label: t("account.block37.collapsed") },
        ]} />
      </SettingRow>
    </TabsContent>
    <TabsContent value="language" keepMounted className="space-y-2">
      <SettingRow label={t("account.block37.language")} hint={t("account.block37.languageHint")} htmlFor="pref-language">
        <SelectField id="pref-language" value={draft.language} onChange={value => update("language", value)} options={[
          { value: "system", label: t("account.block37.system") }, { value: "zh-CN", label: "中文" }, { value: "en", label: "English" },
        ]} />
      </SettingRow>
    </TabsContent>
  </>;
}
