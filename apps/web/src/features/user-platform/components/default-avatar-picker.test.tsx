// Verifies named game avatar selection, language support, and pending-save guards.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../../shared/i18n/i18n";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { saveLocalePreference } from "../../../shared/i18n/locale";
import { DefaultAvatarPicker } from "./default-avatar-picker";

beforeEach(() => { saveLocalePreference("zh-CN"); });
afterEach(async () => { saveLocalePreference("zh-CN"); await i18n.changeLanguage("zh-CN"); });

describe("DefaultAvatarPicker", () => {
  it("selects a named Wuthering Waves avatar and preserves the selected state", () => {
    const onSelect = vi.fn();
    render(<AppI18nProvider><DefaultAvatarPicker value="/avatars/wuwa-shorekeeper.svg" disabled={false} onSelect={onSelect} /></AppI18nProvider>);
    expect(screen.getByRole("button", { name: "守岸人" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("守岸人")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "守岸人" })).not.toHaveAttribute("title");
    fireEvent.click(screen.getByRole("button", { name: "尤诺" }));
    expect(onSelect).toHaveBeenCalledWith("/avatars/wuwa-iuno.svg");
  });

  it("offers English character names without game headings or generic portraits", async () => {
    saveLocalePreference("en");
    const { container } = render(<AppI18nProvider><DefaultAvatarPicker value="" disabled={false} onSelect={() => {}} /></AppI18nProvider>);
    expect(screen.queryByText("Genshin Impact")).not.toBeInTheDocument();
    expect(screen.queryByText("Wuthering Waves")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(12);
    expect(container.querySelector('img[src^="/avatars/chibi-"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Columbina" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shorekeeper" })).toBeInTheDocument();
    expect(screen.queryByText("Shorekeeper")).not.toBeInTheDocument();
  });

  it("blocks avatar changes while the profile is saving", () => {
    const onSelect = vi.fn();
    render(<AppI18nProvider><DefaultAvatarPicker value="" disabled onSelect={onSelect} /></AppI18nProvider>);
    const option = screen.getByRole("button", { name: "芙宁娜" });
    expect(option).toBeDisabled();
    fireEvent.click(option);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
