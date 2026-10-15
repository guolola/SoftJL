// Verifies that persisted language choices are restored only after server HTML hydrates.
import { act, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { i18n } from "../i18n";
import { AppI18nProvider } from "../i18n-provider";
import { LOCALE_PREFERENCE_STORAGE_KEY } from "../types";
import { LanguagePreferenceMenu } from "./language-preference-menu";

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  Object.defineProperty(window.navigator, "languages", {
    configurable: true,
    value: ["zh-CN"],
  });
  await i18n.changeLanguage("zh-CN");
});

it.each(["zh-CN", "en", "system"] as const)(
  "hydrates the language menu without mismatches for preference %s",
  async (preference) => {
    await i18n.changeLanguage("zh-CN");
    localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, preference);
    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      value: ["en-US"],
    });
    const component = (
      <AppI18nProvider>
        <LanguagePreferenceMenu />
      </AppI18nProvider>
    );
    let html: string;
    vi.stubGlobal("window", undefined);
    try {
      html = renderToString(component);
    } finally {
      vi.unstubAllGlobals();
    }
    // Next.js does not supply the legacy root[data-prerendered] marker.
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    expect(within(container).getByRole("button")).not.toHaveClass("text-primary");

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, component, {
          onRecoverableError: (error) => recoverableErrors.push(error),
        });
      });
      const button = within(container).getByRole("button");
      expect(button.classList.contains("text-primary")).toBe(preference !== "system");
      expect(document.documentElement.lang).toBe(preference === "zh-CN" ? "zh-CN" : "en");
      expect(button).toHaveAccessibleName(String(i18n.t("language.title")));
      expect(recoverableErrors).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  },
);
