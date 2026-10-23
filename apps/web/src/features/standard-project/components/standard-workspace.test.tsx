// Verifies the ordinary user journey and independent edits through the real workspace hook.
import { standardModelFixture } from "@uml-platform/contracts/testing";
import { StrictMode, type ReactNode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createStandardProjectState, type StandardProjectState } from "@uml-platform/contracts";
import { withWorkspaceProviders } from "../../../../tests/helpers/workspace-test-utils";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/index";
import { StandardWorkspace } from "./standard-workspace";
import { standardApi } from "../services/standard-api";
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { FloatingAlertProvider } from "../../../shared/ui/floating-alert";
import { queueProjectIntroduction } from "../../../shared/lib/project-introduction";
import { i18n, LOCALE_PREFERENCE_STORAGE_KEY } from "../../../shared/i18n/index";
import { RouteContentReadyProvider } from "../../../shared/lib/route-content-readiness";
import { AuthenticatedRoute } from "../../user-platform/components/user-platform-pages";
import { platformApi } from "../../user-platform/services/platform-api";

vi.mock("../services/standard-api", () => ({ standardApi: { read: vi.fn(), start: vi.fn(), saveDescription: vi.fn(), saveModel: vi.fn(), cancel: vi.fn(), documentUrl: () => "/download" } }));
vi.mock("../../../shared/template/layout/default-pages-layout", () => ({ DefaultPagesLayout: ({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) => <div>{sidebar}<main>{children}</main></div> }));
vi.mock("../../../shared/template/layout/default-sidebar", () => ({ DefaultSidebar: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <nav>{children}{footer}</nav> }));
vi.mock("../../workspace-shell/components/sidebar-user-dropdown", () => ({ SidebarUserDropdown: () => null }));
const props = { projectId: "p", projectName: "图书项目", canEdit: true, header: null, onNavigate: vi.fn(), onSettings: vi.fn(), onOpenAccount: vi.fn() };
let state: StandardProjectState;
beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  localStorage.clear(); patchUserSettings({ providerConfigId: "provider", providerModelOptions: ["test-model"], defaultModel: "test-model" });
  sessionStorage.clear(); vi.clearAllMocks(); state = createStandardProjectState();
  vi.mocked(standardApi.read).mockImplementation(async () => ({ state: structuredClone(state) }));
});

