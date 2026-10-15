// Implements shared MCP persistence; consumed credentials cannot be reused concurrently across API instances.
import type { AdapterPayload } from "oidc-provider";
import type { Queryable } from "../../db/transactions.js";
import type { McpConnection, McpStore } from "./mcp-store.js";
const columns = `id, user_id as "userId", client_id as "clientId", name, kind, project_scope as "projectScope", project_ids as "projectIds", token_hash as "tokenHash", created_at as "createdAt", expires_at as "expiresAt", revoked_at as "revokedAt", last_used_at as "lastUsedAt"`;
function normalize(c?: McpConnection): McpConnection | undefined {
  if (!c) return undefined;
  const iso = (date: unknown) =>
    date instanceof Date ? date.toISOString() : String(date);
  return {
    ...c,
    createdAt: iso(c.createdAt),
    expiresAt: iso(c.expiresAt),
    revokedAt: c.revokedAt ? iso(c.revokedAt) : null,
    lastUsedAt: c.lastUsedAt ? iso(c.lastUsedAt) : null,
  };
}
export function createPostgresMcpStore(db: Queryable): McpStore {
  return {
    async putConnection(c) {
      // Grants are immutable; only revocation and last-use timestamps can be changed later.
      await db.query(
        `insert into mcp_connections(id,user_id,client_id,name,kind,project_ids,token_hash,created_at,expires_at,revoked_at,last_used_at,project_scope) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          c.id,
          c.userId,
          c.clientId,
          c.name,
          c.kind,
          c.projectIds,
          c.tokenHash,
          c.createdAt,
          c.expiresAt,
          c.revokedAt,
          c.lastUsedAt,
          c.projectScope,
        ],
      );
    },
    async getConnection(id) {
      return normalize(
        (
          await db.query<McpConnection>(
            `select ${columns} from mcp_connections where id=$1`,
            [id],
          )
        ).rows[0],
      );
    },
    async findToken(hash) {
      return normalize(
        (
          await db.query<McpConnection>(
            `select ${columns} from mcp_connections where token_hash=$1`,
            [hash],
          )
        ).rows[0],
      );
    },
    async listConnections(userId) {
      return (
        await db.query<McpConnection>(
          `select ${columns} from mcp_connections where user_id=$1 order by created_at desc`,
          [userId],
        )
      ).rows.map((c) => normalize(c)!);
    },
    async revokeConnection(id, userId) {
      await db.query(
        `update mcp_connections set revoked_at=coalesce(revoked_at,now()) where id=$1 and ($2::text is null or user_id=$2)`,
        [id, userId ?? null],
      );
    },
    async touchConnection(id) {
      await db.query(
        `update mcp_connections set last_used_at=now() where id=$1`,
        [id],
      );
    },
    async putEntity(e) {
      await db.query(
        `insert into mcp_oauth_entities(model,id,payload,expires_at) values($1,$2,$3::jsonb,$4) on conflict(model,id) do update set payload=excluded.payload || case when mcp_oauth_entities.payload ? 'consumed' then jsonb_build_object('consumed',mcp_oauth_entities.payload->'consumed') else '{}'::jsonb end, expires_at=excluded.expires_at`,
        [
          e.model,
          e.id,
          JSON.stringify(e.payload),
          e.expiresAt === null ? null : new Date(e.expiresAt),
        ],
      );
    },
    async findEntity(model, field, value) {
      const column =
        field === "id"
          ? "id"
          : field === "uid"
            ? "payload->>'uid'"
            : "payload->>'userCode'";
      return (
        await db.query<{ payload: AdapterPayload }>(
          `select payload from mcp_oauth_entities where model=$1 and ${column}=$2 and (expires_at is null or expires_at>now()) limit 1`,
          [model, value],
        )
      ).rows[0]?.payload;
    },
    async consumeEntity(model, id) {
      const result = await db.query(
        `update mcp_oauth_entities set payload=jsonb_set(payload,'{consumed}',to_jsonb(floor(extract(epoch from now()))::bigint)) where model=$1 and id=$2 and not (payload ? 'consumed') returning id`,
        [model, id],
      );
      if (!result.rowCount)
        throw new Error("OAuth credential already consumed or missing");
    },
    async deleteEntity(model, id) {
      await db.query(
        `delete from mcp_oauth_entities where model=$1 and id=$2`,
        [model, id],
      );
    },
    async revokeGrant(id) {
      // Revoke the permission record first: even an in-flight token save cannot restore access.
      await this.revokeConnection(id);
      await db.query(
        `delete from mcp_oauth_entities where payload->>'grantId'=$1 or (model='Grant' and id=$1)`,
        [id],
      );
    },
    async takeRateLimit(key, maximum, seconds) {
      const result = await db.query<{ hits: number }>(
        `insert into mcp_rate_limits(key,hits,expires_at) values($1,1,now()+$2*interval '1 second') on conflict(key) do update set hits=case when mcp_rate_limits.expires_at<=now() then 1 else mcp_rate_limits.hits+1 end, expires_at=case when mcp_rate_limits.expires_at<=now() then excluded.expires_at else mcp_rate_limits.expires_at end returning hits`,
        [key, seconds],
      );
      return result.rows[0].hits <= maximum;
    },
  };
}
