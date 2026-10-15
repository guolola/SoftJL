// Initializes the shared i18next instance used by React and metadata helpers.
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE } from "./types";
import { resources } from "./resources";

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: false,
  interpolation: {
    escapeValue: false,
  },
  returnEmptyString: false,
  react: {
    useSuspense: false,
  },
});

export type TranslationKey = Parameters<typeof i18n.t>[0];