it("shows the original capability cards in a dialog once for each newly created project", async () => {
  const user = userEvent.setup();
  const mount = (projectId = "p") => render(withWorkspaceProviders(
    <StrictMode><StandardWorkspace {...props} projectId={projectId} /></StrictMode>, createMockWorkspaceRepository()));
  queueProjectIntroduction("p", "standard");
  const firstVisit = mount();
  const dialog = await screen.findByRole("dialog", { name: "用 Agent 开始快速建模" });
  const showcase = within(dialog).getByTestId("agent-feature-showcase");
  for (const title of ["梳理与澄清需求", "通过对话修改模型", "生成 8 类模型", "生成测试用例", "生成 2 类说明书"]) {
    expect(within(showcase).getByText(title)).toBeInTheDocument();
  }
  expect(screen.getAllByTestId("agent-feature-showcase")).toHaveLength(1);
  expect(standardApi.start).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "开始建模" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByTestId("agent-feature-showcase")).not.toBeInTheDocument();
  expect(screen.getByRole("group", { name: "试试这些项目例子" })).toBeInTheDocument();
  firstVisit.unmount();

  // A full remount reads the same browser storage, as reopening or refreshing the project would.
  const revisit = mount();
  await screen.findByPlaceholderText("发送消息…");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  revisit.unmount();

  queueProjectIntroduction("another-project", "standard");
  const otherVisit = mount("another-project");
  await screen.findByRole("dialog", { name: "用 Agent 开始快速建模" });
  await user.click(screen.getByRole("button", { name: "关闭介绍" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  otherVisit.unmount();
  mount("another-project");
  await screen.findByPlaceholderText("发送消息…");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("does not show an introduction for existing projects or consume another project's introduction", async () => {
  queueProjectIntroduction("new-project", "standard");
  const existing = render(withWorkspaceProviders(<StandardWorkspace {...props} />, createMockWorkspaceRepository()));
  await screen.findByPlaceholderText("发送消息…");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  existing.unmount();
  render(withWorkspaceProviders(<StandardWorkspace {...props} projectId="new-project" />, createMockWorkspaceRepository()));
  await screen.findByRole("dialog", { name: "用 Agent 开始快速建模" });
});

it("waits until the project loads before showing its introduction and does not repeat it after a reload", async () => {
  let finishLoading!: (value: { state: StandardProjectState }) => void;
  vi.mocked(standardApi.read).mockReturnValueOnce(new Promise(resolve => { finishLoading = resolve; }));
  queueProjectIntroduction("p", "standard");
  const mounted = render(withWorkspaceProviders(<StandardWorkspace {...props} />, createMockWorkspaceRepository()));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await act(async () => finishLoading({ state }));
  await screen.findByRole("dialog", { name: "用 Agent 开始快速建模" });
  mounted.unmount();
  render(withWorkspaceProviders(<StandardWorkspace {...props} />, createMockWorkspaceRepository()));
  await screen.findByPlaceholderText("发送消息…");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("localizes the new-project introduction and keeps it closed after Escape", async () => {
  localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, "en");
  queueProjectIntroduction("p", "standard");
  const user = userEvent.setup();
  render(withWorkspaceProviders(<StandardWorkspace {...props} />, createMockWorkspaceRepository()));
  const dialog = await screen.findByRole("dialog", { name: "Start quick modeling with Agent" });
  expect(within(dialog).getByText("Generate 8 model types")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Start modeling" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByTestId("agent-feature-showcase")).not.toBeInTheDocument();
});

it("preserves the pending introduction until the enclosing content is visible", async () => {
  queueProjectIntroduction("p", "standard");
  const repository = createMockWorkspaceRepository();
  const view = (ready: boolean) => withWorkspaceProviders(
    <RouteContentReadyProvider ready={ready}><RouteContentReadyProvider ready>
      <StandardWorkspace {...props} />
    </RouteContentReadyProvider></RouteContentReadyProvider>, repository);
  const mounted = render(view(false));
  await screen.findByPlaceholderText("发送消息…");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  mounted.rerender(view(true));
  await screen.findByRole("dialog", { name: "用 Agent 开始快速建模" });
});

it("opens the introduction after the authentication loading screen finishes its completion and exit phases", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  const profile = vi.spyOn(platformApi, "me").mockResolvedValue({
    mfa: { enabled: false, enforcement: "totp" },
    user: { id: "owner", username: "owner", displayName: "Owner", status: "active", mfaEnabled: false },
    session: { id: "session", userId: "owner", createdAt: "now", expiresAt: "later", lastSeenAt: "now", ipAddress: null, userAgent: null },
  });
  const advance = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  queueProjectIntroduction("p", "standard");
  try {
    render(withWorkspaceProviders(<AuthenticatedRoute routeKey="/projects/p" showLoadingScreen onNavigate={vi.fn()}>
      <StandardWorkspace {...props} />
    </AuthenticatedRoute>, createMockWorkspaceRepository()));
    await advance(0);
    expect(screen.getByTestId("platform-loading-screen")).toHaveAttribute("data-loading-phase", "loading");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await advance(800);
    expect(screen.getByTestId("platform-loading-screen")).toHaveAttribute("data-loading-phase", "completing");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await advance(120);
    expect(screen.getByTestId("platform-loading-screen")).toHaveAttribute("data-loading-phase", "exiting");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await advance(520);
    expect(screen.queryByTestId("platform-loading-screen")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "用 Agent 开始快速建模" })).toBeInTheDocument();
  } finally { profile.mockRestore(); vi.useRealTimers(); }
});

it("centers the introduction within the content area and follows changes in sidebar width", async () => {
  let bounds = new DOMRect(320, 53, 1120, 720);
  const original = HTMLElement.prototype.getBoundingClientRect;
  const measurement = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    return this.dataset.testid === "standard-project-content" ? bounds : original.call(this);
  });
  queueProjectIntroduction("p", "standard");
  try {
    render(withWorkspaceProviders(<StandardWorkspace {...props} />, createMockWorkspaceRepository()));
    const dialog = await screen.findByRole("dialog", { name: "用 Agent 开始快速建模" });
    expect(dialog).toHaveStyle({ left: "880px", width: "1088px" });
    bounds = new DOMRect(48, 53, 1392, 720);
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(dialog).toHaveStyle({ left: "744px", width: "1360px" });
    bounds = new DOMRect(0, 53, 390, 720);
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(dialog).toHaveStyle({ left: "195px", width: "358px" });
  } finally { measurement.mockRestore(); }
});

it("removes welcome badges and project examples before the server acknowledges the first message", async () => {
  let acknowledge!: (value: { state: StandardProjectState }) => void;
  vi.mocked(standardApi.start).mockReturnValueOnce(new Promise(resolve => { acknowledge = resolve; }));
  const user = userEvent.setup();
  render(withWorkspaceProviders(<StandardWorkspace {...props} />, createMockWorkspaceRepository()));
  expect(await screen.findByTestId("agent-intro-badges")).toBeInTheDocument();
  expect(screen.queryByTestId("agent-feature-showcase")).not.toBeInTheDocument();
  expect(screen.getByRole("group", { name: "试试这些项目例子" })).toBeInTheDocument();
  await user.type(screen.getByPlaceholderText("发送消息…"), "学生可以借阅图书");
  await user.click(screen.getByRole("button", { name: "发送消息" }));
  expect(screen.getByText("学生可以借阅图书")).toBeInTheDocument();
  expect(screen.queryByTestId("agent-intro-badges")).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "试试这些项目例子" })).not.toBeInTheDocument();
  expect(screen.queryByTestId("agent-feature-showcase")).not.toBeInTheDocument();
  const command = vi.mocked(standardApi.start).mock.calls[0][1];
  state.conversation = [{ id: `user:${command.requestId}`, role: "user", text: command.message!, status: "completed", createdAt: "now" }];
  await act(async () => acknowledge({ state }));
  expect(screen.queryByTestId("agent-intro-badges")).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "试试这些项目例子" })).not.toBeInTheDocument();
  expect(screen.queryByTestId("agent-feature-showcase")).not.toBeInTheDocument();
});

