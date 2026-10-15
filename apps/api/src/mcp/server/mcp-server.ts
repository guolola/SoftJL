// Registers SDK v2 tools using JSON Schema adapters, retaining the repository's existing Zod version.
import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import {
  mcpListProjectsInputSchema,
  mcpContextInputSchema,
  mcpArtifactInputSchema,
  mcpUpdatesInputSchema,
  mcpToolResultSchema,
} from "@uml-platform/contracts";
import {
  agentInstructions,
  result,
} from "../context/implementation-context.js";
import { McpAccessError, type McpAccess } from "../auth/mcp-access.js";
import type { McpConnection } from "../records/mcp-store.js";
import { createMcpToolService } from "../tools/tool-service.js";
import { platformMcpIcons } from "./mcp-branding.js";

export function createPlatformMcpServer(
  access: McpAccess,
  principal: McpConnection,
) {
  const server = new McpServer(
    { name: "uml-platform", version: "1.0.0", icons: platformMcpIcons },
    { instructions: agentInstructions },
  );
  const service = createMcpToolService(access, principal);
  function register<T extends z.ZodTypeAny>(
    name: keyof typeof service,
    schema: T,
    description: string,
    run: (input: z.infer<T>) => ReturnType<typeof service.list_projects>,
  ) {
    server.registerTool(
      name,
      {
        description,
        inputSchema: fromJsonSchema<z.infer<T>>(
          zodToJsonSchema(schema, { $refStrategy: "none" }) as Parameters<
            typeof fromJsonSchema
          >[0],
        ),
        outputSchema: fromJsonSchema(
          zodToJsonSchema(mcpToolResultSchema, {
            $refStrategy: "none",
          }) as Parameters<typeof fromJsonSchema>[0],
        ),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (raw) => {
        const startedAt = Date.now();
        let projectId: string | null = null;
        let outcome: "success" | "failure" = "failure";
        try {
          const input = schema.parse(raw);
          projectId = "projectId" in input ? input.projectId : null;
          await access.refresh(principal);
          if (
            !(await access.store.takeRateLimit(
              `tool:${principal.userId}`,
              120,
              60,
            ))
          )
            throw new McpAccessError(429, "rate_limited");
          const output = await run(input);
          // Validate again before returning private data if membership/grant changed during the read.
          if (projectId) await access.project(principal, projectId);
          else await access.refresh(principal);
          await access.store.touchConnection(principal.id);
          outcome = "success";
          return {
            content: [{ type: "text" as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } catch (error) {
          const code =
            error instanceof McpAccessError
              ? error.code
              : error instanceof z.ZodError
                ? "invalid_arguments"
                : "read_failed";
          const output = result(
            "error",
            "无法读取，请检查参数、连接授权和当前项目权限。",
            { code },
          );
          return {
            isError: true,
            content: [{ type: "text" as const, text: JSON.stringify(output) }],
            structuredContent: output,
          };
        } finally {
          await access.authStore.recordAuditLog({
            actorUserId: principal.userId,
            action: `mcp.${name}`,
            targetType: "project",
            targetId: projectId,
            outcome,
            message: JSON.stringify({
              clientId: principal.clientId,
              connectionId: principal.id,
              durationMs: Date.now() - startedAt,
            }),
          });
        }
      },
    );
  }
  register(
    "list_projects",
    mcpListProjectsInputSchema,
    "搜索账号可访问的项目并分页读取。使用返回的稳定 id，不按名称猜选；无结果时请学生确认项目存在及账号查看权限。",
    service.list_projects,
  );
  register(
    "get_implementation_context",
    mcpContextInputSchema,
    "取得完整设计模型、验收条件、工程约束、测试与实施产物目录；不输出需求模型或原始需求正文。以设计为直接编码依据，设计缺口须反馈。按范围读取所有分页，合并来源 manifest；开始前读取 implementation:bundle 的任务、验收和全部关联来源；交付验证前获取 implementation:report 契约及 implementation:validator 下载元数据。依赖资料不扩展实施范围。",
    service.get_implementation_context,
  );
  register(
    "get_artifact",
    mcpArtifactInputSchema,
    "按 contextVersion 和产物 contentHash 读取完整 JSON 内容分段，包括实施快照、按需报告契约及验证器下载元数据；验证器源码用本地程序从 downloadUrl 下载并校验 SHA-256，无需经模型解码。chunk 按 offset 拼接后解析；refresh_required 时重新取得上下文。",
    service.get_artifact,
  );
  register(
    "check_context_updates",
    mcpUpdatesInputSchema,
    "用 .uml-platform.json 中已应用的范围与完整 manifest 检查新增、修改、删除和过期变化；读完所有分页。不要在任务失败时推进已应用版本。",
    service.check_context_updates,
  );
  return server;
}
