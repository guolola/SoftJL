// Covers browser language detection and persisted locale preference normalization.
import { describe, expect, it } from "vitest";
import {
  LOCALE_PREFERENCE_STORAGE_KEY,
  loadLocalePreference,
  resolveBrowserLocale,
  resolveLocalePreference,
  saveLocalePreference,
} from "./index";

describe("locale preference", () => {
  it("matches Chinese browser languages to zh-CN", () => {
    expect(resolveBrowserLocale(["zh-Hans-CN", "en-US"])).toBe("zh-CN");
  });

  it("matches non-Chinese browser languages to English", () => {
    expect(resolveBrowserLocale(["en-US", "zh-CN"])).toBe("en");
  });

  it("persists explicit preferences and resolves them before browser languages", () => {
    saveLocalePreference("en");

    expect(localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY)).toBe("en");
    expect(loadLocalePreference()).toBe("en");
    expect(resolveLocalePreference(loadLocalePreference(), ["zh-CN"])).toBe("en");
  });

  it("falls back to system for unknown persisted values", () => {
    localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, "fr");

    expect(loadLocalePreference()).toBe("system");
  });
});
