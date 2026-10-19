// Defines durable multi-instance authorization, revocation, and shared rate-limit storage.
export const mcpSchemaSql = `
create table if not exists mcp_connections (
  id text primary key, user_id text not null references users(id) on delete cascade,
  client_id text not null, name text not null, kind text not null check (kind in ('oauth','pat')),
  project_ids text[] not null, token_hash text unique,
  project_scope text not null default 'selected' check (project_scope in ('selected', 'account')),
  created_at timestamptz not null, expires_at timestamptz not null,
  revoked_at timestamptz, last_used_at timestamptz
);
create index if not exists mcp_connections_user_idx on mcp_connections(user_id);
create table if not exists mcp_oauth_entities (
  model text not null, id text not null, payload jsonb not null,
  expires_at timestamptz, primary key(model,id)
);
create index if not exists mcp_oauth_grant_idx on mcp_oauth_entities((payload->>'grantId'));
create index if not exists mcp_oauth_uid_idx on mcp_oauth_entities(model,(payload->>'uid'));
create index if not exists mcp_oauth_expiry_idx on mcp_oauth_entities(expires_at);
create table if not exists mcp_rate_limits (
  key text primary key, hits integer not null, expires_at timestamptz not null
);
`;
