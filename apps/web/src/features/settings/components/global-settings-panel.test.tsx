// Exercises block34 against the existing provider workflow, including failures, test invalidation and duplicate submission.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { platformApi, type PlatformProviderConfig } from "../../user-platform/services/platform-api";
import { invalidateProviderConfigCache } from "../../user-platform/services/provider-config-cache";
import { GlobalSettingsPanel } from "./global-settings-panel";

vi.mock("../../../shared/ui/floating-alert", () => ({ floatingAlert: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));

const provider: PlatformProviderConfig = {
  id: "personal-1", name: "My provider", provider: "openai", baseUrl: "https://provider.example.test/v1",
  defaultModel: "chat-b", allowedModels: ["chat-a", "chat-b"], maskedKey: "sk-***", keyPurpose: "personal",
  status: "active", riskState: "low", quota: "personal", createdBy: "user-1", createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z", lastUsedAt: null, allowlisted: true, scopeType: "user", scopeId: "user-1",
};

beforeEach(() => {
  localStorage.clear();
  invalidateProviderConfigCache();
  vi.spyOn(platformApi, "listProviderConfigs").mockResolvedValue({ providerConfigs: [] });
  vi.spyOn(platformApi, "discoverProviderModelsStream").mockImplementation(async (_input, onEvent) => {
    onEvent({ type: "completed", result: { models: [{ id: "chat-a" }, { id: "chat-b" }], fetchedAt: "2026-10-01T00:00:00.000Z", sourceBaseUrl: provider.baseUrl } });
  });
  vi.spyOn(platformApi, "testTemporaryProviderConfig").mockResolvedValue({ ok: true });
  vi.spyOn(platformApi, "createProviderConfig").mockResolvedValue(provider);
});
afterEach(() => { vi.restoreAllMocks(); });

async function openCreation() {
  const user = userEvent.setup();
  render(<AppI18nProvider><GlobalSettingsPanel active currentUserId="user-1" /></AppI18nProvider>);
  await user.click(await screen.findByRole("button", { name: "添加自己的模型密钥" }));
  const dialog = await screen.findByRole("dialog", { name: "添加供应商" });
  return { user, dialog };
}

async function fillAndDiscover() {
  const result = await openCreation();
  const { user, dialog } = result;
  await user.type(within(dialog).getByLabelText("名称"), "My provider");
  await user.type(within(dialog).getByLabelText("Base URL"), provider.baseUrl);
  await user.type(within(dialog).getByLabelText("API Key"), "test-only-key");
  await user.click(within(dialog).getByRole("button", { name: "获取模型列表" }));
  await within(dialog).findByRole("radio", { name: "chat-a" });
  return result;
}

describe("Provider creation block34", () => {
  it("searches models and saves the selected default with the complete catalog", async () => {
    const { user, dialog } = await fillAndDiscover();
    expect(dialog).toHaveAttribute("data-block", "dashboard-dialog-34");
    expect(within(dialog).getByLabelText("API Key")).toHaveAttribute("type", "password");
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "搜索模型…" }), "chat-b");
    expect(within(dialog).queryByRole("radio", { name: "chat-a" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "chat-b" }));
    await user.click(within(dialog).getByRole("button", { name: "测试托管配置" }));
    await within(dialog).findByText("测试已通过");
    vi.mocked(platformApi.listProviderConfigs).mockResolvedValue({ providerConfigs: [provider] });
    await user.click(within(dialog).getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "添加供应商" })).not.toBeInTheDocument());
    expect(platformApi.createProviderConfig).toHaveBeenCalledWith(expect.objectContaining({ name: "My provider", apiKey: "test-only-key", defaultModel: "chat-b", allowedModels: ["chat-a", "chat-b"] }));
    expect(screen.getByLabelText("模型来源")).toHaveTextContent("My provider");
  });

  it("shows missing prerequisites inline and invalidates a passed test after connection changes", async () => {
    const { user, dialog } = await fillAndDiscover();
    await user.click(within(dialog).getByRole("button", { name: "保存供应商" }));
    expect(platformApi.createProviderConfig).not.toHaveBeenCalled();
    expect(within(dialog).getByText("请先测试托管配置并确保测试通过")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "测试托管配置" }));
    await within(dialog).findByText("测试已通过");
    await user.type(within(dialog).getByLabelText("API Key"), "-changed");
    expect(within(dialog).queryByText("测试已通过")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "保存供应商" }));
    expect(platformApi.createProviderConfig).not.toHaveBeenCalled();
    await user.clear(within(dialog).getByLabelText("Base URL"));
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "测试托管配置" })).toBeDisabled();
  });

  it("displays discovery and test failures and allows retry without claiming success", async () => {
    vi.mocked(platformApi.discoverProviderModelsStream).mockRejectedValueOnce(new Error("Catalog unavailable"));
    const { user, dialog } = await openCreation();
    await user.type(within(dialog).getByLabelText("名称"), "My provider");
    await user.type(within(dialog).getByLabelText("Base URL"), provider.baseUrl);
    await user.type(within(dialog).getByLabelText("API Key"), "test-only-key");
    await user.click(within(dialog).getByRole("button", { name: "获取模型列表" }));
    await within(dialog).findByText("获取模型列表失败");
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "获取模型列表" }));
    await within(dialog).findByRole("radio", { name: "chat-a" });
    vi.mocked(platformApi.testTemporaryProviderConfig).mockResolvedValueOnce({ ok: false });
    await user.click(within(dialog).getByRole("button", { name: "测试托管配置" }));
    await within(dialog).findByText("连接测试失败");
    await user.click(within(dialog).getByRole("button", { name: "保存供应商" }));
    expect(platformApi.createProviderConfig).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "测试托管配置" }));
    await within(dialog).findByText("测试已通过");
  });

  it("guards duplicate saves and keeps a failed save recoverable", async () => {
    const { user, dialog } = await fillAndDiscover();
    await user.click(within(dialog).getByRole("button", { name: "测试托管配置" }));
    await within(dialog).findByText("测试已通过");
    let rejectSave: (reason: Error) => void;
    vi.mocked(platformApi.createProviderConfig).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
    const save = within(dialog).getByRole("button", { name: "保存供应商" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(platformApi.createProviderConfig).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    await act(async () => rejectSave(new Error("Save unavailable")));
    await within(dialog).findByText("保存供应商失败");
    expect(save).toBeEnabled();
    expect(within(dialog).getByLabelText("API Key")).toHaveValue("test-only-key");
  });
});