it("connects saved messages without adding a custom continuation panel to the source", async () => {
  state.conversation = [{ id: "u", role: "user", text: "原有用户消息", status: "completed", createdAt: "now" }];
  state.run = { id: "r", operation: "chat", status: "stopped", startedAt: "now" };
  vi.mocked(standardApi.start).mockResolvedValue({ state });
  render(withWorkspaceProviders(<StandardWorkspace {...props} />, createMockWorkspaceRepository()));
  expect(await screen.findByText("原有用户消息")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Agent 聊天" })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("button", { name: "运行历史" })).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText("发送消息…")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "继续未完成内容" })).not.toBeInTheDocument();
  expect(standardApi.start).not.toHaveBeenCalled();
});
it("omits saved requirements and result previews while keeping diagrams accessible from the sidebar", async () => {
  state = { ...createStandardProjectState("旧需求"), diagrams: { class: { id: "class", kind: "class", title: "图书类图", status: "completed", svg: "<svg/>" } } };
  const user = userEvent.setup(); render(withWorkspaceProviders(<StandardWorkspace {...props} />, createMockWorkspaceRepository()));
  await screen.findByRole("button", { name: "展开 UML 模型" });
  const main = within(screen.getByRole("main"));
  expect(main.queryByText("已保存的需求描述")).not.toBeInTheDocument();
  expect(main.queryByRole("button", { name: "修改描述" })).not.toBeInTheDocument();
  expect(main.queryByText(/生成结果/u)).not.toBeInTheDocument();
  expect(main.queryByRole("img", { name: "图书类图" })).not.toBeInTheDocument();
  expect(main.queryByRole("button", { name: "打开图表页面" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "展开 UML 模型" }));
  await user.click(screen.getByRole("button", { name: "设计类图" }));
  expect(screen.getByRole("heading", { name: "图书类图" })).toBeInTheDocument();
  expect(standardApi.saveDescription).not.toHaveBeenCalled();
  expect(standardApi.start).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "测试" }));
  expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "说明书" }));
  expect(await screen.findByRole("heading", { name: "已生成说明书" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "目标说明书" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
  expect(standardApi.start).not.toHaveBeenCalled();
});
it("read-only projects cannot generate", async () => {
  render(withWorkspaceProviders(<StandardWorkspace {...props} canEdit={false} />, createMockWorkspaceRepository()));
  await userEvent.click(await screen.findByRole("button", { name: "测试" }));
  expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
});

it("opens the shared detail layout and keeps the selected diagram after saving and refreshing its SVG", async () => {
  state.description = "图书管理";
  const model = standardModelFixture("class"); model.classes[0].name = "图书";
  state.diagrams.class = { id: "class", kind: "class", title: "图书类图", status: "completed", svg: '<svg><text>旧图</text></svg>', model };
  vi.mocked(standardApi.saveModel).mockImplementation(async (_, id, model) => ({ state: { ...state, diagrams: {
    ...state.diagrams, [id]: { ...state.diagrams[id], model, svg: '<svg><text>新图</text></svg>' },
  } } }));
  const user = userEvent.setup(); render(withWorkspaceProviders(<StandardWorkspace {...props} />, createMockWorkspaceRepository()));
  await user.click(await screen.findByRole("button", { name: "展开 UML 模型" }));
  await user.click(screen.getByRole("button", { name: "设计类图" }));
  expect(screen.getByRole("heading", { name: "图书类图" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "编辑类：图书" }));
  await user.clear(within(screen.getByRole("dialog")).getByLabelText("类名称"));
  await user.type(within(screen.getByRole("dialog")).getByLabelText("类名称"), "馆藏图书");
  await user.click(screen.getByRole("button", { name: "确认编辑" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(standardApi.saveModel).toHaveBeenCalledWith("p", "class", { ...model, classes: [{ ...model.classes[0], name: "馆藏图书" }, model.classes[1]] });
  expect(screen.getByTestId("svg-preview-canvas")).toHaveTextContent("新图");
  expect(screen.getByRole("button", { name: /定位.*馆藏图书/ })).toBeInTheDocument();
  expect(screen.getByText("修改已保存")).toBeInTheDocument();
});

it.each([
  ["activity", "业务流程图"], ["sequence", "时序图"],
] as const)("keeps %s categories off the page and opens only their diagram children", async (kind, label) => {
  state.description = "图书管理";
  state.diagrams.borrow = { id: "borrow", kind, title: `借阅 · ${label}`, status: "completed", svg: '<svg><text>借阅模型</text></svg>' };
  state.diagrams.return = { id: "return", kind, title: `归还 · ${label}`, status: "completed", svg: '<svg><text>归还模型</text></svg>' };
  const user = userEvent.setup(); render(withWorkspaceProviders(<StandardWorkspace {...props} />, createMockWorkspaceRepository()));
  await user.click(await screen.findByRole("button", { name: "展开 UML 模型" }));
  await user.click(screen.getByRole("button", { name: label }));
  expect(screen.getByPlaceholderText("发送消息…")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: label })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "打开图表页面" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "借阅" }));
  expect(screen.getByRole("heading", { name: `借阅 · ${label}` })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: label }));
  expect(screen.getByRole("heading", { name: `借阅 · ${label}` })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "返回项目会话" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "UML 模型" }));
  expect(screen.getByRole("heading", { name: `借阅 · ${label}` })).toBeInTheDocument();
  expect(screen.queryByPlaceholderText("发送消息…")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Agent 聊天" }));
  expect(screen.getByPlaceholderText("发送消息…")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Agent 聊天" })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("heading", { name: label })).not.toBeInTheDocument();
  expect(standardApi.start).not.toHaveBeenCalled();
});

