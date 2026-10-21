// Verifies named animated avatar selection, language support, and pending-save guards.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../../shared/i18n/i18n";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { saveLocalePreference } from "../../../shared/i18n/locale";
import { DefaultAvatarPicker } from "./default-avatar-picker";

beforeEach(() => { saveLocalePreference("zh-CN"); });
afterEach(async () => { saveLocalePreference("zh-CN"); await i18n.changeLanguage("zh-CN"); });

describe("DefaultAvatarPicker", () => {
  it("selects a named Chiikawa avatar and preserves the selected state", () => {
    const onSelect = vi.fn();
    render(<AppI18nProvider><DefaultAvatarPicker value="/avatars/chiikawa-cheerleader.gif" disabled={false} onSelect={onSelect} /></AppI18nProvider>);
    expect(screen.getByRole("button", { name: "吉伊啦啦队" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("吉伊啦啦队")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "吉伊啦啦队" })).not.toHaveAttribute("title");
    fireEvent.click(screen.getByRole("button", { name: "吉伊开心吃饭" }));
    expect(onSelect).toHaveBeenCalledWith("/avatars/chiikawa-happy-meal.gif");
  });

  it("offers English character names and all twelve local GIFs", async () => {
    saveLocalePreference("en");
    const { container } = render(<AppI18nProvider><DefaultAvatarPicker value="" disabled={false} onSelect={() => {}} /></AppI18nProvider>);
    expect(screen.queryByText("Genshin Impact")).not.toBeInTheDocument();
    expect(screen.queryByText("Wuthering Waves")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(12);
    expect(container.querySelectorAll('img[src$=".gif"]')).toHaveLength(12);
    expect(screen.getByRole("button", { name: "Momonga with a bow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chiikawa cheerleading" })).toBeInTheDocument();
    expect(screen.queryByText("Chiikawa cheerleading")).not.toBeInTheDocument();
  });

  it("blocks avatar changes while the profile is saving", () => {
    const onSelect = vi.fn();
    render(<AppI18nProvider><DefaultAvatarPicker value="" disabled onSelect={onSelect} /></AppI18nProvider>);
    const option = screen.getByRole("button", { name: "莫莫咖摇尾巴" });
    expect(option).toBeDisabled();
    fireEvent.click(option);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
