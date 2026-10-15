// Resolves persisted and browser language preferences into the app's supported locales.
import {
  APP_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_PREFERENCE_STORAGE_KEY,
  type AppLocale,
  type LocalePreference,
} from "./types";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && APP_LOCALES.includes(value as AppLocale);
}

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === "system" || isAppLocale(value);
}

export function resolveLocaleFromLanguageTag(languageTag: string | null | undefined): AppLocale | null {
  if (!languageTag) return null;
  return languageTag.trim().toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function resolveBrowserLocale(languages?: readonly string[]): AppLocale {
  const browserLanguages =
    languages ??
    (typeof navigator === "undefined"
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language]);
  for (const language of browserLanguages) {
    const locale = resolveLocaleFromLanguageTag(language);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function loadLocalePreference(): LocalePreference {
  if (typeof window === "undefined") return "system";
  const saved = localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY);
  return isLocalePreference(saved) ? saved : "system";
}

export function saveLocalePreference(preference: LocalePreference) {
  localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, preference);
}

export function resolveLocalePreference(
  preference: LocalePreference,
  languages?: readonly string[],
): AppLocale {
  return preference === "system" ? resolveBrowserLocale(languages) : preference;
}
