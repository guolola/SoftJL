// Keeps desktop setup, CLI commands, and configuration formats tied to their own official contracts.
import { clientConfiguration, type McpClientId } from "./client-configurations";

export type ClientSurface = "desktop" | "cli";
type Guide = {
  source: string;
  steps: string[];
  usesConfiguration: boolean;
  configuration?: string;
  configurationFilename?: string;
  configurationLanguage?: "json" | "toml" | "yaml";
  command?: string;
};
type GuideOptions = Pick<Guide, "configuration" | "configurationFilename" | "configurationLanguage" | "command">;

// A product page changing does not make its desktop and CLI setup interchangeable.
const desktopSources = {
  codex: "https://learn.chatgpt.com/docs/developer-settings",
  claude: "https://claude.com/docs/connectors/custom/add-unlisted",
  qoder: "https://docs.qoder.com/qoder/connectors",
  vscode: "https://code.visualstudio.com/docs/agent-customization/mcp-servers",
  cursor: "https://cursor.com/docs/mcp",
  trae: "https://docs.trae.cn/ide_add-mcp-servers",
  workbuddy: "https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide",
  minimax: "https://agent.minimax.io/docs/code/agents/mcp",
  kimi: "https://www.kimi.com/code/docs/en/kimi-code-desktop/settings-and-extensions.html",
  qwen: "https://github.com/QwenLM/qwen-code/blob/main/packages/desktop/README.md",
  deepseek: "https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md",
};
const cliSources = {
  codex: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
  claude: "https://code.claude.com/docs/en/mcp",
  qoder: "https://docs.qoder.com/cli/mcp-reference",
  cursor: "https://cursor.com/docs/cli/mcp",
  kimi: "https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html",
  qwen: "https://qwenlm.github.io/qwen-code-docs/en/developers/tools/mcp-server/",
  minimax: "https://github.com/MiniMax-AI/minimax-code/blob/main/docs/examples.md",
  deepseek: "https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md",
  trae: "https://docs.trae.cn/cli_model-context-protocol",
};

