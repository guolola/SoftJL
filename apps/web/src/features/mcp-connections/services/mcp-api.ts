// Calls cookie-authenticated connection management; personal tokens are returned once and never persisted here.
import type { McpProjectAccess } from "@uml-platform/contracts";
import { buildApiUrl } from "../../../services/api-client/index";
export type Connection = {
  id: string;
  name: string;
  kind: "oauth" | "pat";
  projectIds: string[];
  projectScope?: "account" | "selected";
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};
export type ConnectionInfo = {
  enabled: boolean;
  serverUrl?: string;
  csrf?: string;
  projects?: { id: string; name: string }[];
  connections?: Connection[];
};
export class McpApiError extends Error {
  constructor(public status: number, public code?: string) {
    super(
      status === 401
        ? "请先登录平台账号。"
        : status === 403
          ? "授权或项目权限已变化，请刷新后重试。"
          : "连接操作未完成，请重试。",
    );
  }
}
async function request<T>(
  path: string,
  method = "GET",
  payload?: unknown,
  csrf?: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(buildApiUrl(`/api/mcp/${path}`), {
    method,
    credentials: "include",
    cache: "no-store",
    signal,
    headers: {
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "x-mcp-csrf": csrf } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as { error?: unknown } | null;
    throw new McpApiError(response.status, typeof failure?.error === "string" ? failure.error : undefined);
  }
  return response.json() as Promise<T>;
}
export const mcpApi = {
  connections: (signal?: AbortSignal) => request<ConnectionInfo>("connections", "GET", undefined, undefined, signal),
  createToken: (name: string, csrf: string, selection: McpProjectAccess) =>
    request<{ token: string }>(
      "connections/tokens",
      "POST",
      { name, ...selection },
      csrf,
    ),
  revoke: (id: string, csrf: string) =>
    request(`connections/${encodeURIComponent(id)}`, "DELETE", undefined, csrf),
  interaction: (uid: string, signal?: AbortSignal) =>
    request<{ clientName: string; clientId: string }>(
      `interactions/${encodeURIComponent(uid)}`,
      "GET", undefined, undefined, signal,
    ),
  consent: (uid: string, csrf: string, selection: McpProjectAccess) =>
    request<{ redirect: string }>(
      `interactions/${encodeURIComponent(uid)}`,
      "POST",
      { csrf, ...selection },
      csrf,
    ),
  deny: (uid: string, csrf: string) =>
    request<{ redirect: string }>(
      `interactions/${encodeURIComponent(uid)}/deny`,
      "POST",
      {},
      csrf,
    ),
};
