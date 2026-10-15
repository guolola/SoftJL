// Covers catalog setup, one-time credential display, revocation and account consent guards.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McpConnectionsPanel } from "./mcp-connections-panel";
import { McpConsentPage, McpConsentPanel } from "./mcp-consent-page";
import { mcpApi, McpApiError, type ConnectionInfo } from "../services/mcp-api";
import { clientConfiguration } from "../model/client-configurations";
import { FloatingAlertProvider } from "../../../shared/ui/floating-alert";
vi.mock("../services/mcp-api", async (original) => ({
  ...(await original<typeof import("../services/mcp-api")>()),
  mcpApi: {
    connections: vi.fn(),
    createToken: vi.fn(),
    revoke: vi.fn(),
    interaction: vi.fn(),
    consent: vi.fn(),
    deny: vi.fn(),
  },
}));
const info: ConnectionInfo = {
  enabled: true,
  serverUrl: "https://platform.example/api/mcp",
  csrf: "test-csrf",
  projects: [{ id: "library-id", name: "图书管理系统" }],
  connections: [
    {
      id: "connection-id",
      name: "我的工具",
      kind: "pat",
      projectIds: ["library-id"],
      createdAt: "2026-01-01",
      expiresAt: "2099-01-01",
      revokedAt: null,
      lastUsedAt: null,
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mcpApi.connections).mockResolvedValue(
    info as Awaited<ReturnType<typeof mcpApi.connections>>,
  );
  vi.mocked(mcpApi.interaction).mockResolvedValue({
    clientName: "外部客户端",
    clientId: "client-id",
  });
});
async function chooseAccountScope() {
  const user = userEvent.setup();
  screen.getByRole("combobox", { name: "授权项目" }).focus();
  await user.keyboard("[ArrowDown]");
  await user.click(await screen.findByRole("option", { name: "账号可访问的全部项目" }));
}
async function openClientGuide(name = "Cursor") {
  fireEvent.click(await screen.findByRole("button", { name: `查看 ${name} 接入指南` }));
  return screen.findByRole("dialog", { name: `连接 ${name}` });
}
describe("MCP connections", () => {
  it("links directly to the MCP article while connection status is loading", async () => {
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取连接状态");
    const documentation = screen.getByRole("link", { name: "查看 MCP 文档" });
    expect(documentation).toBeVisible();
    expect(documentation).toHaveAttribute("href", "https://jianglisoftware.com/tutorial");
    await screen.findByRole("button", { name: "查看 Qoder 接入指南" });
    expect(documentation).toBeVisible();
  });
  it("lists all twelve clients before opening setup and keeps the shared address on the page", async () => {
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    await screen.findByRole("button", { name: "查看 Qoder 接入指南" });
    expect(screen.getAllByRole("button", { name: /^查看 .+ 接入指南$/ })).toHaveLength(12);
    for (const name of ["DeepSeek Harness", "Qoder", "Kimi Code", "MiniMax Code", "WorkBuddy", "TRAE", "Qwen Code", "Cursor", "VS Code", "Codex", "Claude", "MiniMax Agent"]) {
      expect(screen.getByRole("button", { name: `查看 ${name} 接入指南` })).toBeVisible();
    }
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "使用的软件" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "连接方式" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("连接名称")).not.toBeInTheDocument();
    const address = screen.getByRole("textbox", { name: "MCP 地址" });
    expect(address).toHaveValue(info.serverUrl);
    expect(address.closest('[role="dialog"], [data-slot="card"]')).toBeNull();
    const catalog = screen.getByRole("region", { name: "MCP 地址" });
    expect(within(catalog).getByRole("textbox", { name: "MCP 地址" })).toBe(address);
    expect(within(catalog).getByRole("button", { name: "查看 DeepSeek Harness 接入指南" })).toBeVisible();
    expect(screen.getAllByRole("textbox", { name: "MCP 地址" })).toHaveLength(1);
  });
  it("opens the selected client's configuration and documentation in its guide", async () => {
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    const dialog = await openClientGuide("Cursor");
    expect(within(dialog).getByLabelText("客户端配置")).toHaveTextContent(info.serverUrl!);
    expect(within(dialog).queryByLabelText("终端与会话命令")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "查看客户端说明" })).toHaveAttribute("href", "https://cursor.com/docs/mcp");
    expect(within(dialog).queryByText("qoder mcp list")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("MCP 地址")).not.toBeInTheDocument();
  });
  it.each(["DeepSeek Harness", "MiniMax Code"])("starts %s with personal token authentication locked", async (name) => {
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    const dialog = await openClientGuide(name);
    const authentication = within(dialog).getByRole("combobox", { name: "连接方式" });
    expect(authentication).toHaveTextContent("个人令牌");
    expect(authentication).toBeDisabled();
    expect(within(dialog).getByText("此客户端使用个人令牌连接，请先创建令牌并在客户端完成配置。")).toBeVisible();
    expect(within(dialog).getByLabelText("连接名称")).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "创建 30 天个人令牌" })).toBeDisabled();
  });
  it("shows an immediate lightweight notification after copying and reports clipboard failure", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<FloatingAlertProvider><McpConnectionsPanel onNavigate={vi.fn()} /></FloatingAlertProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "复制地址" }));
    expect(screen.queryByRole("button", { name: "刷新状态" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("已复制")).toBeVisible());
    expect(writeText).toHaveBeenCalledWith(info.serverUrl);
    writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(screen.getByRole("button", { name: "复制地址" }));
    await waitFor(() => expect(screen.getByText("复制失败，请手动选择文本复制。")).toBeVisible());
  });
  it("offers unboxed expandable usage examples with a project-name placeholder and no project selector", async () => {
    const user = userEvent.setup();
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    const example = await screen.findByRole("button", { name: "如何根据项目资料开始实现？" });
    expect(screen.getAllByRole("button", { name: /如何/ })).toHaveLength(4);
    expect(screen.queryByRole("combobox", { name: "选择项目" })).not.toBeInTheDocument();
    expect(screen.queryByText("连接概况")).not.toBeInTheDocument();
    expect(example.closest('[data-slot="card"]')).toBeNull();
    for (const trigger of screen.getAllByRole("button", { name: /如何/ })) expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "复制案例提示词" })).not.toBeInTheDocument();
    await user.click(example);
    expect(example).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "复制案例提示词" })).toBeEnabled();
    const prompt = screen.getByRole("region", { name: "如何根据项目资料开始实现？" }).querySelector("pre");
    expect(prompt).toHaveTextContent("请通过 UML 平台 MCP 读取项目 某某自己项目");
    expect(prompt).toHaveTextContent("本次任务：先总结");
    await user.click(example);
    expect(screen.queryByRole("button", { name: "复制案例提示词" })).not.toBeInTheDocument();
    await user.click(example);
    expect(screen.getByRole("button", { name: "复制案例提示词" })).toBeEnabled();
  });
  it("omits the acceptance note and shows OAuth guidance without a card or alert", async () => {
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    await openClientGuide();
    const guidance = await screen.findByText("在客户端发起连接，在打开的平台页面登录并选择允许读取的项目。若未跳转，请检查客户端的连接与鉴权状态。");
    expect(guidance.closest('[data-slot="card"], [role="alert"]')).toBeNull();
    expect(screen.getByText("传输协议：Streamable HTTP（流式 HTTP）。请在客户端使用本页 MCP 地址连接。")).toBeVisible();
    expect(screen.getByLabelText("MCP 地址", { selector: "input" })).toHaveAccessibleDescription("传输协议：Streamable HTTP（流式 HTTP）。请在客户端使用本页 MCP 地址连接。");
    expect(screen.queryByText("客户端版本仍需实际验收，配置示例不代表已连接。")).not.toBeInTheDocument();
  });
  it("creates a selected-project token only after selection and closes the one-time display", async () => {
    const user = userEvent.setup();
    vi.mocked(mcpApi.createToken).mockResolvedValue({
      token: "once-only-token",
    });
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    await openClientGuide();
    screen.getByRole("combobox", { name: "连接方式" }).focus();
    await user.keyboard("[ArrowDown]");
    await user.click(
      await screen.findByRole("option", { name: "个人令牌" }),
    );
    const create = screen.getByRole("button", { name: "创建 30 天个人令牌" });
    expect(screen.getByText("传输协议：Streamable HTTP（流式 HTTP）。请在客户端使用本页 MCP 地址连接。")).toBeVisible();
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText("连接名称"), {
      target: { value: "学生客户端" },
    });
    expect(create).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "图书管理系统" }));
    expect(create).toBeEnabled();
    fireEvent.click(create);
    await waitFor(() =>
      expect(mcpApi.createToken).toHaveBeenCalledWith(
        "学生客户端",
        "test-csrf",
        { projectScope: "selected", projectIds: ["library-id"] },
      ),
    );
    expect(await screen.findByLabelText("新令牌（仅展示一次）")).toHaveValue(
      "once-only-token",
    );
    fireEvent.click(screen.getByRole("button", { name: "已保存，关闭展示" }));
    expect(
      screen.queryByLabelText("新令牌（仅展示一次）"),
    ).not.toBeInTheDocument();
  });
  it("allows personal token creation before any projects exist and uses plain authentication labels", async () => {
    const user = userEvent.setup();
    vi.mocked(mcpApi.connections).mockResolvedValue({ ...info, projects: [], connections: [] });
    vi.mocked(mcpApi.createToken).mockResolvedValue({ token: "account-token" });
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    await openClientGuide();
    const authentication = await screen.findByRole("combobox", { name: "连接方式" });
    expect(authentication).toHaveTextContent("浏览器授权");
    authentication.focus();
    await user.keyboard("[ArrowDown]");
    await user.click(await screen.findByRole("option", { name: "个人令牌" }));
    fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "我的电脑" } });
    await chooseAccountScope();
    fireEvent.click(screen.getByRole("button", { name: "创建 30 天个人令牌" }));
    await waitFor(() => expect(mcpApi.createToken).toHaveBeenCalledWith("我的电脑", "test-csrf", { projectScope: "account", projectIds: [] }));
    expect(screen.queryByText("当前没有可授权项目，请先创建或加入项目。")).not.toBeInTheDocument();
  });
  it.each(["Qoder", "WorkBuddy"])("offers only the documented desktop OAuth flow for %s", async (name) => {
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    const dialog = await openClientGuide(name);
    const authentication = within(dialog).getByRole("combobox", { name: "连接方式" });
    expect(authentication).toHaveTextContent("浏览器授权");
    expect(authentication).toBeDisabled();
    expect(within(dialog).getByText("此处提供已核实的桌面端浏览器授权流程。")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "创建 30 天个人令牌" })).not.toBeInTheDocument();
  });
  it("offers OAuth and token authentication for the TRAE desktop IDE", async () => {
    const user = userEvent.setup();
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    const dialog = await openClientGuide("TRAE");
    const authentication = within(dialog).getByRole("combobox", { name: "连接方式" });
    expect(authentication).toHaveTextContent("浏览器授权");
    expect(authentication).toBeEnabled();
    authentication.focus();
    await user.keyboard("[ArrowDown]");
    await user.click(await screen.findByRole("option", { name: "个人令牌" }));
    expect(within(dialog).getByLabelText("客户端配置")).toHaveTextContent("Bearer <YOUR_PERSONAL_TOKEN>");
    expect(within(dialog).getByRole("button", { name: "创建 30 天个人令牌" })).toBeDisabled();
  });
  it("defaults Kimi desktop to token setup while preserving the documented CLI-assisted OAuth option", async () => {
    const user = userEvent.setup();
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    const dialog = await openClientGuide("Kimi Code");
    const authentication = within(dialog).getByRole("combobox", { name: "连接方式" });
    expect(authentication).toHaveTextContent("个人令牌");
    expect(authentication).toBeEnabled();
    expect(within(dialog).getByLabelText("客户端配置")).toHaveTextContent("bearerTokenEnvVar");
    authentication.focus();
    await user.keyboard("[ArrowDown]");
    await user.click(await screen.findByRole("option", { name: "浏览器授权" }));
    expect(within(dialog).getByRole("list")).toHaveTextContent("/mcp-config login uml-platform");
    expect(within(dialog).queryByRole("button", { name: "创建 30 天个人令牌" })).not.toBeInTheDocument();
  });
  it("does not offer credential creation for the unverified MiniMax Agent web setup", async () => {
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    const dialog = await openClientGuide("MiniMax Agent");
    expect(within(dialog).getByText("网页版")).toBeVisible();
    expect(within(dialog).getByText(/目前未找到官方明确的个人自定义远程 MCP 接入流程/)).toBeVisible();
    expect(within(dialog).queryByRole("combobox", { name: "连接方式" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "创建 30 天个人令牌" })).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("客户端配置")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/在客户端发起连接，在打开的平台页面登录并授权/)).not.toBeInTheDocument();
    expect(mcpApi.createToken).not.toHaveBeenCalled();
  });
  it("resets authentication and removes one-time credentials when closing and selecting another client", async () => {
    const user = userEvent.setup();
    vi.mocked(mcpApi.createToken).mockResolvedValue({ token: "client-specific-once-only-token" });
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    await openClientGuide();
    screen.getByRole("combobox", { name: "连接方式" }).focus();
    await user.keyboard("[ArrowDown]");
    await user.click(await screen.findByRole("option", { name: "个人令牌" }));
    fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "临时客户端" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "图书管理系统" }));
    fireEvent.click(screen.getByRole("button", { name: "创建 30 天个人令牌" }));
    expect(await screen.findByLabelText("新令牌（仅展示一次）")).toHaveValue("client-specific-once-only-token");
    await waitFor(() => expect(screen.getByRole("button", { name: "创建 30 天个人令牌" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const dialog = await openClientGuide("Codex");
    expect(within(dialog).getByRole("combobox", { name: "连接方式" })).toHaveTextContent("浏览器授权");
    expect(within(dialog).queryByLabelText("终端与会话命令")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "查看客户端说明" })).toHaveAttribute("href", "https://learn.chatgpt.com/docs/developer-settings");
    expect(screen.queryByLabelText("新令牌（仅展示一次）")).not.toBeInTheDocument();
    screen.getByRole("combobox", { name: "连接方式" }).focus();
    await user.keyboard("[ArrowDown]");
    await user.click(await screen.findByRole("option", { name: "个人令牌" }));
    expect(screen.getByLabelText("连接名称")).toHaveValue("");
    expect(screen.queryByLabelText("新令牌（仅展示一次）")).not.toBeInTheDocument();
  });
  it("keeps the guide open while token creation is pending", async () => {
    const user = userEvent.setup();
    let finish!: (value: { token: string }) => void;
    vi.mocked(mcpApi.createToken).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    await openClientGuide("DeepSeek Harness");
    fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "我的 Harness" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "图书管理系统" }));
    fireEvent.click(screen.getByRole("button", { name: "创建 30 天个人令牌" }));
    expect(screen.getByLabelText("连接名称")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "连接 DeepSeek Harness" })).toBeVisible();
    await user.keyboard("[Escape]");
    expect(screen.getByRole("dialog", { name: "连接 DeepSeek Harness" })).toBeVisible();
    finish({ token: "pending-token" });
    expect(await screen.findByLabelText("新令牌（仅展示一次）")).toHaveValue("pending-token");
    await waitFor(() => expect(screen.getByLabelText("连接名称")).toBeEnabled());
    await user.keyboard("[Escape]");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByLabelText("新令牌（仅展示一次）")).not.toBeInTheDocument();
  });
  it("describes account-wide connections using the account's accessible project scope", async () => {
    vi.mocked(mcpApi.connections).mockResolvedValue({ ...info, connections: [{ ...info.connections[0], kind: "pat", projectIds: [], projectScope: "account" }] });
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    expect(await screen.findByText("账号可访问的全部项目")).toBeVisible();
  });
  it("displays revoked state after revocation", async () => {
    vi.mocked(mcpApi.revoke).mockResolvedValue({});
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    const revoke = await screen.findByRole("button", { name: "撤销 我的工具" });
    vi.mocked(mcpApi.connections).mockResolvedValue({
      ...info,
      connections: [
        { ...info.connections[0], kind: "pat", revokedAt: "2026-10-08" },
      ],
    });
    fireEvent.click(revoke);
    fireEvent.click(await screen.findByRole("button", { name: "撤销" }));
    await waitFor(() =>
      expect(mcpApi.revoke).toHaveBeenCalledWith("connection-id", "test-csrf"),
    );
    await screen.findAllByText(/已撤销/);
    expect(
      screen.getByRole("button", { name: "撤销 我的工具" }),
    ).toBeDisabled();
  });
  it("requires project selection or explicit account access or automatic submission", async () => {
    render(
      <McpConsentPanel
        onNavigate={vi.fn()}
        interactionId="interaction-id"
      />,
    );
    expect(await screen.findByText("授权给 外部客户端")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认授权" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "授权项目" })).toHaveTextContent("选择项目");
    await chooseAccountScope();
    expect(screen.getByRole("button", { name: "确认授权" })).toBeEnabled();
    expect(screen.queryByText("library-id")).not.toBeInTheDocument();
    expect(mcpApi.consent).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "授权项目" })).toHaveTextContent("账号可访问的全部项目");
    expect(screen.getByText(/允许读取账号当前及以后创建或加入的全部项目/)).toBeVisible();
  });
  it("preserves interaction when asking the student to log in", async () => {
    vi.mocked(mcpApi.connections).mockRejectedValue(new McpApiError(401));
    const navigate = vi.fn();
    render(
      <McpConsentPanel
        onNavigate={navigate}
        interactionId="interaction-id"
      />,
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/login?redirect=%2Faccount%2Fconnections%3Finteraction%3Dinteraction-id",
      ),
    );
  });
  it("keeps consent loading and failure recovery inside the standalone card", async () => {
    vi.mocked(mcpApi.interaction).mockRejectedValueOnce(new McpApiError(403));
    render(<McpConsentPage onNavigate={vi.fn()} interactionId="interaction-id" />);
    expect(screen.getByRole("status").closest('[data-slot="card"]')).not.toBeNull();
    const retry = await screen.findByRole("button", { name: "重试" });
    expect(screen.getByRole("alert").closest('[data-slot="card"]')).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "允许读取的项目" })).not.toBeInTheDocument();
    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { name: "授权给 外部客户端" })).toBeVisible();
    expect(await screen.findByRole("button", { name: "确认授权" })).toBeDisabled();
  });
  it("submits account consent and keeps cancellation connected to the OAuth interaction", async () => {
    // An invalid redirect avoids navigation in JSDOM while still exercising the actual consent actions.
    vi.mocked(mcpApi.consent).mockResolvedValue({ redirect: "https://invalid.example/" });
    vi.mocked(mcpApi.deny).mockResolvedValue({ redirect: "https://invalid.example/" });
    render(<McpConsentPage onNavigate={vi.fn()} interactionId="interaction-id" />);
    await screen.findByRole("button", { name: "确认授权" });
    await chooseAccountScope();
    fireEvent.click(screen.getByRole("button", { name: "确认授权" }));
    await waitFor(() => expect(mcpApi.consent).toHaveBeenCalledWith("interaction-id", "test-csrf", { projectScope: "account", projectIds: [] }));
    await waitFor(() => expect(screen.getByRole("button", { name: "取消" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(mcpApi.deny).toHaveBeenCalledWith("interaction-id", "test-csrf"));
  });
  it("allows accounts with no projects to authorize and prevents duplicate pending submissions", async () => {
    vi.mocked(mcpApi.connections).mockResolvedValue({ ...info, projects: [] });
    let finish!: (value: { redirect: string }) => void;
    vi.mocked(mcpApi.consent).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<McpConsentPage onNavigate={vi.fn()} interactionId="interaction-id" />);
    const authorize = await screen.findByRole("button", { name: "确认授权" });
    expect(authorize).toBeDisabled();
    await chooseAccountScope();
    expect(authorize).toBeEnabled();
    fireEvent.click(authorize);
    expect(authorize).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    fireEvent.click(authorize);
    expect(mcpApi.consent).toHaveBeenCalledTimes(1);
    expect(mcpApi.consent).toHaveBeenCalledWith("interaction-id", "test-csrf", { projectScope: "account", projectIds: [] });
    finish({ redirect: "https://invalid.example/" });
    await screen.findByText("连接操作未完成，请重试。");
  });
  it("feature-off state offers no credential or consent action", async () => {
    vi.mocked(mcpApi.connections).mockResolvedValue({ enabled: false });
    render(<McpConnectionsPanel onNavigate={vi.fn()} />);
    await screen.findByText("此部署尚未启用 MCP，请由部署者开启 MCP_ENABLED 并配置服务地址。");
    expect(screen.getByRole("link", { name: "查看 MCP 文档" })).toHaveAttribute("href", "https://jianglisoftware.com/tutorial");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("keeps actual client formats distinct without embedding credentials", () => {
    const url = "https://platform.example/api/mcp";
    expect(
      JSON.parse(clientConfiguration("vscode", url, "oauth")).servers[
        "uml-platform"
      ].type,
    ).toBe("http");
    expect(
      JSON.parse(clientConfiguration("qwen", url, "oauth")).mcpServers[
        "uml-platform"
      ].httpUrl,
    ).toBe(url);
    expect(clientConfiguration("codex", url, "pat")).toContain(
      'bearer_token_env_var = "UML_MCP_TOKEN"',
    );
    expect(clientConfiguration("minimax", url, "pat")).toContain(
      "${UML_MCP_TOKEN}",
    );
  });
});
