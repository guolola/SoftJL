// Exercises block34 against the existing provider workflow, including discovery validation, failures and duplicate submission.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { platformApi, type PlatformProviderConfig } from "../../user-platform/services/platform-api";
import { invalidateProviderConfigCache } from "../../user-platform/services/provider-config-cache";
import { loadUserSettings, saveUserSettings, DEFAULT_USER_SETTINGS } from "../../../shared/lib/user-settings";
import { GlobalSettingsPanel } from "./global-settings-panel";

vi.mock("../../../shared/ui/floating-alert", () => ({ floatingAlert: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));

const provider: PlatformProviderConfig = {
  id: "personal-1", name: "My provider", provider: "openai", baseUrl: "https://provider.example.test/v1",
  defaultModel: "chat-b", allowedModels: ["chat-a", "chat-b"], maskedKey: "sk-***", keyPurpose: "personal",
  status: "active", riskState: "low", quota: "personal", createdBy: "user-1", createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z", lastUsedAt: null, allowlisted: true, scopeType: "user", scopeId: "user-1",
};

const discoveredModel = (id: string) => ({ id, category: "text_chat" as const,
  structuredOutputMode: "compatible" as const, supportsJsonSchema: false, supportsJsonObject: false,
  strictJson: "unknown" as const, modeLabel: "兼容模式", probeStatus: "compatible" as const,
  probedAt: "2026-10-01T00:00:00.000Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  invalidateProviderConfigCache();
  vi.spyOn(platformApi, "listProviderConfigs").mockResolvedValue({ providerConfigs: [] });
  vi.spyOn(platformApi, "discoverProviderModelsStream").mockImplementation(async (_input, onEvent) => {
    onEvent({ type: "completed", result: { models: [discoveredModel("chat-a"), discoveredModel("chat-b")], fetchedAt: "2026-10-01T00:00:00.000Z", sourceBaseUrl: provider.baseUrl } });
  });
  vi.spyOn(platformApi, "createProviderConfig").mockResolvedValue(provider);
});
afterEach(() => { vi.restoreAllMocks(); });

async function openCreation() {
  const user = userEvent.setup();
  render(<AppI18nProvider><GlobalSettingsPanel active currentUserId="user-1" /></AppI18nProvider>);
  await user.click(await screen.findByRole("button", { name: "添加供应商" }));
  const dialog = await screen.findByRole("dialog", { name: "添加供应商" });
  return { user, dialog };
}

async function selectModel(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, model: string) {
  await user.click(within(dialog).getByRole("button", { name: "展开模型列表" }));
  await user.click(await screen.findByRole("option", { name: model }));
}

async function fillAndDiscover() {
  const result = await openCreation();
  const { user, dialog } = result;
  await user.type(within(dialog).getByLabelText("名称"), "My provider");
  await user.type(within(dialog).getByLabelText("Base URL"), provider.baseUrl);
  await user.type(within(dialog).getByLabelText("API Key"), "test-only-key");
  await user.click(within(dialog).getByRole("button", { name: "获取模型列表" }));
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeEnabled());
  return result;
}

