// Verifies the ordinary user journey and independent edits through the real workspace hook.
import type { ReactNode } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createStandardProjectState, type StandardProjectState } from "@uml-platform/contracts";
import { withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository";
import { StandardWorkspace } from "./standard-workspace";
import { standardApi } from "../services/standard-api";
import { patchUserSettings } from "../../../shared/lib/user-settings";
import { FloatingAlertProvider } from "../../../shared/ui/floating-alert";
vi.mock("../services/standard-api", () => ({ standardApi: { read: vi.fn(), start: vi.fn(), saveDescription: vi.fn(), saveModel: vi.fn(), cancel: vi.fn(), documentUrl: () => "/download" } }));
vi.mock("../../../shared/template/layout/default-pages-layout", () => ({ DefaultPagesLayout: ({ sidebar, children }: {
        sidebar: ReactNode;
        children: ReactNode;
    }) => <div>{sidebar}<main>{children}</main></div> }));
vi.mock("../../../shared/template/layout/default-sidebar", () => ({ DefaultSidebar: ({ children, footer }: {
        children: ReactNode;
        footer: ReactNode;
    }) => <nav>{children}{footer}</nav> }));
vi.mock("../../workspace-shell/components/sidebar-user-dropdown", () => ({ SidebarUserDropdown: () => null }));
const props = { projectId: "p", projectName: "图书项目", canEdit: true, header: null, onNavigate: vi.fn(), onSettings: vi.fn(), onOpenAccount: vi.fn() };
let state: StandardProjectState;
beforeEach(() => {
    localStorage.clear();
    patchUserSettings({ providerConfigId: "provider", providerModelOptions: ["test-model"], defaultModel: "test-model" });
    sessionStorage.clear();
    vi.clearAllMocks();
    state = createStandardProjectState();
    vi.mocked(standardApi.read).mockImplementation(async () => ({ state: structuredClone(state) }));
});
it("removes both welcome blocks as soon as the first message is sent, before the server acknowledges it", async () => {
    let acknowledge!: (value: {
        state: StandardProjectState;
    }) => void;
    vi.mocked(standardApi.start).mockReturnValueOnce(new Promise(resolve => { acknowledge = resolve; }));
    const user = userEvent.setup();
    render(withWorkspaceProviders(<StandardWorkspace {...props}/>, createMockWorkspaceRepository()));
    expect(await screen.findByTestId("agent-intro-badges")).toBeInTheDocument();
    expect(screen.getByTestId("agent-feature-showcase")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("发送消息…"), "学生可以借阅图书");
    await user.click(screen.getByRole("button", { name: "发送消息" }));
    expect(screen.getByText("学生可以借阅图书")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-intro-badges")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-feature-showcase")).not.toBeInTheDocument();
    const command = vi.mocked(standardApi.start).mock.calls[0][1];
    state.conversation = [{ id: `user:${command.requestId}`, role: "user", text: command.message!, status: "completed", createdAt: "now" }];
    await act(async () => acknowledge({ state }));
    expect(screen.queryByTestId("agent-intro-badges")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-feature-showcase")).not.toBeInTheDocument();
});
it("connects saved messages without adding a custom continuation panel to the source", async () => {
    state.conversation = [{ id: "u", role: "user", text: "原有用户消息", status: "completed", createdAt: "now" }];
    state.run = { id: "r", operation: "chat", status: "stopped", startedAt: "now" };
    vi.mocked(standardApi.start).mockResolvedValue({ state });
    render(withWorkspaceProviders(<StandardWorkspace {...props}/>, createMockWorkspaceRepository()));
    expect(await screen.findByText("原有用户消息")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agent 聊天" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "运行历史" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("发送消息…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "继续未完成内容" })).not.toBeInTheDocument();
    expect(standardApi.start).not.toHaveBeenCalled();
});
it("omits saved requirements and result previews while keeping diagrams accessible from the sidebar", async () => {
    state = { ...createStandardProjectState("旧需求"), diagrams: { class: { id: "class", kind: "class", title: "图书类图", status: "completed", svg: "<svg/>" } } };
    const user = userEvent.setup();
    render(withWorkspaceProviders(<StandardWorkspace {...props}/>, createMockWorkspaceRepository()));
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
    expect(screen.getByRole("button", { name: "生成" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "说明书" }));
    expect(await screen.findByText("需求规格说明书")).toBeInTheDocument();
    expect(screen.getByText("软件设计说明书")).toBeInTheDocument();
    expect(standardApi.start).not.toHaveBeenCalled();
});
it("read-only projects cannot generate", async () => {
    render(withWorkspaceProviders(<StandardWorkspace {...props} canEdit={false}/>, createMockWorkspaceRepository()));
    await userEvent.click(await screen.findByRole("button", { name: "测试" }));
    expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
});
it("opens the shared detail layout and keeps the selected diagram after saving and refreshing its SVG", async () => {
    state.description = "图书管理";
    state.diagrams.class = { id: "class", kind: "class", title: "图书类图", status: "completed", svg: '<svg><text>旧图</text></svg>', model: {
            nodes: [{ id: "book", type: "class", label: "图书", fields: ["ISBN"], methods: ["borrow()"] }], edges: [],
        } };
    vi.mocked(standardApi.saveModel).mockImplementation(async (_, id, model) => ({ state: { ...state, diagrams: {
                ...state.diagrams, [id]: { ...state.diagrams[id], model, svg: '<svg><text>新图</text></svg>' },
            } } }));
    const user = userEvent.setup();
    render(withWorkspaceProviders(<StandardWorkspace {...props}/>, createMockWorkspaceRepository()));
    await user.click(await screen.findByRole("button", { name: "展开 UML 模型" }));
    await user.click(screen.getByRole("button", { name: "设计类图" }));
    expect(screen.getByRole("heading", { name: "图书类图" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /编辑.*图书/ }));
    await user.clear(within(screen.getByRole("dialog")).getByLabelText("元素名称"));
    await user.type(within(screen.getByRole("dialog")).getByLabelText("元素名称"), "馆藏图书");
    await user.click(screen.getByRole("button", { name: "保存并更新此图" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(standardApi.saveModel).toHaveBeenCalledWith("p", "class", { nodes: [{ ...state.diagrams.class.model!.nodes[0], label: "馆藏图书" }], edges: [] });
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
    const user = userEvent.setup();
    render(withWorkspaceProviders(<StandardWorkspace {...props}/>, createMockWorkspaceRepository()));
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
    state.diagrams.usecase_reader = { id: "usecase_reader", kind: "usecase", roleId: "reader", title: "读者 · 用例图", status: "completed", svg: '<svg><text>角色用例</text></svg>' };
    const user = userEvent.setup();
    render(withWorkspaceProviders(<StandardWorkspace {...props}/>, createMockWorkspaceRepository()));
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
    render(withWorkspaceProviders(<FloatingAlertProvider><StandardWorkspace {...props}/></FloatingAlertProvider>, createMockWorkspaceRepository()));
    await user.click(await screen.findByRole("button", { name: "测试" }));
    await user.click(screen.getByRole("button", { name: "生成" }));
    const message = await screen.findByText("The request is invalid. Check it and try again.");
    expect(message.closest('[data-slot="floating-alert-item"]')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "检查模型设置" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成" })).toBeEnabled();
});