it("opens the overall usecase model directly at the second level without role views or custom header actions", async () => {
  state.description = "图书管理";
  state.diagrams.usecase = { id: "usecase", kind: "usecase", title: "总体用例图", status: "completed", svg: '<svg><text>总体用例</text></svg>' };
  const user = userEvent.setup(); render(withWorkspaceProviders(<StandardWorkspace {...props} />, createMockWorkspaceRepository()));
  await user.click(await screen.findByRole("button", { name: "展开 UML 模型" }));
  expect(screen.queryByRole("button", { name: "展开 用例图" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "用例图" }));
  expect(screen.getByRole("heading", { name: "总体用例图" })).toBeInTheDocument();
  expect(screen.getByTestId("svg-preview-canvas")).toHaveTextContent("总体用例");
  expect(screen.queryByRole("button", { name: /返回项目会话|返回图列表|重新生成此图/ })).not.toBeInTheDocument();
  expect(screen.queryByText("读者 · 用例图")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Agent 聊天" }));
  expect(screen.getByPlaceholderText("发送消息…")).toBeInTheDocument();
});

it("reuses the floating alert for failed requests without a page banner or settings shortcut", async () => {
  state.diagrams.class = { id: "class", kind: "class", title: "类图", status: "completed" };
  const user = userEvent.setup();
  vi.mocked(standardApi.start).mockRejectedValue(new Error("The request is invalid. Check it and try again."));
  render(withWorkspaceProviders(<FloatingAlertProvider><StandardWorkspace {...props} /></FloatingAlertProvider>, createMockWorkspaceRepository()));
  await user.type(await screen.findByPlaceholderText("发送消息…"), "生成测试用例");
  await user.click(screen.getByRole("button", { name: "发送消息" }));
  const message = await screen.findByText("The request is invalid. Check it and try again.");
  expect(message.closest('[data-slot="floating-alert-item"]')).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "检查模型设置" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled();
});
