// Persists external grants and oidc-provider entities separately from browser sessions.
import type { AdapterPayload } from "oidc-provider";
export type McpConnection = {
  id: string;
  userId: string;
  clientId: string;
  name: string;
  kind: "oauth" | "pat";
  projectScope: "selected" | "account";
  projectIds: string[];
  tokenHash: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};
// Account access is explicit; missing or empty legacy scope fails closed.
export function hasAccountProjectScope(connection: Pick<McpConnection, "projectScope">) {
  return connection.projectScope === "account";
}
export type OAuthEntity = {
  model: string;
  id: string;
  payload: AdapterPayload;
  expiresAt: number | null;
};
export interface McpStore {
  putConnection(connection: McpConnection): Promise<void>;
  getConnection(id: string): Promise<McpConnection | undefined>;
  findToken(hash: string): Promise<McpConnection | undefined>;
  listConnections(userId: string): Promise<McpConnection[]>;
  revokeConnection(id: string, userId?: string): Promise<void>;
  touchConnection(id: string): Promise<void>;
  putEntity(entity: OAuthEntity): Promise<void>;
  findEntity(
    model: string,
    field: "id" | "uid" | "userCode",
    value: string,
  ): Promise<AdapterPayload | undefined>;
  consumeEntity(model: string, id: string): Promise<void>;
  deleteEntity(model: string, id: string): Promise<void>;
  revokeGrant(grantId: string): Promise<void>;
  takeRateLimit(
    key: string,
    maximum: number,
    windowSeconds: number,
  ): Promise<boolean>;
}
export function createInMemoryMcpStore(): McpStore {
  const connections = new Map<string, McpConnection>();
  const entities = new Map<string, OAuthEntity>();
  const limits = new Map<string, { count: number; until: number }>();
  const copy = <T>(value: T): T => structuredClone(value);
  return {
    async putConnection(connection) {
      connections.set(connection.id, copy(connection));
    },
    async getConnection(id) {
      return copy(connections.get(id));
    },
    async findToken(hash) {
      return copy([...connections.values()].find((c) => c.tokenHash === hash));
    },
    async listConnections(userId) {
      return copy([...connections.values()].filter((c) => c.userId === userId));
    },
    async revokeConnection(id, userId) {
      const c = connections.get(id);
      if (c && (!userId || c.userId === userId))
        c.revokedAt = new Date().toISOString();
    },
    async touchConnection(id) {
      const c = connections.get(id);
      if (c) c.lastUsedAt = new Date().toISOString();
    },
    async putEntity(entity) {
      const previous = entities.get(`${entity.model}:${entity.id}`);
      entities.set(
        `${entity.model}:${entity.id}`,
        copy({
          ...entity,
          payload: {
            ...entity.payload,
            ...(previous?.payload.consumed
              ? { consumed: previous.payload.consumed }
              : {}),
          },
        }),
      );
    },
    async findEntity(model, field, value) {
      const entity = [...entities.values()].find(
        (e) =>
          e.model === model &&
          (field === "id" ? e.id : e.payload[field]) === value,
      );
      if (
        !entity ||
        (entity.expiresAt !== null && entity.expiresAt <= Date.now())
      )
        return undefined;
      return copy(entity.payload);
    },
    async consumeEntity(model, id) {
      const e = entities.get(`${model}:${id}`);
      if (!e || e.payload.consumed)
        throw new Error("OAuth credential already consumed");
      e.payload.consumed = Math.floor(Date.now() / 1000);
    },
    async deleteEntity(model, id) {
      entities.delete(`${model}:${id}`);
    },
    async revokeGrant(id) {
      for (const [key, e] of entities)
        if (e.payload.grantId === id || (e.model === "Grant" && e.id === id))
          entities.delete(key);
      await this.revokeConnection(id);
    },
    async takeRateLimit(key, maximum, windowSeconds) {
      const now = Date.now();
      for (const [id, limit] of limits)
        if (limit.until <= now) limits.delete(id);
      const limit = limits.get(key) ?? {
        count: 0,
        until: now + windowSeconds * 1000,
      };
      limit.count++;
      limits.set(key, limit);
      return limit.count <= maximum;
    },
  };
}
