// Verifies the app i18n provider applies browser and manual language choices to the document.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTranslation } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";
import { LOCALE_PREFERENCE_STORAGE_KEY } from "../../shared/i18n";
import { AppI18nProvider, useAppI18n } from "./i18n-provider";

afterEach(() => {
  localStorage.clear();
  Object.defineProperty(window.navigator, "languages", {
    configurable: true,
    value: ["zh-CN"],
  });
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: "zh-CN",
  });
});

function LocaleHarness() {
  const { t } = useTranslation();
  const { locale, preference, setPreference } = useAppI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="preference">{preference}</span>
      <span>{t("nav.projects")}</span>
      <button type="button" onClick={() => setPreference("en")}>
        English
      </button>
      <button type="button" onClick={() => setPreference("system")}>
        System
      </button>
    </div>
  );
}

describe("AppI18nProvider", () => {
  it("uses the browser language when no explicit preference exists", async () => {
    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      value: ["en-US"],
    });

    render(
      <AppI18nProvider>
        <LocaleHarness />
      </AppI18nProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });

  it("stores manual language choices and can return to system matching", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      value: ["zh-CN"],
    });

    render(
      <AppI18nProvider>
        <LocaleHarness />
      </AppI18nProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("zh-CN"));
    await user.click(screen.getByRole("button", { name: "English" }));

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));
    expect(localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY)).toBe("en");
    expect(document.documentElement.lang).toBe("en");

    await user.click(screen.getByRole("button", { name: "System" }));
    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("zh-CN"));
    expect(localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY)).toBe("system");
  });
});
