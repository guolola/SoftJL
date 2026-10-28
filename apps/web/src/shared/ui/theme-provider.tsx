// Shares system-aware light/dark mode and AdminCN color presets across application surfaces.
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ThemeProvider as TemplateThemeProvider,
  useTheme as useTemplateTheme,
} from "next-themes";

import { themePresets, type ThemePresetKey } from "./theme-presets";

const THEME_PRESET_STORAGE_KEY = "admincn-ui-theme-preset";
const inversePaletteKeys = ['primary', 'primary-foreground', 'background', 'foreground'] as const;
const themePresetKeys = new Set<ThemePresetKey>([
  "default",
  ...(Object.keys(themePresets) as Array<keyof typeof themePresets>),
]);
const presetCssVariables = Array.from(
  new Set(
    Object.values(themePresets).flatMap((preset) =>
      Object.values(preset.styles).flatMap((styles) => Object.keys(styles)),
    ),
  ),
);

type WorkspaceThemeContextValue = {
  theme: "light" | "dark";
  mode: "light" | "dark" | "system";
  systemTheme: "light" | "dark";
  setMode: (mode: "light" | "dark" | "system") => void;
  themePreset: ThemePresetKey;
  setThemePreset: (preset: ThemePresetKey) => void;
  toggle: () => void;
};

const WorkspaceThemeContext = createContext<WorkspaceThemeContextValue | null>(null);

function readStoredThemePreset(): ThemePresetKey {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(THEME_PRESET_STORAGE_KEY) as ThemePresetKey | null;
  return stored && themePresetKeys.has(stored) ? stored : "default";
}

function WorkspaceThemeController({ children }: { children: ReactNode }) {
  const { resolvedTheme, systemTheme: deviceTheme, theme: selectedMode, setTheme } = useTemplateTheme();
  const systemTheme = deviceTheme === "dark" ? "dark" : "light";
  const mode = selectedMode === "light" || selectedMode === "dark" ? selectedMode : "system";
  const theme: "light" | "dark" = resolvedTheme === "dark" ? "dark" : "light";
  const [themePreset, setThemePresetState] = useState<ThemePresetKey>(readStoredThemePreset);

  useEffect(() => {
    const root = document.documentElement;
    presetCssVariables.forEach((key) => root.style.removeProperty(`--${key}`));
    inversePaletteKeys.forEach((key) => root.style.removeProperty(`--inverse-${key}`));
    if (themePreset === "default") return;

    const preset = themePresets[themePreset];
    Object.entries(preset.styles[theme]).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
    // Inverse controls reuse the chosen preset's complete opposite-mode palette.
    const oppositeStyles = preset.styles[theme === 'dark' ? 'light' : 'dark'];
    inversePaletteKeys.forEach((key) => {
      root.style.setProperty(`--inverse-${key}`, oppositeStyles[key]);
    });
  }, [theme, themePreset]);

  const value = useMemo<WorkspaceThemeContextValue>(
    () => ({
      theme,
      mode,
      systemTheme,
      setMode: setTheme,
      themePreset,
      setThemePreset: (preset) => {
        setThemePresetState(preset);
        if (preset === "default") {
          window.localStorage.removeItem(THEME_PRESET_STORAGE_KEY);
        } else {
          window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, preset);
        }
      },
      toggle: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [setTheme, mode, systemTheme, theme, themePreset],
  );

  return (
    <WorkspaceThemeContext.Provider value={value}>
      {children}
    </WorkspaceThemeContext.Provider>
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const inherited = useContext(WorkspaceThemeContext);
  // The document owns initialization; standalone application/test surfaces may still provide their own theme.
  if (inherited) return children;
  return (
    <TemplateThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="admincn-ui-theme"
    >
      <WorkspaceThemeController>{children}</WorkspaceThemeController>
    </TemplateThemeProvider>
  );
}

export function useTheme() {
  const value = useContext(WorkspaceThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}

export { themePresets, type ThemePresetKey } from "./theme-presets";