describe("Provider creation block34", () => {
  it("rejects incomplete discovery records without inventing capabilities or probe timestamps", async () => {
    vi.mocked(platformApi.discoverProviderModelsStream).mockImplementation(async (_input, onEvent) => {
      onEvent({ type: "completed", result: { models: [{ id: "unprobed" }], fetchedAt: provider.updatedAt, sourceBaseUrl: provider.baseUrl } });
    });
    const { user, dialog } = await openCreation();
    await user.type(within(dialog).getByLabelText("名称"), "My provider");
    await user.type(within(dialog).getByLabelText("Base URL"), provider.baseUrl);
    await user.type(within(dialog).getByLabelText("API Key"), "test-only-key");
    await user.click(within(dialog).getByRole("button", { name: "获取模型列表" }));
    await waitFor(() => expect(floatingAlert.error).toHaveBeenCalled());
    expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeDisabled();
    expect(platformApi.createProviderConfig).not.toHaveBeenCalled();
  });
  it("orders connection fields before models and offers discovery without a separate test action", async () => {
    const { dialog } = await openCreation();
    const controls = [
      within(dialog).getByLabelText("名称"), within(dialog).getByLabelText("Base URL"), within(dialog).getByLabelText("API Key"),
      within(dialog).getByRole("combobox", { name: "供应商默认模型" }), within(dialog).getByRole("button", { name: "获取模型列表" }),
    ];
    controls.slice(1).forEach((control, index) => expect(controls[index].compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
    const connectionGroup = within(dialog).getByRole("group", { name: "连接供应商与平台" });
    expect(within(connectionGroup).getByLabelText("名称")).toBe(controls[0]);
    expect(within(connectionGroup).getByLabelText("Base URL")).toBe(controls[1]);
    expect(within(connectionGroup).getByLabelText("API Key")).toBe(controls[2]);
    expect(dialog.querySelector('[data-slot="card"]')).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "测试托管配置" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText("请填写供应商名称")).not.toBeInTheDocument();
    expect(floatingAlert.error).not.toHaveBeenCalled();
  });

  it("reports missing credentials and invalid URLs through floating alerts", async () => {
    const { user, dialog } = await openCreation();
    const fetch = within(dialog).getByRole("button", { name: "获取模型列表" });
    expect(fetch).toBeEnabled();
    await user.click(fetch);
    expect(floatingAlert.error).toHaveBeenLastCalledWith("请填写供应商名称");
    await user.type(within(dialog).getByLabelText("名称"), "Invalid provider");
    await user.click(fetch);
    expect(floatingAlert.error).toHaveBeenLastCalledWith("请先填写 Base URL 和 API Key");
    await user.type(within(dialog).getByLabelText("Base URL"), "incorrect-url");
    await user.type(within(dialog).getByLabelText("API Key"), "test-key");
    await user.click(fetch);
    expect(floatingAlert.error).toHaveBeenLastCalledWith("请输入有效的 HTTP 或 HTTPS 服务地址。");
    expect(platformApi.discoverProviderModelsStream).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeDisabled();
  });

  it.each(["auth", "disconnected", "empty"])("reports %s discovery failures and keeps saving disabled", async failure => {
    vi.mocked(platformApi.discoverProviderModelsStream).mockImplementationOnce(async (_input, onEvent) => {
      if (failure === "auth") onEvent({ type: "error", code: "PROVIDER_AUTH_FAILED", message: "Provider model discovery failed", retryable: false, status: 401 });
      if (failure === "disconnected") onEvent({ type: "started", sourceBaseUrl: provider.baseUrl });
      if (failure === "empty") onEvent({ type: "completed", result: { models: [], fetchedAt: provider.updatedAt, sourceBaseUrl: provider.baseUrl } });
    });
    const { user, dialog } = await openCreation();
    await user.type(within(dialog).getByLabelText("名称"), "My provider");
    await user.type(within(dialog).getByLabelText("Base URL"), provider.baseUrl);
    await user.type(within(dialog).getByLabelText("API Key"), "incorrect-key");
    await user.click(within(dialog).getByRole("button", { name: "获取模型列表" }));
    const message = failure === "auth" ? "模型供应商鉴权失败，请检查密钥和账号权限。" : failure === "empty" ? "未发现可用模型" : "获取模型列表失败";
    await waitFor(() => expect(floatingAlert.error).toHaveBeenCalledWith(message));
    expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeDisabled();
    expect(floatingAlert.success).not.toHaveBeenCalled();
  });

  it("searches and saves a discovered default directly with the complete catalog and no extra test request", async () => {
    const { user, dialog } = await fillAndDiscover();
    expect(dialog).toHaveAttribute("data-block", "dashboard-dialog-34");
    expect(within(dialog).getByLabelText("API Key")).toHaveAttribute("type", "password");
    const modelInput = within(dialog).getByRole("combobox", { name: "供应商默认模型" });
    await user.click(within(dialog).getByRole("button", { name: "展开模型列表" }));
    await user.clear(modelInput);
    await user.type(modelInput, "chat-b");
    expect(screen.queryByRole("option", { name: "chat-a" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "chat-b" }));
    expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeEnabled();
    vi.mocked(platformApi.listProviderConfigs).mockResolvedValue({ providerConfigs: [provider] });
    await user.click(within(dialog).getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "添加供应商" })).not.toBeInTheDocument());
    expect(platformApi.createProviderConfig).toHaveBeenCalledWith(expect.objectContaining({ name: "My provider", apiKey: "test-only-key", defaultModel: "chat-b", allowedModels: ["chat-a", "chat-b"] }));
    expect(screen.getByRole("switch", { name: "启用 My provider" })).toBeChecked();
  });

  it("reuses discovery when changing the selected model and invalidates it after connection changes", async () => {
    const { user, dialog } = await fillAndDiscover();
    const save = within(dialog).getByRole("button", { name: "保存供应商" });
    await selectModel(user, dialog, "chat-b");
    expect(save).toBeEnabled();
    expect(platformApi.discoverProviderModelsStream).toHaveBeenCalledTimes(1);
    await user.clear(within(dialog).getByLabelText("名称"));
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText("名称"), "Renamed provider");
    expect(save).toBeEnabled();
    await user.type(within(dialog).getByLabelText("API Key"), "-changed");
    expect(save).toBeDisabled();
    await user.click(save);
    expect(platformApi.createProviderConfig).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "获取模型列表" }));
    await waitFor(() => expect(save).toBeEnabled());
    await user.clear(within(dialog).getByLabelText("Base URL"));
    expect(save).toBeDisabled();
    expect(within(dialog).getByRole("combobox", { name: "供应商默认模型" })).toBeDisabled();
  });

  it("displays discovery failures through floating alerts and permits retry", async () => {
    vi.mocked(platformApi.discoverProviderModelsStream).mockRejectedValueOnce(new Error("Catalog unavailable"));
    const { user, dialog } = await openCreation();
    await user.type(within(dialog).getByLabelText("名称"), "My provider");
    await user.type(within(dialog).getByLabelText("Base URL"), provider.baseUrl);
    await user.type(within(dialog).getByLabelText("API Key"), "test-only-key");
    await user.click(within(dialog).getByRole("button", { name: "获取模型列表" }));
    await waitFor(() => expect(floatingAlert.error).toHaveBeenCalledWith("获取模型列表失败"));
    expect(within(dialog).queryByText("获取模型列表失败")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "获取模型列表" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeEnabled());
  });

  it("guards duplicate saves and keeps backend connection failures recoverable", async () => {
    const { dialog } = await fillAndDiscover();
    let rejectSave: (reason: Error) => void;
    vi.mocked(platformApi.createProviderConfig).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
    const save = within(dialog).getByRole("button", { name: "保存供应商" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(platformApi.createProviderConfig).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    await act(async () => rejectSave(new Error("Connection unavailable")));
    await waitFor(() => expect(floatingAlert.error).toHaveBeenCalledWith("保存供应商失败"));
    expect(within(dialog).queryByText("保存供应商失败")).not.toBeInTheDocument();
    expect(save).toBeEnabled();
    expect(within(dialog).getByLabelText("API Key")).toHaveValue("test-only-key");
  });
});



