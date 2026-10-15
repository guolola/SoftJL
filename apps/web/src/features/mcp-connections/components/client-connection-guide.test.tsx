// Verifies desktop setup, documentation destinations, and copyable configuration in the client catalog.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import type { McpClientId } from "../model/client-configurations";
import { ClientConnectionGuide } from "./client-connection-guide";

const url = "https://platform.example/api/mcp";

function renderGuide(clientId: McpClientId, mode: "oauth" | "pat" = "oauth", onCopy = vi.fn().mockResolvedValue(undefined)) {
  return render(<AppI18nProvider><ClientConnectionGuide clientId={clientId} url={url} mode={mode} onCopy={onCopy} /></AppI18nProvider>);
}

describe("ClientConnectionGuide", () => {
  // Literal official URLs catch regressions even when the guide model changes alongside its consumer.
  it.each([
    ["deepseek", "https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md"],
    ["codex", "https://learn.chatgpt.com/docs/developer-settings"],
    ["claude", "https://claude.com/docs/connectors/custom/add-unlisted"],
    ["qoder", "https://docs.qoder.com/qoder/connectors"],
    ["vscode", "https://code.visualstudio.com/docs/agent-customization/mcp-servers"],
    ["cursor", "https://cursor.com/docs/mcp"],
    ["trae", "https://docs.trae.cn/ide_add-mcp-servers"],
    ["minimax", "https://agent.minimax.io/docs/code/agents/mcp"],
    ["kimi", "https://www.kimi.com/code/docs/en/kimi-code-desktop/settings-and-extensions.html"],
    ["qwen", "https://github.com/QwenLM/qwen-code/blob/main/packages/desktop/README.md"],
    ["workbuddy", "https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide"],
  ] as const)("opens %s desktop instructions and their official desktop documentation", (clientId, source) => {
    renderGuide(clientId, clientId === "minimax" || clientId === "deepseek" || clientId === "kimi" ? "pat" : "oauth");

    expect(screen.getByText("桌面端")).toBeVisible();
    expect(screen.getByRole("list")).toBeVisible();
    expect(screen.getByRole("link", { name: "查看客户端说明" })).toHaveAttribute("href", source);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("终端与会话命令")).not.toBeInTheDocument();
    expect(screen.getByRole("list")).not.toHaveTextContent(/codex mcp add|claude mcp add|qoder mcp list|agent mcp list|traecli config edit/);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("copies Cursor's complete desktop JSON from its code header", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    renderGuide("cursor", "oauth", onCopy);

    const config = screen.getByLabelText("客户端配置");
    const copy = within(config).getByRole("button", { name: "复制代码" });
    const docs = screen.getByRole("link", { name: "查看客户端说明" });
    expect(config).toHaveTextContent(url);
    expect(copy.closest('[data-slot="code-block-header"]')).toBeInTheDocument();
    expect(docs.closest('[data-slot="code-block"]')).toBeNull();
    await user.click(copy);

    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(onCopy.mock.calls[0][0])).toEqual({ mcpServers: { "uml-platform": { url } } });
    expect(screen.queryByRole("button", { name: "复制命令" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制配置示例" })).not.toBeInTheDocument();
  });

  it("keeps paths readable as inline code and PAT instructions distinct from OAuth consent", () => {
    renderGuide("cursor", "pat");

    const list = screen.getByRole("list");
    const code = [...list.querySelectorAll("code")];
    expect(code.map((node) => node.textContent)).toEqual(expect.arrayContaining([".cursor/mcp.json", "~/.cursor/mcp.json"]));
    expect(list.textContent).not.toContain("`");
    for (const node of code) expect(node).toHaveClass("bg-muted", "font-mono", "rounded");
    expect(list).toHaveTextContent(/个人令牌/);
    expect(list).not.toHaveTextContent("明确选择项目并授权");
    expect(screen.getByLabelText("客户端配置")).toHaveTextContent("Bearer <YOUR_PERSONAL_TOKEN>");
  });

  it("uses the Codex TOML filename for desktop token configuration", () => {
    renderGuide("codex", "pat");

    expect(within(screen.getByLabelText("客户端配置")).getByText("config.toml")).toHaveAttribute("data-slot", "code-block-filename");
    expect(screen.getByLabelText("客户端配置")).toHaveTextContent('[mcp_servers.uml_platform]');
    expect(screen.getByLabelText("客户端配置")).toHaveTextContent('bearer_token_env_var = "UML_MCP_TOKEN"');
    expect(screen.queryByText("mcp.json")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("终端与会话命令")).not.toBeInTheDocument();
  });

  it("labels DeepSeek desktop configuration as the Cordis patch file", () => {
    renderGuide("deepseek", "pat");

    expect(within(screen.getByLabelText("客户端配置")).getByText("cordis.patch.yml")).toHaveAttribute("data-slot", "code-block-filename");
    expect(screen.getByLabelText("客户端配置")).toHaveTextContent("@deepseek-ai/dsh-mcp-client");
    expect(screen.getByLabelText("客户端配置")).toHaveTextContent("transport: streamable-http");
    expect(screen.queryByText("profile.yaml")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("终端与会话命令")).not.toBeInTheDocument();
  });

  it("shows Claude's public-network requirement and OAuth client registration", () => {
    renderGuide("claude");

    const list = screen.getByRole("list");
    expect(list).toHaveTextContent("Customize");
    expect(list).toHaveTextContent("Connectors");
    expect(list).toHaveTextContent("Register automatically");
    expect(list).toHaveTextContent("localhost");
    expect(list).toHaveTextContent(/公网|公共互联网/);
    expect(screen.queryByLabelText("客户端配置")).not.toBeInTheDocument();
  });

  it("explains an unusable local Claude URL before suggesting a reachable server address", () => {
    const localUrl = "http://localhost:3000/api/mcp";
    render(<AppI18nProvider><ClientConnectionGuide clientId="claude" url={localUrl} mode="oauth" onCopy={vi.fn()} /></AppI18nProvider>);

    const steps = screen.getAllByRole("listitem");
    expect(steps[0]).toHaveTextContent("localhost");
    expect(steps[0]).toHaveTextContent(/不能|不可|无法/);
    expect(steps[0]).toHaveTextContent("公网");
    // The prerequisite may identify the current URL, but the setup action must not reuse it.
    for (const step of steps.slice(1)) expect(step).not.toHaveTextContent(localUrl);
    expect(screen.queryByLabelText("客户端配置")).not.toBeInTheDocument();
  });

  it("explains Claude's conditional PAT header support without a CLI configuration", () => {
    renderGuide("claude", "pat");

    const list = screen.getByRole("list");
    expect(list).toHaveTextContent("No sign-in");
    expect(list).toHaveTextContent("Request headers");
    expect(list).toHaveTextContent("Authorization");
    expect(list).toHaveTextContent("Bearer");
    expect(list).toHaveTextContent(/beta|Beta|测试/);
    expect(list).toHaveTextContent("组织");
    expect(screen.queryByLabelText("客户端配置")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("终端与会话命令")).not.toBeInTheDocument();
  });

  it("identifies Kimi OAuth as a terminal-assisted flow before a new desktop session", () => {
    renderGuide("kimi", "oauth");

    const list = screen.getByRole("list");
    expect(list).toHaveTextContent(/终端|CLI/);
    expect(list).toHaveTextContent("/mcp-config login uml-platform");
    expect(list).toHaveTextContent(/新建.*会话|新会话/);
    expect(screen.getByRole("link", { name: "查看客户端说明" })).toHaveAttribute("href", "https://www.kimi.com/code/docs/en/kimi-code-desktop/settings-and-extensions.html");
  });

  it("keeps MiniMax Agent's unverified web flow separate from desktop and CLI configuration", () => {
    renderGuide("minimax-cloud");

    expect(screen.getByText("网页版")).toBeVisible();
    expect(screen.queryByText("桌面端")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看客户端说明" })).toHaveAttribute("href", "https://agent.minimax.io/");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("客户端配置")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("终端与会话命令")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制代码" })).not.toBeInTheDocument();
    expect(screen.getByText(/尚未|暂无|未核实|未找到/)).toBeVisible();
  });
});
