// Keeps product-specific remote HTTP configuration separate from unverified client acceptance claims.
export const mcpClients = [
  {
    id: "deepseek",
    name: "DeepSeek Harness",
    mode: "pat",
    location: "桌面 profile 的 ~/.dsh/profiles/desktop/cordis.patch.yml",
    source:
      "https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md",
  },
  {
    id: "qoder",
    name: "Qoder",
    mode: "oauth",
    location: "Extensions → Connectors → Add Connector → Add custom MCP",
    source: "https://docs.qoder.com/qoder/connectors",
  },
  {
    id: "kimi",
    name: "Kimi Code",
    mode: "pat",
    location: "桌面端 ~/.kimi-code/mcp.json 或项目 .kimi-code/mcp.json",
    source:
      "https://www.kimi.com/code/docs/en/kimi-code-desktop/settings-and-extensions.html",
  },
  {
    id: "minimax",
    name: "MiniMax Code",
    mode: "pat",
    location: "插件管理 → MCP Servers；~/.minimax/mcp.json",
    source:
      "https://agent.minimax.io/docs/code/agents/mcp",
  },
  {
    id: "workbuddy",
    name: "WorkBuddy",
    mode: "oauth",
    location: "插件 → MCP 服务器 → 配置 MCP；~/.workbuddy/mcp.json",
    source:
      "https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide",
  },
  {
    id: "trae",
    name: "TRAE",
    mode: "oauth",
    location: "TRAE IDE 设置 → MCP → 添加 → 手动添加",
    source: "https://docs.trae.cn/ide_add-mcp-servers",
  },
  {
    id: "qwen",
    name: "Qwen Code",
    mode: "oauth",
    location: "桌面端 ~/.qwen/settings.json 或项目 .qwen/settings.json",
    source:
      "https://github.com/QwenLM/qwen-code/blob/main/packages/desktop/README.md",
  },
  {
    id: "cursor",
    name: "Cursor",
    mode: "oauth",
    location: "Cursor 桌面端 .cursor/mcp.json 或 ~/.cursor/mcp.json",
    source: "https://cursor.com/docs/mcp",
  },
  {
    id: "vscode",
    name: "VS Code",
    mode: "oauth",
    location: "VS Code 命令面板 → MCP: Add Server",
    source:
      "https://code.visualstudio.com/docs/agent-customization/mcp-servers",
  },
  {
    id: "codex",
    name: "Codex",
    mode: "oauth",
    location: "Codex 桌面应用设置中的 MCP 服务管理",
    source: "https://learn.chatgpt.com/docs/developer-settings",
  },
  {
    id: "claude",
    name: "Claude",
    mode: "oauth",
    location: "Customize → Connectors → Add custom connector",
    source: "https://claude.com/docs/connectors/custom/add-unlisted",
  },
  {
    id: "minimax-cloud",
    name: "MiniMax Agent",
    mode: "manual",
    location: "MiniMax Agent 网页端；自定义 MCP 接入方式尚待官方确认",
    source: "https://agent.minimax.io/",
  },
] as const;
export type McpClientId = (typeof mcpClients)[number]["id"];

// Only offer authentication modes documented for the selected product's default surface.
export function clientAuthModes(id: McpClientId): readonly ("oauth" | "pat")[] {
  if (id === "deepseek" || id === "minimax") return ["pat"];
  if (id === "kimi") return ["pat", "oauth"];
  if (id === "qoder" || id === "workbuddy") return ["oauth"];
  if (id === "minimax-cloud") return [];
  return ["oauth", "pat"];
}

export function clientConfiguration(
  id: McpClientId,
  url: string,
  mode: "oauth" | "pat",
) {
  const bearer = "Bearer <YOUR_PERSONAL_TOKEN>";
  if (id === "deepseek")
    return `- insert:\n    - id: uml-platform\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: uml-platform\n        transport: streamable-http\n        url: ${JSON.stringify(url)}\n        headers:\n          Authorization: ${JSON.stringify(bearer)}`;
  // MiniMax Agent has no verified custom remote MCP configuration to copy.
  if (id === "minimax-cloud") return "";
  if (id === "codex")
    return `[mcp_servers.uml_platform]\nurl = ${JSON.stringify(url)}${mode === "pat" ? '\nbearer_token_env_var = "UML_MCP_TOKEN"' : ""}`;
  const entry: Record<string, unknown> =
    id === "qwen"
      ? { httpUrl: url }
      : {
          ...(id === "cursor" || id === "kimi" || id === "trae"
            ? {}
            : { type: "http" }),
          url,
        };
  if (mode === "pat") {
    if (id === "kimi") entry.bearerTokenEnvVar = "UML_MCP_TOKEN";
    else
      entry.headers = {
        Authorization: id === "minimax" ? "Bearer ${UML_MCP_TOKEN}" : bearer,
      };
  }
  if (mode === "oauth" && id === "qoder")
    entry.oauth = { enabled: true, scopes: ["mcp:read"] };
  return JSON.stringify(
    { [id === "vscode" ? "servers" : "mcpServers"]: { "uml-platform": entry } },
    null,
    2,
  );
}
export const projectAgentPrompt = (projectId: string, language = "zh-CN") =>
  language.startsWith("en") ?
  `Read saved complete designs, independent acceptance criteria, engineering constraints and tests for project ${projectId} through the UML platform MCP. Inspect the repository first. Read every catalog page and required artifact chunk, including implementation:bundle before implementation, and implementation:report and implementation:validator before verification. Use the supplied snapshot, report template and schema to maintain .uml-implementation-context.json and .uml-implementation.json locally: map requirement IDs and design elements to planned targets, actual files/symbols, file hashes, configuration/dependency inputRefs and acceptance tests. Use complete designs as the direct basis for code and follow engineering constraints. The platform owns requirement-to-design correctness; report missing or conflicting designs for correction instead of deriving designs from requirements. Preserve existing code. Download the verifier using its metadata, verify its file SHA-256, and save it as uml-verify.mjs; inspect the repository check commands and run it with --run-checks, reporting actual results and unresolved criteria. A mapping or an unexecuted check is not verification. Keep reports local. Maintain .uml-platform.json with only the server URL, project ID, scope and applied source versions; advance a source only when all associated tasks pass. Never save credentials there. Check source updates before further edits and delivery, and revalidate affected code and tests.` :
  `请通过 UML 平台 MCP 读取项目 ${projectId} 的已保存完整设计、独立验收条件、工程约束和测试。先检查当前仓库，读完目录分页和相关产物分段，开始实现前读取 implementation:bundle，交付验证前读取 implementation:report 与 implementation:validator。按提供的快照、报告模板和契约，在本地维护 .uml-implementation-context.json 和 .uml-implementation.json，逐项记录需求 ID 和设计元素对应的计划位置、实际代码文件及符号、文件哈希、配置/依赖 inputRefs 和验收测试。以完整设计为代码直接依据，遵守工程约束。需求到设计的正确性由平台负责；设计缺失或冲突时反馈平台补齐，不从需求重新推导设计。保留已有代码。按元数据下载验证器并核对文件 SHA-256 后保存为 uml-verify.mjs，检查仓库验证命令后使用 --run-checks 执行，报告真实结果和未覆盖条件；只有映射或未运行检查不能算验证通过。报告只保留本地。维护 .uml-platform.json，仅记录服务地址、项目、范围和已应用来源版本；同一来源所有相关任务通过后才推进，不保存凭据。后续修改及交付前检查来源变化，定位受影响代码和测试并复验。`;
