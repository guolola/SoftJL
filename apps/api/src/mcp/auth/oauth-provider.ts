// Configures OAuth code+PKCE with durable storage and platform-account consent; does not delegate trust to clients.
import Provider, {
  errors,
  type Adapter,
  type Configuration,
  type ClientMetadata,
} from "oidc-provider";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import type { McpStore } from "../records/mcp-store.js";
import type { McpConfig } from "./mcp-config.js";

export function validateMcpClient(metadata: ClientMetadata) {
  if (!metadata.redirect_uris?.length)
    throw new errors.InvalidClientMetadata("redirect_uris required");
  for (const redirect of metadata.redirect_uris) {
    const url = new URL(redirect);
    const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
    if (
      url.hash ||
      url.username ||
      url.password ||
      !(url.protocol === "https:" || (url.protocol === "http:" && loopback))
    )
      throw new errors.InvalidClientMetadata(
        "Use HTTPS or loopback HTTP redirect URIs",
      );
  }
  if (
    metadata.grant_types?.some(
      (type) => !["authorization_code", "refresh_token"].includes(type),
    ) ||
    metadata.response_types?.some((type) => type !== "code")
  )
    throw new errors.InvalidClientMetadata(
      "Only authorization_code and refresh_token grants are supported",
    );
}
export function createOAuthProvider(
  config: McpConfig,
  store: McpStore,
  authStore: AuthStore,
) {
  const adapter = (model: string): Adapter => ({
    async upsert(id, payload, expiresIn) {
      await store.putEntity({
        model,
        id,
        payload,
        expiresAt:
          expiresIn === undefined ? null : Date.now() + expiresIn * 1000,
      });
    },
    find: (id) => store.findEntity(model, "id", id),
    findByUid: (uid) => store.findEntity(model, "uid", uid),
    findByUserCode: (code) => store.findEntity(model, "userCode", code),
    consume: (id) => store.consumeEntity(model, id),
    destroy: (id) => store.deleteEntity(model, id),
    revokeByGrantId: (id) => store.revokeGrant(id),
  });
  for (const client of config.clients) validateMcpClient(client);
  const configuration: Configuration = {
    adapter,
    clients: config.clients,
    jwks: config.jwks,
    cookies: {
      keys: [config.secret],
      names: {
        session: "uml_mcp_session",
        interaction: "uml_mcp_interaction",
        resume: "uml_mcp_resume",
      },
      long: { sameSite: "lax" },
      short: { sameSite: "lax", path: "/api/mcp" },
    },
    scopes: ["openid", "offline_access", "mcp:read"],
    responseTypes: ["code"],
    clientDefaults: {
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false },
      userinfo: { enabled: false },
      revocation: { enabled: true },
      registration: { enabled: true },
      clientIdMetadataDocument: {
        // Advertise CIMD only when trusted metadata origins exist; otherwise clients auto-select DCR.
        enabled: config.cimdOrigins.length > 0,
        ack: "draft-02",
        // Explicit origins avoid arbitrary server-side fetching of private addresses and metadata.
        allowFetch: (_ctx, id) =>
          config.cimdOrigins.includes(new URL(id).origin),
        allowClient: (_ctx, client) =>
          config.cimdOrigins.includes(new URL(client.clientId).origin),
      },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => config.resource,
        useGrantedResource: () => true,
        getResourceServerInfo: (_ctx, resource) => {
          if (resource !== config.resource) throw new errors.InvalidTarget();
          return {
            scope: "mcp:read",
            audience: config.resource,
            accessTokenTTL: 600,
            accessTokenFormat: "opaque",
          };
        },
      },
    },
    extraClientMetadata: {
      properties: ["uml_platform_policy"],
      validator: (_ctx, _key, _value, metadata) => validateMcpClient(metadata),
    },
    interactions: {
      url: (_ctx, interaction) =>
        `${config.webOrigin}/account/connections?interaction=${encodeURIComponent(interaction.uid)}`,
    },
    async findAccount(_ctx, id) {
      const user = await authStore.getUser(id);
      if (!user || user.status !== "active") return undefined;
      return { accountId: id, claims: async () => ({ sub: id }) };
    },
    async loadExistingGrant(ctx) {
      // Resume only the explicitly confirmed grant; a new authorization requires account consent again.
      const id = ctx.oidc.result?.consent?.grantId;
      if (!id) return undefined;
      const connection = await store.getConnection(id);
      if (
        !connection ||
        connection.revokedAt ||
        Date.parse(connection.expiresAt) <= Date.now()
      )
        return undefined;
      return provider.Grant.find(id);
    },
    issueRefreshToken: (_ctx, client) =>
      client.grantTypeAllowed("refresh_token"),
    rotateRefreshToken: true,
    ttl: {
      AccessToken: 600,
      AuthorizationCode: 60,
      RefreshToken: 30 * 86400,
      Grant: 30 * 86400,
      Interaction: 600,
      Session: 86400,
    },
    renderError: (ctx, output) => {
      ctx.type = "application/json";
      ctx.body = output;
    },
  };
  const provider = new Provider(config.issuer, configuration);
  provider.proxy = true;
  provider.use(async (ctx, next) => {
    const startedAt = Date.now();
    try {
      await next();
    } finally {
      const accountId = ctx.oidc?.account?.accountId ?? null;
      await authStore.recordAuditLog({
        actorUserId: accountId,
        action: "mcp.oauth",
        targetType: "oauth_endpoint",
        targetId: ctx.path,
        outcome: ctx.status < 400 ? "success" : "failure",
        message: JSON.stringify({
          clientId: ctx.oidc?.client?.clientId ?? null,
          durationMs: Date.now() - startedAt,
          status: ctx.status,
        }),
      });
    }
  });
  return provider;
}
