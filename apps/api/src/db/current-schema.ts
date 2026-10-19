// Defines the current PostgreSQL schema for clean installations; obsolete layouts are not upgraded.
import { mcpSchemaSql } from "../mcp/records/mcp-schema.js";

export const adminAnalyticsSql = `
create table llm_request_telemetry (
  id text primary key,
  run_id text not null,
  project_id text,
  user_id text,
  provider_config_id text,
  model text not null,
  task_type text not null,
  stage text,
  diagram_kind text,
  subtask_id text,
  requested_model_count integer,
  queued_at timestamptz not null,
  provider_started_at timestamptz,
  first_reasoning_at timestamptz,
  first_visible_at timestamptz,
  last_visible_at timestamptz,
  completed_at timestamptz not null,
  queue_ms integer,
  provider_ttft_ms integer,
  ttft_ms integer,
  reasoning_ms integer,
  decode_ms integer,
  total_ms integer not null,
  input_tokens integer,
  output_tokens integer,
  cached_input_tokens integer,
  reasoning_tokens integer,
  total_tokens integer,
  outcome text not null check (outcome in ('success', 'failed', 'cancelled')),
  status_code integer,
  error_category text,
  retry_count integer not null default 0,
  format_fallback_count integer not null default 0,
  usage_unavailable_reason text
);
create index llm_telemetry_window_idx on llm_request_telemetry(queued_at, task_type);
create index llm_telemetry_model_idx on llm_request_telemetry(provider_config_id, model, queued_at);

create table evaluation_imports (
  id text primary key,
  suite_version text not null,
  evaluator_version text not null,
  generated_at timestamptz not null,
  imported_at timestamptz not null default now()
);
create table evaluation_attempts (
  id text primary key,
  import_id text not null references evaluation_imports(id) on delete cascade,
  suite_version text not null,
  evaluator_version text not null,
  fixture_id text not null,
  task_type text not null,
  provider text,
  model text not null,
  strategy_id text not null,
  strategy_version text not null,
  attempt integer not null,
  k integer not null,
  budget_dimension text check (budget_dimension in ('wall_clock_ms', 'tokens', 'model_calls')),
  budget_value integer,
  quality_score double precision not null,
  automatic_verdict text not null check (automatic_verdict in ('pass', 'fail')),
  duration_ms integer not null,
  input_tokens integer,
  output_tokens integer,
  cached_input_tokens integer,
  reasoning_tokens integer,
  total_tokens integer,
  model_call_count integer,
  created_at timestamptz not null,
  review_verdict text check (review_verdict in ('pass', 'fail')),
  review_reason text,
  reviewed_by text,
  reviewed_at timestamptz
);
create index evaluation_attempt_window_idx on evaluation_attempts(created_at, task_type, model);
create index evaluation_attempt_review_idx on evaluation_attempts(review_verdict, created_at desc);
create index llm_telemetry_project_run_idx on llm_request_telemetry(project_id, run_id);
`;

