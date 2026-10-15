-- Creates the first persistent identity, project, run, provider, audit, and document tables.
create table if not exists users (
  id text primary key,
  email text not null unique,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  status text not null default 'active',
  email_verified boolean not null default false,
  mfa_enabled boolean not null default false,
  mfa_secret text,
  mfa_pending_secret text,
  mfa_pending_expires_at timestamptz,
  system_roles text[] not null default '{}',
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  revoked_at timestamptz
);

create table if not exists login_events (
  id text primary key,
  user_id text references users(id) on delete set null,
  email text,
  outcome text not null,
  ip_address text,
  user_agent text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists auth_tokens (
  id text primary key,
  type text not null,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (type, token_hash)
);

create table if not exists projects (
  id text primary key,
  name text not null,
  description text,
  visibility text not null default 'private',
  status text not null default 'active',
  owner_user_id text not null references users(id),
  organization_id text,
  course_id text,
  class_id text,
  team_id text,
  default_provider_config_id text,
  retention_policy text not null default 'manual',
  background_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organizations (
  id text primary key,
  name text not null,
  code text,
  type text not null default 'school',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists courses (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  code text,
  term text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists classes (
  id text primary key,
  course_id text not null references courses(id) on delete cascade,
  name text not null,
  code text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  id text primary key,
  class_id text not null references classes(id) on delete cascade,
  name text not null,
  code text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_memberships (
  id text primary key,
  target_type text not null,
  target_id text not null,
  user_id text references users(id) on delete set null,
  email text,
  display_name text,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quotas (
  id text primary key,
  scope_type text not null,
  scope_id text not null,
  resource text not null,
  limit_count integer not null,
  used_count integer not null default 0,
  reset_period text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type, scope_id, resource)
);

create table if not exists project_members (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  user_id text references users(id) on delete set null,
  email text not null,
  display_name text,
  role text not null,
  status text not null default 'invited',
  invited_by_user_id text references users(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, email)
);

create table if not exists project_invitation_tokens (
  id text primary key,
  project_member_id text not null references project_members(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  created_by_user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  actor_user_id text references users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  outcome text not null,
  message text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists risk_events (
  id text primary key,
  event_type text not null,
  severity text not null,
  actor_user_id text references users(id) on delete set null,
  project_id text references projects(id) on delete cascade,
  target_type text not null,
  target_id text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists provider_configs (
  id text primary key,
  name text not null,
  provider text not null,
  base_url text not null,
  default_model text not null,
  allowed_models text[] not null default '{}',
  status text not null default 'active',
  allowlisted boolean not null default true,
  masked_key text not null default '',
  key_purpose text not null default 'admin-configured provider key',
  created_by text not null default 'unknown',
  risk_state text not null default 'medium',
  quota text not null default 'unlimited',
  last_used_at timestamptz,
  breaker_state text not null default 'closed',
  breaker_failure_count integer not null default 0,
  breaker_opened_at timestamptz,
  breaker_last_failure_at timestamptz,
  breaker_probe_started_at timestamptz,
  scope_type text not null default 'system',
  scope_id text,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists provider_secrets (
  id text primary key,
  provider_config_id text not null references provider_configs(id) on delete cascade,
  secret_ciphertext text not null,
  secret_hash text not null default '',
  key_tail text not null,
  status text not null default 'active',
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz
);

create table if not exists provider_usage_events (
  id text primary key,
  user_id text references users(id) on delete set null,
  project_id text references projects(id) on delete cascade,
  provider_config_id text not null references provider_configs(id) on delete cascade,
  task_type text not null,
  ip_address text,
  organization_id text,
  units integer not null default 1,
  outcome text not null default 'success',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists rate_limit_policies (
  id text primary key,
  scope_type text not null,
  scope_id text,
  provider_config_id text references provider_configs(id) on delete cascade,
  task_type text,
  limit_count integer not null,
  window_seconds integer not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists system_notices (
  id text primary key,
  title text not null,
  notice_type text not null,
  icon text,
  content_blocks jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (notice_type in ('model_update', 'feature_update', 'important', 'maintenance')),
  check (status in ('draft', 'published', 'archived'))
);

create table if not exists system_notice_reads (
  user_id text not null references users(id) on delete cascade,
  notice_id text not null references system_notices(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notice_id)
);

create table if not exists run_records (
  id text primary key,
  user_id text references users(id) on delete set null,
  project_id text references projects(id) on delete cascade,
  source_run_id text references run_records(id) on delete set null,
  source_action text,
  source_run_status text,
  stage text not null,
  status text not null,
  model text,
  provider_config_id text references provider_configs(id) on delete set null,
  snapshot jsonb not null,
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists run_events (
  id bigserial primary key,
  run_id text not null references run_records(id) on delete cascade,
  sequence integer not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, sequence)
);

create table if not exists project_workspace_states (
  project_id text primary key references projects(id) on delete cascade,
  version integer not null default 0,
  state jsonb not null default '{}'::jsonb,
  updated_by_user_id text references users(id) on delete set null,
  source_run_id text references run_records(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists document_records (
  id text primary key,
  workspace_id text,
  project_id text references projects(id) on delete cascade,
  run_id text references run_records(id) on delete set null,
  source_run_id text references run_records(id) on delete set null,
  created_by_user_id text references users(id) on delete set null,
  document_kind text not null,
  title text not null,
  storage_key text not null,
  file_name text,
  mime_type text not null,
  byte_length integer,
  version integer not null default 1,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_record_versions (
  id bigserial primary key,
  document_id text not null references document_records(id) on delete cascade,
  workspace_id text,
  project_id text references projects(id) on delete cascade,
  created_by_user_id text references users(id) on delete set null,
  version integer not null,
  file_name text,
  mime_type text not null,
  byte_length integer,
  source_run_id text references run_records(id) on delete set null,
  storage_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create index if not exists sessions_user_id_idx on sessions(user_id);
create index if not exists login_events_user_id_created_at_idx on login_events(user_id, created_at desc);
create index if not exists auth_tokens_user_type_idx on auth_tokens(user_id, type, expires_at desc);
create index if not exists projects_owner_user_id_idx on projects(owner_user_id);
create index if not exists projects_academic_scope_idx on projects(organization_id, course_id, class_id, team_id, updated_at desc);
create index if not exists projects_default_provider_idx on projects(default_provider_config_id, updated_at desc);
create index if not exists organizations_status_idx on organizations(status, updated_at desc);
create index if not exists courses_organization_id_idx on courses(organization_id, updated_at desc);
create index if not exists classes_course_id_idx on classes(course_id, updated_at desc);
create index if not exists teams_class_id_idx on teams(class_id, updated_at desc);
create index if not exists organization_memberships_user_idx on organization_memberships(user_id, status);
create index if not exists organization_memberships_target_idx on organization_memberships(target_type, target_id, status);
create index if not exists quotas_scope_idx on quotas(scope_type, scope_id, resource);
create index if not exists project_members_user_id_idx on project_members(user_id);
create index if not exists project_invitation_tokens_member_idx on project_invitation_tokens(project_member_id);
create index if not exists audit_logs_created_at_idx on audit_logs(created_at desc);
create index if not exists risk_events_created_at_idx on risk_events(created_at desc);
create index if not exists risk_events_project_created_at_idx on risk_events(project_id, created_at desc);
create index if not exists provider_configs_scope_idx on provider_configs(scope_type, scope_id);
create index if not exists provider_secrets_config_status_idx on provider_secrets(provider_config_id, status);
create index if not exists provider_usage_dimensions_idx on provider_usage_events(user_id, project_id, provider_config_id, task_type, created_at desc);
create index if not exists provider_usage_ip_idx on provider_usage_events(ip_address, provider_config_id, task_type, created_at desc);
create index if not exists provider_usage_organization_idx on provider_usage_events(organization_id, provider_config_id, task_type, created_at desc);
create index if not exists rate_limit_policies_lookup_idx on rate_limit_policies(scope_type, scope_id, provider_config_id, task_type, enabled);
create index if not exists system_notices_status_published_idx on system_notices(status, published_at desc, created_at desc);
create index if not exists system_notice_reads_user_idx on system_notice_reads(user_id, read_at desc);
create index if not exists run_records_project_created_at_idx on run_records(project_id, created_at desc);
create index if not exists run_records_user_created_at_idx on run_records(user_id, created_at desc);
create index if not exists run_events_run_id_sequence_idx on run_events(run_id, sequence);
create index if not exists project_workspace_states_updated_at_idx on project_workspace_states(updated_at desc);
create index if not exists document_records_workspace_updated_at_idx on document_records(workspace_id, updated_at desc);
create index if not exists document_records_project_updated_at_idx on document_records(project_id, updated_at desc);
create index if not exists document_record_versions_document_version_idx on document_record_versions(document_id, version desc);
