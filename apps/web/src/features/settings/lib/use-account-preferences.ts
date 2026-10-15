// Owns block37 drafts and applies only the active preference page to existing platform contexts.
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppI18n } from "../../../shared/i18n/i18n-provider";
import { useSidebar } from "../../../shared/ui/sidebar";
import { useTheme } from "../../../shared/ui/theme-provider";
import type { PreferencesDraft } from "../components/block37-preferences";

export function useAccountPreferences(open: boolean) {
  const theme = useTheme();
  const language = useAppI18n();
  const sidebar = useSidebar();
  const snapshot = useMemo<PreferencesDraft>(() => ({
    mode: theme.mode,
    preset: theme.themePreset,
    language: language.preference,
    sidebar: sidebar.open ? "expanded" : "collapsed",
  }), [theme.mode, theme.themePreset, language.preference, sidebar.open]);
  const [draft, setDraft] = useState(snapshot);
  const [saved, setSaved] = useState(false);
  const previous = useRef({ open, snapshot });

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2500);
    return () => window.clearTimeout(timer);
  }, [saved]);

  // Opening and closing establish a fresh draft; external settings changes stay synchronized.
  useEffect(() => {
    const last = previous.current;
    if (last.open !== open) {
      setDraft(snapshot);
      setSaved(false);
    } else {
      // Saving one page must not discard drafts on the other preference pages.
      setDraft(current => {
        const next = { ...current };
        for (const key of Object.keys(snapshot) as Array<keyof PreferencesDraft>) {
          if (snapshot[key] !== last.snapshot[key]) Object.assign(next, { [key]: snapshot[key] });
        }
        return next;
      });
    }
    previous.current = { open, snapshot };
  }, [open, snapshot]);

  const update = <K extends keyof PreferencesDraft>(key: K, value: PreferencesDraft[K]) => {
    setSaved(false);
    setDraft(current => ({ ...current, [key]: value }));
  };
  const dirty = (tab: string) => tab === "theme"
    ? draft.mode !== snapshot.mode || draft.preset !== snapshot.preset
    : tab === "language" ? draft.language !== snapshot.language
      : tab === "layout" ? draft.sidebar !== snapshot.sidebar : false;
  const save = (tab: string) => {
    if (tab === "theme") {
      theme.setMode(draft.mode);
      theme.setThemePreset(draft.preset);
    } else if (tab === "language") language.setPreference(draft.language);
    else if (tab === "layout") sidebar.setOpen(draft.sidebar === "expanded");
    setSaved(true);
  };
  const reset = (tab: string) => {
    if (tab === "theme") setDraft(current => ({ ...current, mode: "system", preset: "default" }));
    else if (tab === "language") update("language", "system");
    else if (tab === "layout") update("sidebar", "expanded");
    setSaved(false);
  };
  return { draft, update, dirty, save, reset, saved, theme, language };
}
