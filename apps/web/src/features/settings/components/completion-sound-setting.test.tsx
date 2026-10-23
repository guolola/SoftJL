// Verifies the Completion sound preference is an accessible switch that persists through save and reload.
import { createRef } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { loadUserSettings, saveUserSettings } from "../../../shared/lib/user-settings";
import { WorkspacePreferencesPanel } from "./workspace-preferences-panel";
import type { GlobalSettingsActions } from "./global-settings-panel";

vi.mock("../../../shared/ui/floating-alert", () => ({ floatingAlert: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));

describe("Completion sound setting", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is enabled by default and persists when muted", async () => {
    const user = userEvent.setup();
    const actions = createRef<GlobalSettingsActions>();
    const { unmount } = render(<AppI18nProvider><WorkspacePreferencesPanel ref={actions} active onDirtyChange={() => {}} /></AppI18nProvider>);
    const toggle = await screen.findByRole("switch", { name: "完成提示音" });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    act(() => actions.current?.save());
    expect(loadUserSettings().completionSound).toBe(false);
    unmount();

    render(<AppI18nProvider><WorkspacePreferencesPanel active onDirtyChange={() => {}} /></AppI18nProvider>);
    expect(await screen.findByRole("switch", { name: "完成提示音" })).not.toBeChecked();
  });
  it("saves and resets preferences without overwriting a provider saved on another page", async () => {
    const user = userEvent.setup();
    const actions = createRef<GlobalSettingsActions>();
    render(<AppI18nProvider><WorkspacePreferencesPanel ref={actions} active onDirtyChange={() => {}} /></AppI18nProvider>);
    await user.click(screen.getByRole("switch", { name: "显示过期模型横幅" }));
    saveUserSettings({ ...loadUserSettings(), providerConfigId: "new-provider", defaultModel: "chat-new" });
    act(() => actions.current?.save());
    expect(loadUserSettings()).toMatchObject({ showStaleBanner: false, providerConfigId: "new-provider", defaultModel: "chat-new" });
    act(() => actions.current?.reset());
    expect(screen.getByRole("switch", { name: "显示过期模型横幅" })).toBeChecked();
    act(() => actions.current?.save());
    expect(loadUserSettings()).toMatchObject({ showStaleBanner: true, providerConfigId: "new-provider", defaultModel: "chat-new" });
  });
});