export function clientGuide(
  id: McpClientId,
  surface: ClientSurface,
  url: string,
  mode: "oauth" | "pat",
  language: string,
): Guide | null {
  const en = language.startsWith("en");
  const pat = mode === "pat";
  const config = clientConfiguration(id, url, mode);
  const address = `\`${url}\``;
  let loopbackAddress = false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    loopbackAddress = hostname === "localhost" || hostname.endsWith(".localhost") ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname) || ["[::1]", "::1", "0.0.0.0"].includes(hostname);
  } catch {
    // URL validation belongs to the connection form; this guard only detects cloud-inaccessible loopback addresses.
  }
  const verify = pat
    ? en
      ? "After connecting, ask the agent to read a project accessible to your personal token and check the returned project."
      : "连接后，让 Agent 读取个人令牌可访问的项目，并核对返回的项目。"
    : en
      ? "Complete platform authorization for the projects you authorize, then ask the agent to read a project and verify the result."
      : "在平台完成授权，选择允许读取的项目，再让 Agent 读取项目并核对结果。";
  const guide = (source: string, zh: string[], english: string[], options: GuideOptions = {}): Guide => ({
    source,
    steps: [...(en ? english : zh), verify],
    usesConfiguration: Boolean(options.configuration),
    ...options,
  });
  const configuration = (
    filename: string,
    configurationLanguage: Guide["configurationLanguage"] = "json",
  ): GuideOptions => ({ configuration: config, configurationFilename: filename, configurationLanguage });

  if (surface === "desktop") {
    switch (id) {
      case "codex":
        return guide(desktopSources.codex,
          pat ? [
            "在 Codex 桌面应用设置中打开 MCP 服务管理，查看 MCP 配置。",
            "将以下 TOML 合并到用户 `config.toml`；把个人令牌保存在 `UML_MCP_TOKEN` 环境变量中，并确保启动桌面应用的进程能继承该变量。",
          ] : [
            "在 Codex 桌面应用设置中打开 MCP 服务管理，添加自定义服务。",
            `填写服务名称，选择远程 HTTP 接入，地址填写 ${address} 并保存；按应用提示发起 OAuth 登录。`,
          ],
          pat ? [
            "In Codex desktop settings, open MCP server management to inspect the MCP configuration.",
            "Merge this TOML into your user `config.toml`. Store the personal token in `UML_MCP_TOKEN` and ensure the desktop app inherits that environment variable when launched.",
          ] : [
            "In Codex desktop settings, open MCP server management and add your own server.",
            `Enter a server name, select remote HTTP, set the address to ${address}, and save. Start OAuth sign-in when prompted in the app.`,
          ], pat ? configuration("config.toml", "toml") : {});
      case "claude":
        return guide(desktopSources.claude,
          [
            loopbackAddress
              ? `当前地址 ${address} 是本机地址，Claude 云端无法访问。请先使用平台可从公网访问的 MCP 地址；不能使用 localhost、127.0.0.1 或 ::1。`
              : "远程连接由 Claude 云端发起，MCP 地址必须可从公网访问；不能填写本机 `localhost` 或 `127.0.0.1`。",
            `在 Claude 桌面应用打开 Customize → Connectors → Add custom connector，填写名称，MCP 地址填写${loopbackAddress ? "平台可从公网访问的 MCP 地址" : address}。`,
            ...(pat ? [
              "Authentication 选择 No sign-in，在 Request headers 添加 `Authorization`，值为 `Bearer` 加空格和个人令牌；不要同时启用 OAuth。",
              "Request headers 目前仅向部分组织开放 beta 测试；账号没有此入口时，请切换 OAuth 接入。",
            ] : ["选择 OAuth，在客户端注册方式中选择 Register automatically，让 Claude 自动注册并发起平台授权。"]),
          ], [
            loopbackAddress
              ? `The current address ${address} is local and cannot be reached from Claude's cloud. First obtain the platform's publicly reachable MCP URL; localhost, 127.0.0.1, and ::1 cannot be used.`
              : "Claude connects from its cloud. The MCP URL must be publicly reachable; `localhost` and `127.0.0.1` on your computer are not reachable from there.",
            `In Claude desktop, open Customize → Connectors → Add custom connector, enter a name, and set the MCP address to ${loopbackAddress ? "the platform's publicly reachable MCP URL" : address}.`,
            ...(pat ? [
              "Choose No sign-in for Authentication. Under Request headers, add `Authorization` with `Bearer` followed by a space and your personal token. Do not also enable OAuth.",
              "Request headers is currently in a limited organization beta. If your account does not offer it, use OAuth instead.",
            ] : ["Choose OAuth and Register automatically so Claude registers the client and starts platform authorization."]),
          ]);
      case "vscode":
        return guide(desktopSources.vscode,
          [
            "在 VS Code 项目中打开或创建 `.vscode/mcp.json`，合并以下完整 JSON，保留顶层 `servers` 及已有服务。",
            pat ? "将 `headers.Authorization` 中的占位符替换为个人令牌，保留 `Bearer` 和空格；不要把含真实令牌的配置提交到仓库。" : "保留 `type: http` 与 `url`；服务请求鉴权时，按 VS Code 提示在浏览器完成 OAuth。",
            "按 Ctrl / Cmd + Shift + P，运行 MCP: List Servers，选择服务并启动；首次启动时确认服务信任。",
            "本配置使用 VS Code 的 `servers` 格式；项目根目录 `.mcp.json` 使用的是另一种 `mcpServers` 格式，不能直接混用。",
          ], [
            "Open or create `.vscode/mcp.json` in your VS Code workspace and merge this complete JSON, preserving the top-level `servers` object and existing entries.",
            pat ? "Replace the placeholder in `headers.Authorization` with your personal token, preserving `Bearer` and its space. Do not commit a configuration containing a real token." : "Keep `type: http` and `url`. When authentication is required, follow VS Code's browser prompt to complete OAuth.",
            "Press Ctrl / Cmd + Shift + P, run MCP: List Servers, and select and start the server. Confirm trust when prompted on first use.",
            "This configuration uses VS Code's `servers` format. A root `.mcp.json` uses the separate `mcpServers` format; do not paste this configuration there unchanged.",
          ], configuration(".vscode/mcp.json"));
      case "qoder":
        // The new desktop app documents Form setup; the CLI OAuth/header schema is separate.
        if (pat) return null;
        return guide(desktopSources.qoder,
          [
            "在 Qoder 桌面应用左侧打开 Extensions → Connectors，点击 Add Connector → Add custom MCP。",
            `选择 Form，填写名称、选择远程 HTTP 传输，地址填写 ${address}，然后点击 Add MCP。`,
            "按连接器的授权提示登录；确认工具列表加载后，在新任务中调用该连接器。",
          ], [
            "In Qoder desktop, open Extensions → Connectors in the sidebar and select Add Connector → Add custom MCP.",
            `Choose Form, enter a name, select remote HTTP transport, set the address to ${address}, and select Add MCP.`,
            "Follow the connector's authorization prompt. After its tools load, use the connector in a new task.",
          ]);
      case "cursor":
        return guide(desktopSources.cursor,
          [
            "在 Cursor 项目 `.cursor/mcp.json` 或用户 `~/.cursor/mcp.json` 中合并以下配置，保留已有服务。",
            pat ? "将 `headers.Authorization` 中的占位符替换为个人令牌，保留 `Bearer` 和空格。" : "远程服务使用 `url` 字段；连接时按提示完成 OAuth 登录。",
            "打开侧边栏 Customize 管理 MCP，确认服务已启用并显示工具，然后在 Agent 对话中调用。",
          ], [
            "Merge this configuration into your project's `.cursor/mcp.json` or your user `~/.cursor/mcp.json`, preserving existing `servers`.",
            pat ? "Replace the placeholder in `headers.Authorization` with your personal token, preserving `Bearer` and its space." : "Remote `servers` use the `url` field. Follow the OAuth sign-in prompt when connecting.",
            "Open Customize in the sidebar to manage MCP `servers`. Confirm the server is enabled and its tools are listed, then use it in an Agent conversation.",
          ], configuration(".cursor/mcp.json"));
      case "trae":
        return guide(desktopSources.trae,
          [
            "在 TraeCode（TRAE IDE）右上角打开设置；SOLO 模式从对话面板右上角进入设置。",
            "选择 MCP → 添加 → 手动添加，在手动配置窗口粘贴以下 JSON 并确认。",
            pat ? "将 `headers.Authorization` 中的占位符替换为个人令牌；此处使用 HTTP 请求头鉴权。" : "使用支持 MCP OAuth 的当前版本，按服务授权提示登录平台；OAuth 配置不要再添加 `Authorization` 令牌头。",
            "在 Agent 对话中检查工具调用；如改用项目 `.trae/mcp.json`，先在设置 → MCP 开启项目级 MCP。",
          ], [
            "In TraeCode (TRAE IDE), open Settings in the upper-right corner. In SOLO mode, use Settings in the upper-right of the chat panel.",
            "Select MCP → Add → Add manually, paste this JSON into the manual configuration dialog, and confirm.",
            pat ? "Replace the placeholder in `headers.Authorization` with your personal token to authenticate through an HTTP request header." : "Use a current version with MCP OAuth support and follow the server's authorization prompt. Do not add an `Authorization` token header to the OAuth configuration.",
            "Check a tool call in an Agent conversation. If using a project `.trae/mcp.json` instead, first enable project-level MCP in Settings → MCP.",
          ], configuration("mcp.json"));
      case "workbuddy":
        if (pat) return null;
        return guide(desktopSources.workbuddy,
          [
            "打开 WorkBuddy 插件 → MCP 服务器 → 配置 MCP。",
            "将以下配置合并到用户 `~/.workbuddy/mcp.json` 或项目 `.workbuddy/mcp.json`，保存并检查服务状态。",
            "使用支持 HTTP OAuth 的当前版本，按授权提示登录平台，确认工具列表加载后调用。",
          ], [
            "In WorkBuddy, open Plugins → MCP Servers → Configure MCP.",
            "Merge this configuration into your user `~/.workbuddy/mcp.json` or project `.workbuddy/mcp.json`, save, and check the server status.",
            "Use a current version with HTTP OAuth support, follow the sign-in prompt, and call a tool after the tool list loads.",
          ], configuration(".workbuddy/mcp.json"));
      case "minimax":
        if (!pat) return null;
        return guide(desktopSources.minimax,
          [
            "在 MiniMax Code 桌面应用打开插件管理 → MCP Servers，选择表单或 JSON 添加远程服务。",
            "使用以下 HTTP 配置；JSON 配置文件位于 `~/.minimax/mcp.json`，合并时保留已有服务。",
            "将个人令牌保存为 `UML_MCP_TOKEN` 环境变量，完全退出并重新启动桌面应用，确保应用能够读取它，再检查服务连接及工具列表。",
          ], [
            "In MiniMax Code desktop, open plugin management → MCP Servers and add a remote server with Form or JSON.",
            "Use this HTTP configuration. The JSON configuration lives at `~/.minimax/mcp.json`; preserve existing `servers` when merging.",
            "Store your personal token in `UML_MCP_TOKEN`, fully quit and restart the desktop app, and ensure it inherits the variable. Then check the connection and tool list.",
          ], configuration(".minimax/mcp.json"));
      case "kimi":
        return guide(desktopSources.kimi,
          [
            "将以下配置合并到用户 `~/.kimi-code/mcp.json` 或项目 `.kimi-code/mcp.json`，保留已有 MCP 服务。",
            pat ? "将个人令牌保存为 `UML_MCP_TOKEN` 环境变量，完全退出并重新启动 Kimi Code 桌面应用，确保它能继承该变量。" : "本指南采用已记录的 CLI 辅助 OAuth 路径，需已安装 Kimi CLI：在终端启动 `kimi`，在 CLI 会话中执行 `/mcp-config login uml-platform`；完成后返回桌面应用。桌面端共享配置与凭据。",
            "保存后新建桌面会话，让新会话加载配置；已有会话不会自动刷新 MCP 配置。",
          ], [
            "Merge this configuration into your user `~/.kimi-code/mcp.json` or project `.kimi-code/mcp.json`, preserving existing MCP `servers`.",
            pat ? "Store your personal token in `UML_MCP_TOKEN`, fully quit and restart Kimi Code desktop, and ensure it inherits that variable." : "This guide uses the documented CLI-assisted OAuth flow, requiring Kimi CLI to be installed: start `kimi` in a terminal and run `/mcp-config login uml-platform` inside the CLI session. Then return to desktop, which shares the configuration and credentials.",
            "Save and create a new desktop session to load the configuration. Existing sessions do not automatically refresh their MCP configuration.",
          ], configuration(".kimi-code/mcp.json"));
      case "qwen":
        return guide(desktopSources.qwen,
          [
            "将以下完整 JSON 合并到用户 `~/.qwen/settings.json` 或项目 `.qwen/settings.json`，保留顶层 `mcpServers` 及已有服务；远程 HTTP 使用 `httpUrl` 字段。",
            pat ? "将 `headers.Authorization` 中的占位符替换为个人令牌；通过配置文件保存鉴权头。" : "连接服务时，按客户端鉴权提示完成 OAuth。",
            "保存后完全退出并重新启动 Qwen Code 桌面应用，在桌面对话中输入 `/mcp` 打开 MCP 管理界面，检查服务和工具。",
          ], [
            "Merge this complete JSON into your user `~/.qwen/settings.json` or project `.qwen/settings.json`, preserving the top-level `mcpServers` object and existing entries. Remote HTTP uses `httpUrl`.",
            pat ? "Replace the placeholder in `headers.Authorization` with your personal token and persist the authentication header in the configuration file." : "Follow the client's authorization prompt to complete OAuth when connecting.",
            "Save, fully quit and restart Qwen Code desktop, then enter `/mcp` in its chat to open MCP management and inspect the server and tools.",
          ], configuration(".qwen/settings.json"));
      case "deepseek":
        if (!pat) return null;
        return guide(desktopSources.deepseek,
          [
            "先启动一次 DeepSeek Harness 桌面应用，让它初始化专用的 `~/.dsh/profiles/desktop` 配置目录。",
            "将以下 MCP 插件补丁合并到 `~/.dsh/profiles/desktop/cordis.patch.yml`，保留已有补丁；将 `Authorization` 占位符替换为个人令牌。",
            "完全退出并重新启动桌面应用，使后台 Host 重新加载配置，再从桌面对话调用平台工具，检查返回的项目与权限范围。",
          ], [
            "Launch DeepSeek Harness desktop once to initialize its dedicated `~/.dsh/profiles/desktop` profile.",
            "Merge this MCP plugin patch into `~/.dsh/profiles/desktop/cordis.patch.yml`, preserving existing patches, and replace the `Authorization` placeholder with your personal token.",
            "Fully quit and restart the desktop app so its background Host reloads the configuration. Call a platform tool from a desktop conversation and check the returned project and access scope.",
          ], configuration("cordis.patch.yml", "yaml"));
      default:
        return null;
    }
  }

  switch (id) {
    case "codex":
      return guide(cliSources.codex,
        pat ? ["先在终端设置 `UML_MCP_TOKEN`，再执行以下添加命令。"] : ["在终端添加服务，再执行 `codex mcp login uml-platform` 发起浏览器授权。"],
        pat ? ["Set `UML_MCP_TOKEN` in the terminal, then run the add command below."] : ["Add the server, then run `codex mcp login uml-platform` to start browser authorization."],
        { command: `codex mcp add uml-platform --url ${JSON.stringify(url)}${pat ? " --bearer-token-env-var UML_MCP_TOKEN" : "\ncodex mcp login uml-platform"}` });
    case "claude":
      return guide(cliSources.claude,
        pat ? ["将以下配置合并到项目 `.mcp.json`，替换个人令牌占位符。", "启动 Claude Code，在 `/mcp` 中检查服务状态。"] : ["在项目终端执行添加命令。", "启动 Claude Code，在 `/mcp` 中选择服务完成鉴权。"],
        pat ? ["Merge this configuration into your project `.mcp.json` and replace the personal-token placeholder.", "Start Claude Code and check the server in `/mcp`."] : ["Run the add command from your project terminal.", "Start Claude Code and select the server in `/mcp` to authenticate."],
        pat ? configuration(".mcp.json") : { command: `claude mcp add --transport http uml-platform ${JSON.stringify(url)}` });
    case "qwen":
      return guide(cliSources.qwen,
        ["将以下配置合并到 `~/.qwen/settings.json` 或项目 `.qwen/settings.json`；个人令牌模式需替换 `Authorization` 占位符。", "启动 qwen，在会话中使用 `/mcp` 检查服务；OAuth 模式按授权提示操作。"],
        ["Merge this configuration into `~/.qwen/settings.json` or your project `.qwen/settings.json`. In personal-token mode, replace the `Authorization` placeholder.", "Start qwen and use `/mcp` in the session to inspect the server. Follow the authorization prompt in OAuth mode."],
        { ...configuration(".qwen/settings.json"), command: "qwen" });
    case "qoder":
      return guide(cliSources.qoder,
        ["将以下完整 JSON 合并到 `~/.qoder/settings.json`，保留顶层 `mcpServers` 及已有服务；个人令牌模式需替换 `Authorization` 占位符。", "终端运行 `qoder mcp list` 检查服务；已有会话中使用 `/mcp reload` 重新加载配置。"],
        ["Merge this complete JSON into `~/.qoder/settings.json`, preserving the top-level `mcpServers` object and existing entries. In personal-token mode, replace the `Authorization` placeholder.", "Run `qoder mcp list` to inspect the server. Use `/mcp reload` in an existing session to reload the configuration."],
        { ...configuration(".qoder/settings.json"), command: "qoder mcp list" });
    case "kimi":
      return guide(cliSources.kimi,
        ["将以下配置合并到 `~/.kimi-code/mcp.json` 或项目 `.kimi-code/mcp.json`。", pat ? "先设置 `UML_MCP_TOKEN`，再启动 kimi；新会话加载配置后检查工具调用。" : "启动 kimi，在会话中执行 `/mcp-config login uml-platform` 完成授权，再检查工具调用。"],
        ["Merge this configuration into `~/.kimi-code/mcp.json` or your project `.kimi-code/mcp.json`.", pat ? "Set `UML_MCP_TOKEN` before starting kimi, then test a tool call in a new session." : "Start kimi and run `/mcp-config login uml-platform` inside the session to authorize, then test a tool call."],
        { ...configuration(".kimi-code/mcp.json"), command: "kimi" });
    case "cursor":
      return guide(cliSources.cursor,
        ["合并项目 `.cursor/mcp.json` 或用户 `~/.cursor/mcp.json` 配置。", "运行以下命令检查服务与工具；需要 OAuth 时使用 `agent mcp login uml-platform`。"],
        ["Merge the configuration into `.cursor/mcp.json` or `~/.cursor/mcp.json`.", "Run these commands to inspect `servers` and tools. For OAuth, use `agent mcp login uml-platform`."],
        { ...configuration(".cursor/mcp.json"), command: "agent mcp list\nagent mcp list-tools uml-platform" });
    case "minimax":
      if (!pat) return null;
      return guide(cliSources.minimax,
        ["在 CLI 启动目录保存 `.mcp.json`，并将个人令牌保存到 `UML_MCP_TOKEN` 环境变量。", "启动 MiniMax Code CLI，在会话中输入 `/mcp` 检查服务，再发起工具调用。"],
        ["Save `.mcp.json` in the CLI launch directory and store your personal token in `UML_MCP_TOKEN`.", "Start MiniMax Code CLI and enter `/mcp` in the session to inspect the server, then call a tool."],
        configuration(".mcp.json"));
    case "deepseek":
      if (!pat) return null;
      return guide(cliSources.deepseek,
        ["将以下 MCP 插件补丁合并到正在使用的 Harness profile 的 `cordis.patch.yml`，保留已有补丁。", "替换 `Authorization` 中的个人令牌占位符，再启动使用该 profile 的 Harness 并调用工具。"],
        ["Merge this MCP plugin patch into `cordis.patch.yml` in your active Harness profile, preserving existing patches.", "Replace the personal-token placeholder in `Authorization`, start Harness with that profile, and call a tool."],
        configuration("cordis.patch.yml", "yaml"));
    case "trae":
      // CLI YAML and desktop JSON have different roots; never reuse the desktop payload here.
      return guide(cliSources.trae,
        ["运行 `traecli config edit`，在全局 `trae_cli.yaml` 中合并以下配置。", "启动 TraeCode CLI，在会话中输入 `/mcp` 检查服务；OAuth 模式选择 Authenticate 完成鉴权。"],
        ["Run `traecli config edit` and merge this configuration into the global `trae_cli.yaml`.", "Start TraeCode CLI and enter `/mcp` to inspect the server. In OAuth mode, select Authenticate to authorize."],
        {
          configuration: `mcp_servers:\n  - name: uml-platform\n    type: http\n    url: ${JSON.stringify(url)}${pat ? '\n    headers:\n      Authorization: "Bearer <YOUR_PERSONAL_TOKEN>"' : ""}`,
          configurationFilename: "trae_cli.yaml",
          configurationLanguage: "yaml",
          command: "traecli config edit",
        });
    default:
      return null;
  }
}
