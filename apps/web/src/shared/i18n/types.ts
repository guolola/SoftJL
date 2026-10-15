// Defines the locale contract shared by i18n initialization, UI controls, and metadata.
export type AppLocale = "zh-CN" | "en";
export type LocalePreference = "system" | AppLocale;

export const APP_LOCALES = ["zh-CN", "en"] as const satisfies readonly AppLocale[];
export const DEFAULT_LOCALE: AppLocale = "zh-CN";
export const LOCALE_PREFERENCE_STORAGE_KEY = "uml-lab-locale-preference";

export const LOCALE_LABELS: Record<AppLocale, string> = {
  "zh-CN": "中文",
  en: "English",
};

export const LOCALE_HTML_LANG: Record<AppLocale, string> = {
  "zh-CN": "zh-CN",
  en: "en",
};

export const LOCALE_OG_LOCALE: Record<AppLocale, string> = {
  "zh-CN": "zh_CN",
  en: "en_US",
};
