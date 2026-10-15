// Loads explicit public URLs and shared secrets; production cannot silently use ephemeral authorization keys.
import { generateKeyPairSync, randomBytes } from "node:crypto";
import type { ClientMetadata, JWKS } from "oidc-provider";
export type McpConfig = {
  enabled: boolean;
  origin: string;
  webOrigin: string;
  resource: string;
  issuer: string;
  secret: string;
  jwks: JWKS;
  clients: ClientMetadata[];
  cimdOrigins: string[];
};
export function loadMcpConfig(
  env = process.env,
  production = env.NODE_ENV === "production",
): McpConfig | null {
  if (env.MCP_ENABLED !== "true") return null;
  if (
    production &&
    (!env.MCP_PUBLIC_ORIGIN || !env.MCP_SHARED_SECRET || !env.MCP_JWKS)
  )
    throw new Error(
      "MCP requires MCP_PUBLIC_ORIGIN, MCP_SHARED_SECRET and MCP_JWKS in production",
    );
  const origin = new URL(env.MCP_PUBLIC_ORIGIN ?? "http://localhost:4001")
    .origin;
  const webOrigin = new URL(
    env.MCP_WEB_ORIGIN ?? env.MCP_PUBLIC_ORIGIN ?? "http://localhost:3000",
  ).origin;
  if (
    production &&
    ![origin, webOrigin].every((url) => url.startsWith("https://"))
  )
    throw new Error("MCP public origins must use HTTPS in production");
  const secret = env.MCP_SHARED_SECRET ?? randomBytes(48).toString("base64url");
  if (secret.length < 32)
    throw new Error("MCP_SHARED_SECRET must contain at least 32 characters");
  const jwks = env.MCP_JWKS
    ? (JSON.parse(env.MCP_JWKS) as JWKS)
    : ({
        keys: [
          {
            ...generateKeyPairSync("rsa", {
              modulusLength: 2048,
            }).privateKey.export({ format: "jwk" }),
            use: "sig",
            alg: "RS256",
            kid: "development",
          },
        ],
      } as JWKS);
  return {
    enabled: true,
    origin,
    webOrigin,
    resource: `${origin}/api/mcp`,
    issuer: `${origin}/api/mcp/oauth`,
    secret,
    jwks,
    clients: JSON.parse(env.MCP_OAUTH_CLIENTS ?? "[]") as ClientMetadata[],
    cimdOrigins: (env.MCP_CIMD_ORIGINS ?? "")
      .split(",")
      .filter(Boolean)
      .map((value) => new URL(value.trim()).origin),
  };
}
