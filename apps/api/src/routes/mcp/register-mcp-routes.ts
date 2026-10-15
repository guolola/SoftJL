// Adapts Fastify HTTP requests to SDK/OAuth handlers; identity and project policy stay in the MCP module.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { Provider } from "oidc-provider";
import { z } from "zod";
import {
  mcpTokenCreateSchema,
  mcpConsentSchema,
} from "@uml-platform/contracts";
import { requireAuth, isAuthError } from "../../auth/guards.js";
import {
  McpAccessError,
  equalSecret,
  signValue,
  tokenHash,
  type McpAccess,
} from "../../mcp/auth/mcp-access.js";
import { createConnectionService } from "../../mcp/auth/connection-service.js";
import { createPlatformMcpServer } from "../../mcp/server/mcp-server.js";
import { registerMcpAssets } from "./register-mcp-assets.js";

declare module "fastify" {
  interface FastifyContextConfig {
    mcpProtocol?: boolean;
  }
}
const config = { mcpProtocol: true };
const interactionParams = z.object({ uid: z.string().min(1).max(256) });
export async function registerMcpRoutes(
  app: FastifyInstance,
  access: McpAccess,
  provider: Provider,
) {
  const management = createConnectionService(access, provider);
  const oauth = provider.callback();
  const oauthPrefix = "/api/mcp/oauth";
  await app.register(async (router) => {
    router.setErrorHandler((error, request, reply) => {
      const transportStatus = (error as { statusCode?: number }).statusCode;
      const status =
        error instanceof McpAccessError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : transportStatus && transportStatus >= 400 && transportStatus < 500
              ? transportStatus
              : 500;
      if (
        request.url.split("?")[0] === "/api/mcp" &&
        status === 400 &&
        !(error instanceof McpAccessError)
      ) {
        return reply
          .code(400)
          .send({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          });
      }
      reply.code(status).send({
        error:
          error instanceof McpAccessError
            ? error.code
            : status === 400
              ? "invalid_request"
              : "server_error",
      });
    });
    router.addHook("onRequest", async (request, reply) => {
      reply
        .header("Cache-Control", "no-store")
        .header("Referrer-Policy", "no-referrer");
      const origin = request.headers.origin;
      if (
        origin &&
        ![access.config.origin, access.config.webOrigin].includes(origin)
      )
        throw new McpAccessError(403, "invalid_origin");
      // Hosts and origins are configured, never derived from forwarded request headers for metadata.
      const localSocket = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        request.raw.socket.remoteAddress ?? "",
      );
      const host = request.headers.host ?? "";
      const localProxyHost = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(
        host,
      );
      const forwardedHost = request.headers["x-forwarded-host"];
      // Next's local rewrite changes Host to the loopback upstream; only a local socket may supply its original host.
      const publicHost =
        localSocket && localProxyHost && typeof forwardedHost === "string"
          ? forwardedHost
          : host;
      const path = request.url.split("?")[0];
      const managementRequest =
        /^\/api\/mcp\/(connections|interactions)(\/|$)/.test(path);
      const allowedHosts = [new URL(access.config.origin).host];
      // Browser management may use the configured Web origin's local reverse proxy.
      if (managementRequest)
        allowedHosts.push(new URL(access.config.webOrigin).host);
      if (!allowedHosts.includes(publicHost))
        throw new McpAccessError(403, "invalid_host");
      if (
        !(await access.store.takeRateLimit(
          `http:${tokenHash(request.ip)}`,
          300,
          60,
        ))
      )
        throw new McpAccessError(429, "rate_limited");
      const discovery =
        /^\/\.well-known\/(oauth-authorization-server|openid-configuration)\/api\/mcp\/oauth$/.exec(
          path,
        );
      if (path.startsWith(`${oauthPrefix}/`) || discovery) {
        if (
          path === `${oauthPrefix}/reg` &&
          !(await access.store.takeRateLimit(
            `register:${tokenHash(request.ip)}`,
            20,
            3600,
          ))
        )
          throw new McpAccessError(429, "rate_limited");
        // oidc-provider must receive the untouched request stream for form-encoded token exchanges.
        const raw = request.raw as typeof request.raw & {
          originalUrl?: string;
          baseUrl?: string;
        };
        raw.originalUrl = request.url;
        raw.baseUrl = oauthPrefix;
        raw.url = discovery
          ? `/.well-known/${discovery[1]}`
          : request.url.slice(oauthPrefix.length);
        reply.hijack();
        await oauth(raw, reply.raw);
        return reply;
      }
    });
    registerMcpAssets(router);
    router.all(`${oauthPrefix}/*`, { config }, async () => undefined);
    for (const name of ["oauth-authorization-server", "openid-configuration"])
      router.get(
        `/.well-known/${name}/api/mcp/oauth`,
        { config },
        async () => undefined,
      );
    for (const path of [
      "/.well-known/oauth-protected-resource/api/mcp",
      "/.well-known/oauth-protected-resource",
    ])
      router.get(path, { config }, async () => ({
        resource: access.config.resource,
        authorization_servers: [access.config.issuer],
        scopes_supported: ["mcp:read"],
        bearer_methods_supported: ["header"],
        resource_name: "UML Platform",
      }));
    router.all(
      "/api/mcp",
      { config, bodyLimit: 2 * 1024 * 1024 },
      async (request, reply) => {
        try {
          const principal = await access.authenticate(
            request.headers.authorization,
          );
          const node = toNodeHandler(
            createMcpHandler(() => createPlatformMcpServer(access, principal), {
              legacy: "stateless",
            }),
          );
          reply.hijack();
          await node(request.raw, reply.raw, request.body);
          return reply;
        } catch (error) {
          if (error instanceof McpAccessError && error.status === 401)
            reply.header(
              "WWW-Authenticate",
              `Bearer resource_metadata="${access.config.origin}/.well-known/oauth-protected-resource/api/mcp", error="invalid_token"`,
            );
          throw error;
        }
      },
    );
    async function browser(
      request: FastifyRequest,
      reply: Parameters<typeof requireAuth>[1],
      write = false,
    ) {
      const auth = await requireAuth(request, reply, access.authStore);
      if (isAuthError(auth))
        throw new McpAccessError(reply.statusCode, "login_required");
      if (
        write &&
        !equalSecret(
          String(request.headers["x-mcp-csrf"] ?? ""),
          signValue(access.config.secret, "csrf", auth.session.id),
        )
      )
        throw new McpAccessError(403, "invalid_csrf");
      await access.eligibleUser(auth.user.id);
      return auth;
    }
    router.get("/api/mcp/connections", { config }, async (req, reply) => {
      const auth = await browser(req, reply);
      return management.list(auth.user.id, auth.session.id);
    });
    router.post(
      "/api/mcp/connections/tokens",
      { config },
      async (req, reply) => {
        const auth = await browser(req, reply, true);
        const parsed = mcpTokenCreateSchema.safeParse(req.body);
        if (!parsed.success) throw new McpAccessError(400, "invalid_request");
        const input = parsed.data;
        if (
          !(await access.store.takeRateLimit(
            `create:${auth.user.id}`,
            20,
            3600,
          ))
        )
          throw new McpAccessError(429, "rate_limited");
        const output = await access.createToken(
          auth.user.id,
          input.name,
          { projectScope: input.projectScope, projectIds: input.projectIds },
          input.expiresInDays,
        );
        await access.authStore.recordAuditLog({
          actorUserId: auth.user.id,
          action: "mcp.create_pat",
          targetType: "mcp_connection",
          targetId: output.connection.id,
          outcome: "success",
        });
        return reply.code(201).send(output);
      },
    );
    router.delete(
      "/api/mcp/connections/:id",
      { config },
      async (req, reply) => {
        const auth = await browser(req, reply, true);
        const { id } = z
          .object({ id: z.string().min(1).max(256) })
          .parse(req.params);
        return management.revoke(auth.user.id, id);
      },
    );
    router.get("/api/mcp/interactions/:uid", { config }, async (req, reply) => {
      await browser(req, reply);
      return management.details(
        req.raw,
        reply.raw,
        interactionParams.parse(req.params).uid,
      );
    });
    router.post(
      "/api/mcp/interactions/:uid",
      { config },
      async (req, reply) => {
        const auth = await browser(req, reply, true);
        const parsed = mcpConsentSchema.safeParse(req.body);
        if (!parsed.success) throw new McpAccessError(400, "invalid_request");
        const input = parsed.data;
        if (
          !equalSecret(
            input.csrf,
            signValue(access.config.secret, "csrf", auth.session.id),
          )
        )
          throw new McpAccessError(403, "invalid_csrf");
        return management.consent(
          req.raw,
          reply.raw,
          interactionParams.parse(req.params).uid,
          auth.user.id,
          { projectScope: input.projectScope, projectIds: input.projectIds },
        );
      },
    );
    router.post(
      "/api/mcp/interactions/:uid/deny",
      { config },
      async (req, reply) => {
        await browser(req, reply, true);
        return management.deny(
          req.raw,
          reply.raw,
          interactionParams.parse(req.params).uid,
        );
      },
    );
  });
}
