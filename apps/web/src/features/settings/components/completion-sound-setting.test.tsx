// Verifies the Completion sound preference is an accessible switch that persists through save and reload.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { loadUserSettings } from "../../../shared/lib/user-settings";
import { platformApi, type PlatformProviderConfig } from "../../user-platform/services/platform-api";
import { invalidateProviderConfigCache } from "../../user-platform/services/provider-config-cache";
import { GlobalSettingsPanel } from "./global-settings-panel";

vi.mock("../../../shared/ui/floating-alert", () => ({ floatingAlert: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));

// The panel saves preferences together with a valid provider selection.
const provider: PlatformProviderConfig = {
  id: "personal-1", name: "My provider", provider: "openai", baseUrl: "https://provider.example.test/v1",
  defaultModel: "chat-b", allowedModels: ["chat-a", "chat-b"], maskedKey: "sk-***", keyPurpose: "personal",
  status: "active", riskState: "low", quota: "personal", createdBy: "user-1", createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z", lastUsedAt: null, allowlisted: true, scopeType: "user", scopeId: "user-1",
};

describe("Completion sound setting", () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateProviderConfigCache();
    vi.spyOn(platformApi, "listProviderConfigs").mockResolvedValue({ providerConfigs: [provider] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is enabled by default and persists when muted", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AppI18nProvider><GlobalSettingsPanel active currentUserId="user-1" /></AppI18nProvider>);
    const toggle = await screen.findByRole("switch", { name: "完成提示音" });
    expect(toggle).toBeChecked();
    await screen.findByRole("combobox", { name: "默认模型" });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(loadUserSettings().completionSound).toBe(false);
    unmount();

    render(<AppI18nProvider><GlobalSettingsPanel active currentUserId="user-1" /></AppI18nProvider>);
    expect(await screen.findByRole("switch", { name: "完成提示音" })).not.toBeChecked();
  });
});
