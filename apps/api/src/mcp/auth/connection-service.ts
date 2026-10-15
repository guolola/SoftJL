// Manages explicit project consent after platform login; each authorization creates a new, non-replayable grant.
import { mcpProjectAccessSchema, type McpProjectAccess } from "@uml-platform/contracts";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Provider } from "oidc-provider";
import type { McpAccess } from "./mcp-access.js";
import { McpAccessError, signValue } from "./mcp-access.js";
import { hasAccountProjectScope } from "../records/mcp-store.js";
export function createConnectionService(access: McpAccess, provider: Provider) {
  async function interaction(
    req: IncomingMessage,
    res: ServerResponse,
    uid: string,
  ) {
    const details = await provider.interactionDetails(req, res);
    if (details.uid !== uid || details.result)
      throw new McpAccessError(400, "invalid_interaction");
    return details;
  }
  return {
    async list(userId: string, sessionId: string) {
      const connections = (await access.store.listConnections(userId)).map(
        ({ tokenHash: _hash, ...connection }) => ({ ...connection, projectScope: hasAccountProjectScope(connection) ? "account" : "selected" }),
      );
      const projects = (await access.authStore.listProjectsForUser(userId)).map(
        (p) => ({ id: p.id, name: p.name }),
      );
      return {
        enabled: true,
        serverUrl: access.config.resource,
        connections,
        projects,
        csrf: signValue(access.config.secret, "csrf", sessionId),
        supportStatus: "pending-client-validation",
      };
    },
    async details(req: IncomingMessage, res: ServerResponse, uid: string) {
      const details = await interaction(req, res, uid);
      const client = await provider.Client.find(
        String(details.params.client_id),
      );
      return {
        uid,
        clientId: client?.clientId,
        clientName: client?.clientName ?? String(details.params.client_id),
        scope: "mcp:read",
        expiresInDays: 30,
      };
    },
    async consent(
      req: IncomingMessage,
      res: ServerResponse,
      uid: string,
      userId: string,
      selection: McpProjectAccess,
    ) {
      const details = await interaction(req, res, uid);
      await access.eligibleUser(userId);
      const { projectScope, projectIds } = mcpProjectAccessSchema.parse(selection);
      if (projectScope === "selected") await access.validateProjects(userId, projectIds);
      // Adapter-level consume makes concurrent submissions fail closed, including on different API instances.
      await access.store.consumeEntity("Interaction", uid);
      const clientId = String(details.params.client_id);
      const grant = new provider.Grant({ accountId: userId, clientId });
      const requested = String(details.params.scope ?? "").split(" ");
      const oidcScopes = requested.filter((scope) =>
        ["openid", "offline_access", "mcp:read"].includes(scope),
      );
      if (oidcScopes.length) grant.addOIDCScope(oidcScopes.join(" "));
      grant.addResourceScope(access.config.resource, "mcp:read");
      const id = await grant.save();
      const client = await provider.Client.find(clientId);
      await access.store.putConnection({
        id,
        userId,
        clientId,
        name: client?.clientName ?? clientId,
        kind: "oauth",
        // Persist the exact grant; current membership is still checked on each read.
        projectScope,
        projectIds: [...new Set(projectIds)],
        tokenHash: null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        revokedAt: null,
        lastUsedAt: null,
      });
      const redirect = await provider.interactionResult(
        req,
        res,
        { login: { accountId: userId }, consent: { grantId: id } },
        { mergeWithLastSubmission: false },
      );
      await access.authStore.recordAuditLog({
        actorUserId: userId,
        action: "mcp.authorize",
        targetType: "mcp_connection",
        targetId: id,
        outcome: "success",
        message: JSON.stringify({ clientId, projectScope, projectIds }),
      });
      return { redirect };
    },
    async deny(req: IncomingMessage, res: ServerResponse, uid: string) {
      await interaction(req, res, uid);
      return {
        redirect: await provider.interactionResult(
          req,
          res,
          {
            error: "access_denied",
            error_description: "The user declined this connection",
          },
          { mergeWithLastSubmission: false },
        ),
      };
    },
    async revoke(userId: string, id: string) {
      const connection = await access.store.getConnection(id);
      if (!connection || connection.userId !== userId)
        throw new McpAccessError(404, "not_found");
      await access.store.revokeGrant(id);
      await access.authStore.recordAuditLog({
        actorUserId: userId,
        action: "mcp.revoke",
        targetType: "mcp_connection",
        targetId: id,
        outcome: "success",
      });
      return { revoked: true };
    },
  };
}
