// Applies the same live user/grant/project checks to OAuth and personal tokens on every tool call.
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mcpProjectAccessSchema, type McpProjectAccess } from "@uml-platform/contracts";
import type { Provider } from "oidc-provider";
import {
  hasProjectPermission,
  type AuthStore,
} from "../../auth/in-memory-auth-store.js";
import type { McpStore, McpConnection } from "../records/mcp-store.js";
import { hasAccountProjectScope } from "../records/mcp-store.js";
import type { McpConfig } from "./mcp-config.js";
export class McpAccessError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function signValue(secret: string, purpose: string, value: string) {
  return createHmac("sha256", secret)
    .update(`${purpose}\0${value}`)
    .digest("base64url");
}
export function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createMcpAccess(
  authStore: AuthStore,
  store: McpStore,
  config: McpConfig,
  provider: Provider,
  guestUserId?: string | null,
) {
  async function eligibleUser(userId: string) {
    const user = await authStore.getUser(userId);
    if (!user || user.status !== "active") throw new McpAccessError(401, "invalid_token");
    if (userId === guestUserId) throw new McpAccessError(403, "guest_not_allowed");
    return user;
  }
  async function active(connection: McpConnection | undefined) {
    if (
      !connection ||
      connection.revokedAt ||
      Date.parse(connection.expiresAt) <= Date.now()
    )
      throw new McpAccessError(401, "invalid_token");
    await eligibleUser(connection.userId);
    return connection;
  }
  async function projectForUser(userId: string, projectId: string) {
    const project = await authStore.getProject(projectId);
    const member = await authStore.findProjectMember(projectId, userId);
    if (
      !project ||
      project.status === "deleted" ||
      !member ||
      !hasProjectPermission(member.role, "view_project")
    )
      throw new McpAccessError(403, "access_denied");
    return project;
  }
  return {
    store,
    eligibleUser,
    authStore,
    config,
    async authenticate(header: string | undefined) {
      const match = /^Bearer ([^\s]+)$/i.exec(header ?? "");
      if (!match || match[1].length > 8192)
        throw new McpAccessError(401, "invalid_token");
      const token = match[1];
      if (token.startsWith("uml_mcp_"))
        return active(await store.findToken(tokenHash(token)));
      const credential = await provider.AccessToken.find(token);
      if (
        !credential ||
        credential.isExpired ||
        credential.aud !== config.resource ||
        !credential.scope?.split(" ").includes("mcp:read") ||
        !credential.grantId
      )
        throw new McpAccessError(401, "invalid_token");
      const connection = await active(
        await store.getConnection(credential.grantId),
      );
      if (
        connection.kind !== "oauth" ||
        connection.userId !== credential.accountId ||
        connection.clientId !== credential.clientId
      )
        throw new McpAccessError(401, "invalid_token");
      return connection;
    },
    async refresh(connection: McpConnection) {
      return active(await store.getConnection(connection.id));
    },
    async project(connection: McpConnection, projectId: string) {
      const current = await active(await store.getConnection(connection.id));
      if (!hasAccountProjectScope(current) && !current.projectIds.includes(projectId))
        throw new McpAccessError(403, "access_denied");
      return projectForUser(current.userId, projectId);
    },
    async validateProjects(userId: string, projectIds: string[]) {
      if (!projectIds.length)
        throw new McpAccessError(400, "projects_required");
      for (const id of new Set(projectIds)) await projectForUser(userId, id);
    },
    async createToken(
      userId: string,
      name: string,
      selection: McpProjectAccess,
      days: number,
    ) {
      await eligibleUser(userId);
      const { projectScope, projectIds } = mcpProjectAccessSchema.parse(selection);
      if (projectScope === "selected") await this.validateProjects(userId, projectIds);
      const token = `uml_mcp_${randomBytes(32).toString("base64url")}`;
      const connection: McpConnection = {
        id: randomUUID(),
        userId,
        clientId: "personal-token",
        name,
        kind: "pat",
        // Account-wide tokens resolve current membership on every read, including new projects.
        projectScope,
        projectIds: [...new Set(projectIds)],
        tokenHash: tokenHash(token),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
        revokedAt: null,
        lastUsedAt: null,
      };
      await store.putConnection(connection);
      return { token, connection: { ...connection, tokenHash: undefined, projectScope: hasAccountProjectScope(connection) ? "account" : "selected" } };
    },
  };
}
export type McpAccess = ReturnType<typeof createMcpAccess>;
