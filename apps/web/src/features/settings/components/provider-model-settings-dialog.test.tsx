// Verifies personal model editing, explicit negative capabilities, reference resets and save guards.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProviderCapacities } from "@uml-platform/contracts";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { floatingAlert } from "../../../shared/ui/floating-alert";
import { platformApi, type PlatformProviderConfig } from "../../user-platform/services/platform-api";
import { PROVIDER_MODEL_METADATA_CHANGED_EVENT } from "../../../shared/lib/provider-model-metadata";
import { ProviderModelSettingsDialog } from "./provider-model-settings-dialog";

vi.mock("../../../shared/ui/floating-alert", () => ({ floatingAlert: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());
const provider: PlatformProviderConfig = {
  id: "personal", name: "My provider", provider: "openai", baseUrl: "https://provider.example.test", defaultModel: "known", allowedModels: ["known", "other"],
  maskedKey: "masked", keyPurpose: "personal", status: "active", riskState: "low", quota: "personal", createdBy: "owner", createdAt: "2026-10-26T00:00:00Z",
  updatedAt: "2026-10-26T00:00:00Z", lastUsedAt: null, allowlisted: true, scopeType: "user", scopeId: "owner",
};
const reference = { context: 128000, output: 8192, source: "models.dev" as const, matchedId: "provider/known", updatedAt: null,
  capabilities: { reasoning: true, vision: true, toolCall: null } };
const model: ProviderCapacities["models"][number] = { modelId: "known", ...reference, reference, overrides: {} };
function setup(selected = model, config = provider, loadError = false) {
  const get = vi.spyOn(platformApi, "getProviderCapacities").mockResolvedValue({ syncedAt: null, stale: false, error: null, models: [selected, { ...model, modelId: "other" }] });
  if (loadError) get.mockRejectedValueOnce(new Error("offline"));
  const save = vi.spyOn(platformApi, "setProviderCapacity").mockResolvedValue({ ...selected, source: "user", context: 64000, output: 4096, overrides: { context: 64000, output: 4096, capabilities: { reasoning: false, vision: true } }, updatedAt: "2026-10-26T00:01:00Z" });
  const close = vi.fn();
  render(<AppI18nProvider><ProviderModelSettingsDialog provider={config} currentUserId="owner" onClose={close} /></AppI18nProvider>);
  return { get, save, close, user: userEvent.setup() };
}
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

it("edits all four fields without requesting an API key and refreshes open model controls", async () => {
  const { save, user } = setup();
  const changed = vi.fn();
  window.addEventListener(PROVIDER_MODEL_METADATA_CHANGED_EVENT, changed);
  try {
    await screen.findByLabelText("上下文容量");
    expect(screen.queryByLabelText("API Key")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存模型设置" })).toBeDisabled();
    await user.type(screen.getByLabelText("上下文容量"), "64000");
    await user.type(screen.getByLabelText("最大输出"), "4096");
    await choose(user, "推理能力", "不支持");
    await choose(user, "视觉能力", "支持");
    await user.click(screen.getByRole("button", { name: "保存模型设置" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(provider.id, "known", { context: 64000, output: 4096, capabilities: { reasoning: false, vision: true } }));
    expect(changed.mock.calls[0][0].detail).toEqual({ providerConfigId: provider.id });
    expect(floatingAlert.success).toHaveBeenCalledWith("模型设置已保存");
    await choose(user, "选择模型", "other");
    expect(screen.getByLabelText("上下文容量")).toHaveValue(null);
  } finally { window.removeEventListener(PROVIDER_MODEL_METADATA_CHANGED_EVENT, changed); }
});

it("clears individual overrides back to references", async () => {
  const { save, user } = setup({ ...model, source: "user", context: 64000, output: 4096,
    overrides: { context: 64000, output: 4096, capabilities: { reasoning: false, vision: false } } });
  await screen.findByLabelText("上下文容量");
  await user.clear(screen.getByLabelText("上下文容量"));
  await user.clear(screen.getByLabelText("最大输出"));
  await choose(user, "推理能力", "使用参考（支持）");
  await choose(user, "视觉能力", "使用参考（支持）");
  await user.click(screen.getByRole("button", { name: "保存模型设置" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(provider.id, "known", { context: null, output: null, capabilities: { reasoning: null, vision: null } }));
});

it("permits capability-only changes without fabricating unknown capacities", async () => {
  const unknown = { ...reference, context: null, output: null, source: "unknown" as const, capabilities: { reasoning: null, vision: null, toolCall: null } };
  const { save, user } = setup({ ...model, ...unknown, reference: unknown });
  await screen.findByLabelText("上下文容量");
  await choose(user, "推理能力", "支持");
  await user.click(screen.getByRole("button", { name: "保存模型设置" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(provider.id, "known", { context: null, output: null, capabilities: { reasoning: true, vision: null } }));
});

it("blocks invalid limits in both the form and the save action", async () => {
  const { save, user } = setup();
  await screen.findByLabelText("上下文容量");
  await user.type(screen.getByLabelText("上下文容量"), "1024");
  expect(screen.getByRole("alert")).toHaveTextContent("最大输出不能超过生效上下文容量");
  fireEvent.click(screen.getByRole("button", { name: "保存模型设置" }));
  expect(save).not.toHaveBeenCalled();
});

it("keeps failed saves editable and blocks duplicate submissions while saving", async () => {
  const { save, user, close } = setup();
  let rejectSave!: (error: Error) => void;
  save.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
  await screen.findByLabelText("上下文容量");
  await user.type(screen.getByLabelText("上下文容量"), "64000");
  const button = screen.getByRole("button", { name: "保存模型设置" });
  fireEvent.click(button); fireEvent.click(button);
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled();
  expect(close).not.toHaveBeenCalled();
  await act(async () => rejectSave(new Error("offline")));
  await waitFor(() => expect(screen.getByRole("button", { name: "保存模型设置" })).toBeEnabled());
  expect(screen.getByLabelText("上下文容量")).toHaveValue(64000);
  expect(floatingAlert.error).toHaveBeenCalledWith("保存模型设置失败");
});

it("rejects non-owner editing without loading or saving model data", async () => {
  const { get, save } = setup(model, { ...provider, scopeType: "system", scopeId: null });
  expect(screen.getByRole("status")).toHaveTextContent("仅可编辑自己的个人供应商模型");
  expect(get).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
});

it("shows load errors and retries without requiring rediscovery", async () => {
  const { get, user } = setup(model, provider, true);
  expect(await screen.findByRole("alert")).toHaveTextContent("加载模型设置失败");
  await user.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByLabelText("上下文容量")).toBeEnabled();
  expect(get).toHaveBeenCalledTimes(2);
});
