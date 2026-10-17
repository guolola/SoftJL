// Covers engineering behavior through the same composer runtime used by quick modeling.
import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../../../shared/i18n";
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { WorkspaceRepositoryProvider, createMockWorkspaceRepository } from "../../../services/workspace-repository";
import { RequirementComposer } from "./requirement-composer";

const repository = createMockWorkspaceRepository();
const context = (model = "vision-model") => ({ model, contextBudget: 1000000, capacity: { context: 1000000, output: 8000, source: "admin", matchedId: model, updatedAt: null, capabilities: { vision: model === "vision-model", reasoning: true, toolCall: true } }, ...(model === "vision-model" ? { tokenUsage: { model, contextBudget: 1000000, contextTokens: 5700, lastCall: { input: 5500, output: 200, cacheRead: 1000, cacheWrite: null, total: 5700 }, cumulative: { total: 5700, calls: 1, unreportedCalls: 0 } } } : {}) });
beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear();
  await i18n.changeLanguage("zh-CN");
  patchUserSettings({ providerConfigId: "provider-1", defaultModel: "vision-model", providerModelOptions: ["vision-model", "text-model"] });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(context(new URL(String(input), "http://localhost").searchParams.get("model") ?? undefined)), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Harness({ onSubmit = vi.fn(async () => true), projectId = "engineering-a", running = false, canCancel = false, disabled = false, onCancel = vi.fn(async () => {}), baseText = "" }: {
  onSubmit?: (options: { attachments?: unknown[]; reasoning?: boolean }) => Promise<boolean>;
  projectId?: string; running?: boolean; canCancel?: boolean; disabled?: boolean; onCancel?: () => Promise<void>; baseText?: string;
}) {
  const [text, setText] = useState(baseText);
  return <I18nextProvider i18n={i18n}><WorkspaceRepositoryProvider repository={repository} projectId={projectId}>
    <RequirementComposer text={text} initialized hasUncommittedDraft={text !== baseText} disabled={disabled} submitDisabled={disabled} running={running} canCancel={canCancel} compact={false} submitLabel="提取需求规则" descriptionId="guidance" onTextChange={setText} onSubmit={onSubmit} onCancel={onCancel} />
  </WorkspaceRepositoryProvider></I18nextProvider>;
}

it("uses the shared fixed-height composer and Enter submits engineering analysis without clearing the source", async () => {
  const user = userEvent.setup(); const onSubmit = vi.fn(async () => true);
  const { container } = render(<Harness onSubmit={onSubmit} />);
  const input = screen.getByRole("textbox", { name: "系统业务需求" });
  expect(input.closest('[data-slot="modeling-composer"]')).toBeInTheDocument();
  expect(input).toHaveClass("h-80", "field-sizing-fixed", "overflow-y-auto");
  expect(container.querySelector('[data-slot="modeling-composer"]')).toBeInTheDocument();
  await user.type(input, "学生预约会议室");
  await user.keyboard("{Shift>}{Enter}{/Shift}同一时间不能重复预约");
  expect(onSubmit).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(input).toHaveValue("学生预约会议室\n同一时间不能重复预约");
  expect(screen.queryByRole("button", { name: "引用" })).not.toBeInTheDocument();
});

it("sends a Markdown attachment-only analysis and the selected reasoning setting", async () => {
  const user = userEvent.setup(); const onSubmit = vi.fn(async () => true);
  render(<Harness onSubmit={onSubmit} />);
  await user.click(await screen.findByRole("switch", { name: "推理" }));
  fireEvent.drop(screen.getByRole("textbox"), { dataTransfer: { types: ["Files"], files: [new File(["# 需求\n学生预约会议室"], "requirements.md")] } });
  await screen.findByRole("group", { name: /requirements.md/ });
  await user.click(screen.getByRole("button", { name: "提取需求规则" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ reasoning: true, attachments: [expect.objectContaining({ name: "requirements.md", type: "document", text: "# 需求\n学生预约会议室" })] }));
});

it("keeps the sole model visible without showing a project context counter", async () => {
  patchUserSettings({ providerModelOptions: ["vision-model"] });
  render(<Harness />);
  const selector = screen.getByRole("combobox");
  expect(selector).toHaveTextContent("vision-model");
  expect(selector.closest('[data-slot="modeling-composer"]')).toBeInTheDocument();
  await screen.findByRole("switch", { name: "推理" });
  expect(screen.queryByRole("button", { name: "Token 用量" })).not.toBeInTheDocument();
  expect(screen.queryByText("5.7k / 1M")).not.toBeInTheDocument();
});

it("keeps text and attachments when replacement is declined or analysis fails", async () => {
  const user = userEvent.setup(); const onSubmit = vi.fn(async () => false);
  render(<Harness onSubmit={onSubmit} />);
  await user.type(screen.getByRole("textbox"), "需要保留的草稿");
  fireEvent.drop(screen.getByRole("textbox"), { dataTransfer: { types: ["Files"], files: [new File(["附件业务需求"], "requirements.txt", { type: "text/plain" })] } });
  await screen.findByRole("group", { name: /requirements.txt/ });
  await user.click(screen.getByRole("button", { name: "提取需求规则" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("需要保留的草稿"));
  expect(await screen.findByRole("group", { name: /requirements.txt/ })).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveValue("需要保留的草稿");
});

it("restores unsaved text for the same project without leaking into another project", async () => {
  const user = userEvent.setup();
  const first = render(<Harness baseText="已保存需求" />);
  await user.type(screen.getByRole("textbox"), "，本地草稿");
  first.unmount();
  const readOnly = render(<Harness disabled baseText="已保存需求" />);
  expect(screen.getByRole("textbox")).toHaveValue("已保存需求"); readOnly.unmount();
  const other = render(<Harness projectId="engineering-b" baseText="其他项目" />);
  expect(screen.getByRole("textbox")).toHaveValue("其他项目"); other.unmount();
  render(<StrictMode><Harness baseText="已保存需求" /></StrictMode>);
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("已保存需求，本地草稿"));
});

it("exposes stop for the current engineering run and disables mutation in read-only mode", async () => {
  const user = userEvent.setup(); const onCancel = vi.fn(async () => {});
  const view = render(<Harness running canCancel onCancel={onCancel} />);
  await user.click(screen.getByRole("button", { name: "停止生成" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  view.unmount();
  render(<Harness disabled />);
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.getByRole("button", { name: "添加附件" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "提取需求规则" })).toBeDisabled();
});

it("does not retain an earlier model's vision capability while a different model resolves", async () => {
  render(<Harness />);
  await screen.findByRole("switch", { name: "推理" });
  let resolveContext!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { resolveContext = resolve; }));
  act(() => patchUserSettings({ defaultModel: "text-model" }));
  await waitFor(() => expect(screen.queryByRole("switch", { name: "推理" })).not.toBeInTheDocument());
  await act(async () => { resolveContext(new Response(JSON.stringify(context("text-model")), { status: 200, headers: { "Content-Type": "application/json" } })); });
  await screen.findByRole("switch", { name: "推理" });
});