export const currentSchemaSql = `
create table users (
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

create table sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  revoked_at timestamptz
);

create table login_events (
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

create table auth_tokens (
  id text primary key,
  type text not null,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (type, token_hash)
);

create table projects (
  id text primary key,
  name text not null,
  project_mode text not null check (project_mode in ('standard', 'professional')),
  description text,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  status text not null default 'active',
  owner_user_id text not null references users(id),
  retention_policy text not null default 'manual',
  background_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_members (
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

create table project_invitation_tokens (
  id text primary key,
  project_member_id text not null references project_members(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  created_by_user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table audit_logs (
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

create table risk_events (
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

create table provider_configs (
  id text primary key,
  name text not null,
  provider text not null,
  base_url text not null,
  default_model text not null,
  allowed_models text[] not null default '{}',
  model_capabilities jsonb not null default '{}'::jsonb,
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

create table provider_secrets (
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

create table run_records (
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
  error jsonb,
  error_code text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table run_events (
  id bigserial primary key,
  run_id text not null references run_records(id) on delete cascade,
  sequence integer not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, sequence)
);

create table project_workspace_states (
  project_id text primary key references projects(id) on delete cascade,
  version integer not null default 0,
  state jsonb not null default '{}'::jsonb,
  updated_by_user_id text references users(id) on delete set null,
  source_run_id text references run_records(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table document_records (
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

create table document_record_versions (
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

create table provider_usage_events (
  id text primary key,
  user_id text references users(id) on delete set null,
  project_id text references projects(id) on delete cascade,
  provider_config_id text not null references provider_configs(id) on delete cascade,
  task_type text not null,
  ip_address text,
  units integer not null default 1,
  outcome text not null default 'success',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table rate_limit_policies (
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

create table system_notices (
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

create table system_notice_reads (
  user_id text not null references users(id) on delete cascade,
  notice_id text not null references system_notices(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notice_id)
);

create index sessions_user_id_idx on sessions(user_id);
create index login_events_user_id_created_at_idx on login_events(user_id, created_at desc);
create index auth_tokens_user_type_idx on auth_tokens(user_id, type, expires_at desc);
create index projects_owner_user_id_idx on projects(owner_user_id);
create index project_members_user_id_idx on project_members(user_id);
create index project_invitation_tokens_member_idx on project_invitation_tokens(project_member_id);
create index audit_logs_created_at_idx on audit_logs(created_at desc);
create index risk_events_created_at_idx on risk_events(created_at desc);
create index risk_events_project_created_at_idx on risk_events(project_id, created_at desc);
create index provider_configs_scope_idx on provider_configs(scope_type, scope_id);
create index provider_secrets_config_status_idx on provider_secrets(provider_config_id, status);
create index provider_usage_dimensions_idx on provider_usage_events(user_id, project_id, provider_config_id, task_type, created_at desc);
create index rate_limit_policies_lookup_idx on rate_limit_policies(scope_type, scope_id, provider_config_id, task_type, enabled);
create index system_notices_status_published_idx on system_notices(status, published_at desc, created_at desc);
create index system_notice_reads_user_idx on system_notice_reads(user_id, read_at desc);
create index run_records_project_created_at_idx on run_records(project_id, created_at desc);
create index run_records_user_created_at_idx on run_records(user_id, created_at desc);
create index run_events_run_id_sequence_idx on run_events(run_id, sequence);
create index project_workspace_states_updated_at_idx on project_workspace_states(updated_at desc);
create index document_records_workspace_updated_at_idx on document_records(workspace_id, updated_at desc);
create index document_records_project_updated_at_idx on document_records(project_id, updated_at desc);
create index document_record_versions_document_version_idx on document_record_versions(document_id, version desc);

create table billing_skus (
  id text primary key,
  code text not null unique,
  kind text not null,
  name text not null,
  description text not null,
  credit_amount integer not null,
  amount_cents integer not null,
  currency text not null default 'CNY',
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'credit_pack'),
  check (currency = 'CNY'),
  check (amount_cents > 0),
  check (credit_amount > 0)
);

create table payment_orders (
  id text primary key,
  merchant_order_no text not null unique,
  user_id text not null references users(id) on delete cascade,
  sku_id text not null references billing_skus(id),
  provider text not null,
  amount_cents integer not null,
  currency text not null default 'CNY',
  status text not null default 'pending',
  provider_transaction_id text,
  provider_payload_json jsonb not null default '{}'::jsonb,
  client_return_url text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider in ('alipay')),
  check (status in ('pending', 'paid', 'expired', 'closed', 'failed', 'refund_pending', 'refunded')),
  check (amount_cents > 0),
  check (currency = 'CNY')
);

create table payment_notifications (
  id text primary key,
  provider text not null,
  merchant_order_no text,
  provider_event_id text,
  provider_transaction_id text,
  notification_status text not null,
  verified boolean not null default false,
  sanitized_payload_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider in ('alipay')),
  check (notification_status in ('received', 'verified', 'rejected', 'duplicate', 'processed', 'ignored', 'failed'))
);

create table billing_entitlement_ledger (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  source_type text not null,
  source_id text,
  sku_id text references billing_skus(id),
  credit_delta integer not null default 0,
  valid_from timestamptz not null,
  valid_until timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_type in ('purchase', 'signup_bonus', 'usage', 'refund', 'admin_adjustment', 'reversal'))
);

create table billing_usage_reservations (
  id text primary key,
  run_id text not null unique,
  user_id text not null references users(id) on delete cascade,
  project_id text,
  task_type text not null,
  reservation_kind text not null,
  credit_delta integer not null default 0,
  status text not null default 'reserved',
  ledger_entry_id text references billing_entitlement_ledger(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  released_at timestamptz,
  check (reservation_kind = 'credit'),
  check (status in ('reserved', 'confirmed', 'released'))
);


create unique index payment_orders_provider_transaction_id_unique
  on payment_orders(provider, provider_transaction_id)
  where provider_transaction_id is not null;
create unique index payment_notifications_event_unique
  on payment_notifications(provider, provider_event_id)
  where provider_event_id is not null;
create unique index billing_signup_bonus_unique
  on billing_entitlement_ledger(user_id, source_type, (metadata_json->>'bonusType'))
  where source_type = 'signup_bonus';
create unique index billing_purchase_ledger_unique
  on billing_entitlement_ledger(source_type, source_id)
  where source_type in ('purchase', 'refund') and source_id is not null;
create unique index billing_usage_ledger_unique
  on billing_entitlement_ledger(source_type, source_id)
  where source_type = 'usage' and source_id is not null;
create index payment_orders_user_created_idx on payment_orders(user_id, created_at desc);
create index payment_orders_status_expires_idx on payment_orders(status, expires_at);
create index billing_ledger_user_created_idx on billing_entitlement_ledger(user_id, created_at desc);
create index billing_ledger_validity_idx on billing_entitlement_ledger(user_id, valid_from, valid_until);
create index billing_reservations_user_status_idx on billing_usage_reservations(user_id, status, created_at desc);

insert into billing_skus (
  id, code, kind, name, description, credit_amount, amount_cents, currency, active, sort_order, metadata_json
)
values
  ('sku_credits_10', 'credits_10', 'credit_pack', '10 次包', '买 10 次送 1 次，到账 11 次', 11, 990, 'CNY', true, 110, '{"default":true}'::jsonb),
  ('sku_credits_50', 'credits_50', 'credit_pack', '50 次包', '买 50 次送 8 次，到账 58 次', 58, 4900, 'CNY', true, 120, '{"default":true}'::jsonb),
  ('sku_credits_100', 'credits_100', 'credit_pack', '100 次包', '买 100 次送 20 次，到账 120 次', 120, 9900, 'CNY', true, 130, '{"default":true}'::jsonb),
  ('sku_credits_500', 'credits_500', 'credit_pack', '500 次包', '买 500 次送 120 次，到账 620 次', 620, 39900, 'CNY', true, 140, '{"default":true}'::jsonb)
on conflict (code) do nothing;

create table admin_invitations (
  id text primary key,
  email text not null,
  display_name text,
  role text not null check (role in (
    'system_operator', 'project_admin', 'auditor',
    'security_admin', 'model_admin'
  )),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by_user_id text not null references users(id) on delete restrict,
  accepted_by_user_id text references users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index admin_invitations_email_idx
  on admin_invitations (lower(email), created_at desc);
create unique index admin_invitations_pending_role_unique
  on admin_invitations (lower(email), role)
  where status = 'pending' and revoked_at is null and accepted_at is null;

create table prompt_runtime_versions (
  id uuid primary key,
  prompt_id text not null,
  content text not null,
  status text not null check (status in ('draft','pending','published','superseded')),
  revision integer not null default 1,
  author text not null,
  approver text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prompt_runtime_versions_prompt_idx on prompt_runtime_versions(prompt_id, created_at desc);
create table prompt_runtime_active (
  prompt_id text primary key,
  version_id uuid not null references prompt_runtime_versions(id)
);

create table user_onboarding_state (
  user_id text primary key references users(id) on delete cascade,
  empty_workspace_status text check (empty_workspace_status in ('skipped', 'completed')),
  first_project_status text check (first_project_status in ('skipped', 'completed', 'ineligible')),
  first_project_id text,
  updated_at timestamptz not null default now()
);

create index provider_usage_ip_idx on provider_usage_events(ip_address, provider_config_id, task_type, created_at desc);
create index run_records_error_code_idx on run_records(error_code);
create unique index billing_reversal_ledger_unique on billing_entitlement_ledger(source_type, source_id) where source_type = 'reversal' and source_id is not null;
create index billing_reservations_ledger_entry_idx on billing_usage_reservations(ledger_entry_id) where ledger_entry_id is not null;
${adminAnalyticsSql}
${mcpSchemaSql.replace(/\bif not exists\s+/gi, "")}
`;
