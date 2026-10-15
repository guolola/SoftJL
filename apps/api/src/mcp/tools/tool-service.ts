// Implements four read-only tools with principal-bound pagination and optimistic source-version checks.
import { z } from "zod";
import { withImplementationArtifacts } from "../context/implementation-artifacts.js";
import {
  mcpListProjectsInputSchema,
  mcpContextInputSchema,
  mcpArtifactInputSchema,
  mcpUpdatesInputSchema,
  type McpScope,
} from "@uml-platform/contracts";
import type { McpConnection } from "../records/mcp-store.js";
import { hasAccountProjectScope } from "../records/mcp-store.js";
import {
  equalSecret,
  signValue,
  McpAccessError,
  type McpAccess,
} from "../auth/mcp-access.js";
import { contentHash } from "../context/source-artifacts.js";
import {
  agentInstructions,
  artifactDirectory,
  buildContext,
  compareManifest,
  normalizeScope,
  result,
} from "../context/implementation-context.js";

export function createMcpToolService(
  access: McpAccess,
  principal: McpConnection,
) {
  function page<T>(
    values: T[],
    binding: unknown,
    cursor: string | undefined,
    limit: number,
  ) {
    const bound = contentHash({
      principal: principal.id,
      user: principal.userId,
      binding,
    });
    let offset = 0;
    if (cursor) {
      const [payload, mac, extra] = cursor.split(".");
      if (
        extra ||
        !payload ||
        !mac ||
        !equalSecret(signValue(access.config.secret, "cursor", payload), mac)
      )
        throw new McpAccessError(400, "invalid_cursor");
      let parsed: { bound: string; offset: number };
      try {
        parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
      } catch {
        throw new McpAccessError(400, "invalid_cursor");
      }
      if (parsed.bound !== bound) return null;
      if (
        !Number.isSafeInteger(parsed.offset) ||
        parsed.offset < 0 ||
        parsed.offset > values.length
      )
        throw new McpAccessError(400, "invalid_cursor");
      offset = parsed.offset;
    }
    const items = values.slice(offset, offset + limit);
    const next = offset + items.length;
    const payload = Buffer.from(
      JSON.stringify({ bound, offset: next }),
    ).toString("base64url");
    return {
      items,
      total: values.length,
      remaining: values.length - next,
      nextCursor:
        next < values.length
          ? `${payload}.${signValue(access.config.secret, "cursor", payload)}`
          : null,
    };
  }
  async function read(projectId: string, scope: McpScope) {
    const project = await access.project(principal, projectId);
    const workspace = await access.authStore.getProjectWorkspace(projectId);
    const context = withImplementationArtifacts(buildContext(workspace?.state ?? {}, normalizeScope(scope)), projectId, access.config.origin);
    return {
      ...context,
      project: { id: project.id, name: project.name },
      workspaceSaved: Boolean(workspace && workspace.version > 0),
    };
  }
  return {
    async list_projects(input: z.infer<typeof mcpListProjectsInputSchema>) {
      const current = await access.refresh(principal);
      const projects = (
        await access.authStore.listProjectsForUser(current.userId)
      )
        .filter(
          (p) =>
            (hasAccountProjectScope(current) || current.projectIds.includes(p.id)) &&
            `${p.name} ${p.description ?? ""}`
              .toLowerCase()
              .includes(input.search.toLowerCase()),
        )
        .map((p) => ({ id: p.id, name: p.name, description: p.description }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const paged = page(
        projects,
        { search: input.search, projects },
        input.cursor,
        input.limit,
      );
      return paged
        ? result(
            "ok",
            "仅列出已授权且仍有读取权限的项目；同名项目须按标识选择。",
            { ...paged },
          )
        : result(
            "refresh_required",
            "项目或权限已变化，请从第一页重新读取。",
            {},
          );
    },
    async get_implementation_context(
      input: z.infer<typeof mcpContextInputSchema>,
    ) {
      const context = await read(input.projectId, input.scope);
      if (
        input.expectedContextVersion &&
        input.expectedContextVersion !== context.version
      )
        return result(
          "refresh_required",
          "相关依据已变化，请重新读取范围和版本。",
          { contextVersion: context.version },
        );
      if (context.unknownIds.length)
        return result(
          "selection_required",
          "部分标识不存在；请读取整项目目录选择稳定标识。",
          { unknownIds: context.unknownIds },
        );
      const paged = page(
        context.artifacts,
        {
          tool: "context",
          projectId: input.projectId,
          version: context.version,
        },
        input.cursor,
        input.limit,
      );
      if (!paged)
        return result(
          "refresh_required",
          "分页范围、授权或依据发生变化，请从第一页重新读取。",
          {},
        );
      return result(
        "ok",
        "请读完完整设计、验收条件与工程约束的目录分页和产物分段；按设计实现，缺少设计时先在平台补齐。",
        {
          project: context.project,
          scope: context.scope,
          contextVersion: context.version,
          workspaceSaved: context.workspaceSaved,
          implementation: context.implementation,
          artifacts: paged.items.map(artifactDirectory),
          manifest: paged.items.filter((a) => a.stage !== "implementation").map((a) => a.version),
          manifestComplete:
            paged.remaining === 0 && paged.items.length === paged.total,
          total: paged.total,
          remaining: paged.remaining,
          nextCursor: paged.nextCursor,
          issues: context.issues,
          instructions: agentInstructions,
          serverUrl: access.config.resource,
          versionPolicy:
            "manifest 为本页版本清单，需合并全部目录分页。同一轮请求使用 scope 与 contextVersion；内容哈希与上游指纹分别表示内容变化和过期状态。",
        },
      );
    },
    async get_artifact(input: z.infer<typeof mcpArtifactInputSchema>) {
      const context = await read(input.projectId, input.scope);
      if (context.version !== input.expectedContextVersion)
        return result(
          "refresh_required",
          "相关依据已修改或删除，不能混合不同轮次的内容。",
          { contextVersion: context.version },
        );
      const artifact = context.artifacts.find((a) => a.id === input.artifactId);
      if (!artifact || artifact.version.contentHash !== input.expectedVersion)
        return result(
          "refresh_required",
          "产物已变化、已删除或不在所选范围，请刷新目录。",
          {},
        );
      const content = JSON.stringify(artifact.payload);
      if (input.offset > content.length)
        throw new McpAccessError(400, "invalid_offset");
      const chunk = content.slice(input.offset, input.offset + input.length);
      const next = input.offset + chunk.length;
      return result(
        "ok",
        next < content.length
          ? "内容尚未读完；按 nextOffset 继续，拼接所有 chunk 后解析 JSON。"
          : "本产物读取完成；按平台已保存的设计与验收条件实现。",
        {
          artifactId: artifact.id,
          version: artifact.version,
          contextVersion: context.version,
          scope: context.scope,
          encoding: "json/utf-16-code-units",
          offset: input.offset,
          chunk,
          totalLength: content.length,
          remaining: content.length - next,
          nextOffset: next < content.length ? next : null,
        },
      );
    },
    async check_context_updates(input: z.infer<typeof mcpUpdatesInputSchema>) {
      const context = await read(input.projectId, input.scope);
      const changes = compareManifest(input.manifest.filter((item) => !item.artifactId.startsWith("implementation:")), context.manifest);
      const paged = page(
        changes,
        {
          tool: "updates",
          projectId: input.projectId,
          version: context.version,
          baseline: input.manifest,
        },
        input.cursor,
        input.limit,
      );
      if (!paged)
        return result(
          "refresh_required",
          "检查期间依据又发生变化，请重新检查。",
          {},
        );
      return result(
        "ok",
        changes.length
          ? "依据有变化；刷新上下文后调整受影响代码与测试，保留已有修改。"
          : "所提交版本清单对应的范围未变化。",
        {
          changes: paged.items,
          total: paged.total,
          remaining: paged.remaining,
          nextCursor: paged.nextCursor,
          scope: context.scope,
          contextVersion: context.version,
          unknownIds: context.unknownIds,
          issues: context.issues,
          requiresRefresh: changes.length > 0,
          implementation: context.implementation,
        },
      );
    },
  };
}