describe("Provider configuration table", () => {
  const system: PlatformProviderConfig = { ...provider, id: "system-1", name: "Official provider", scopeType: "system", scopeId: null, defaultModel: "chat-a" };
  const second: PlatformProviderConfig = { ...provider, id: "personal-2", name: "Second provider" };
  async function openTable(configs = [system, provider, second]) {
    vi.mocked(platformApi.listProviderConfigs).mockResolvedValue({ providerConfigs: configs });
    saveUserSettings({ ...DEFAULT_USER_SETTINGS, providerConfigId: system.id });
    const user = userEvent.setup();
    render(<AppI18nProvider><GlobalSettingsPanel active currentUserId="user-1" /></AppI18nProvider>);
    const table = await screen.findByRole("table", { name: "模型配置" });
    await within(table).findByText(system.name);
    return { user, table };
  }

  it("shows six columns, official defaults, timestamps and owner-only actions", async () => {
    const { table } = await openTable();
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["供应商名称", "状态", "默认模型", "更新时间", "启用", "操作"]);
    const official = within(table).getByRole("row", { name: /Official provider/ });
    expect(within(official).getByText("默认")).toBeInTheDocument();
    expect(within(official).queryByRole("button")).not.toBeInTheDocument();
    expect(official.querySelector("time")).toHaveAttribute("dateTime", provider.updatedAt);
    expect(within(table).getByRole("button", { name: "编辑 My provider" })).toBeEnabled();
    expect(screen.queryByRole("combobox", { name: "模型来源" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "默认模型" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "完成提示音" })).not.toBeInTheDocument();
  });

  it("keeps exactly one enabled provider and persists its model through save", async () => {
    const { user, table } = await openTable();
    const official = within(table).getByRole("switch", { name: "启用 Official provider" });
    expect(official).toBeChecked();
    await user.click(official);
    expect(official).toBeChecked();
    await user.click(within(table).getByRole("switch", { name: "启用 My provider" }));
    expect(official).not.toBeChecked();
    expect(within(table).getAllByRole("switch").filter(toggle => toggle.getAttribute("aria-checked") === "true")).toHaveLength(1);
    await user.click(within(table).getByRole("switch", { name: "启用 Second provider" }));
    saveUserSettings({ ...loadUserSettings(), completionSound: false });
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(loadUserSettings().completionSound).toBe(false);
    expect(loadUserSettings()).toMatchObject({ providerConfigId: second.id, defaultModel: "chat-b", providerModelOptions: ["chat-a", "chat-b"] });
    await user.click(screen.getByRole("button", { name: "恢复默认" }));
    expect(official).toBeChecked();
    expect(within(table).getAllByRole("switch").filter(toggle => toggle.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });

  it("reuses the creation dialog to edit an inactive row without changing the enabled provider", async () => {
    const updated = { ...provider, defaultModel: "chat-a" };
    vi.spyOn(platformApi, "updateProviderConfig").mockResolvedValue(updated);
    const { user } = await openTable();
    await user.click(screen.getByRole("button", { name: "编辑 My provider" }));
    const dialog = await screen.findByRole("dialog", { name: "编辑供应商" });
    expect(dialog).toHaveAttribute("data-block", "dashboard-dialog-34");
    expect(within(dialog).getByLabelText("Base URL")).toHaveValue(provider.baseUrl);
    expect(within(dialog).getByLabelText("API Key")).toHaveValue("");
    expect(within(dialog).getByLabelText("API Key")).toHaveAttribute("placeholder", "请重新填写 API Key");
    expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("API Key"), "verified-key");
    await user.click(within(dialog).getByRole("button", { name: "获取模型列表" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeEnabled());
    expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeEnabled();
    await selectModel(user, dialog, "chat-a");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeEnabled());
    vi.mocked(platformApi.listProviderConfigs).mockResolvedValue({ providerConfigs: [system, updated, second] });
    await user.click(within(dialog).getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(platformApi.updateProviderConfig).toHaveBeenCalledWith(provider.id, expect.objectContaining({ defaultModel: "chat-a", apiKey: "verified-key" }));
    expect(screen.getByRole("switch", { name: "启用 Official provider" })).toBeChecked();
  });

  it("requires fresh discovery after editing connection details before saving", async () => {
    vi.spyOn(platformApi, "updateProviderConfig").mockResolvedValue(provider);
    const { user } = await openTable();
    await user.click(screen.getByRole("button", { name: "编辑 My provider" }));
    const dialog = await screen.findByRole("dialog", { name: "编辑供应商" });
    await user.clear(within(dialog).getByLabelText("Base URL"));
    await user.type(within(dialog).getByLabelText("Base URL"), "https://new.example.test/v1");
    await user.type(within(dialog).getByLabelText("API Key"), "replacement-key");
    await user.click(within(dialog).getByRole("button", { name: "获取模型列表" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeEnabled());
    await selectModel(user, dialog, "chat-b");
    expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeEnabled();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "保存供应商" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "保存供应商" }));
    await waitFor(() => expect(platformApi.updateProviderConfig).toHaveBeenCalledWith(provider.id, expect.objectContaining({ baseUrl: "https://new.example.test/v1", apiKey: "replacement-key", defaultModel: "chat-b", allowedModels: ["chat-a", "chat-b"] })));
  });

  it("disables unavailable rows and leaves the enabled provider selected when another row is deleted", async () => {
    const disabled = { ...second, status: "disabled" };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(platformApi, "revokeProviderConfig").mockResolvedValue({ ...provider, status: "revoked" });
    const { user } = await openTable([system, provider, disabled]);
    expect(screen.getByRole("switch", { name: "启用 Second provider" })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("switch", { name: "启用 Second provider" }));
    expect(screen.getByRole("switch", { name: "启用 Official provider" })).toBeChecked();
    vi.mocked(platformApi.listProviderConfigs).mockResolvedValue({ providerConfigs: [system, disabled] });
    await user.click(screen.getByRole("button", { name: "删除 My provider" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "删除 My provider" })).not.toBeInTheDocument());
    expect(platformApi.revokeProviderConfig).toHaveBeenCalledWith(provider.id);
    expect(screen.getByRole("switch", { name: "启用 Official provider" })).toBeChecked();
  });
});
