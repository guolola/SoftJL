#!/usr/bin/env node
// Safely dry-runs or deletes known production test accounts and their owned project data.
import { writeFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

function hasFlag(name) {
  return process.argv.includes(name);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const execute = hasFlag("--execute");
const backupConfirmed = hasFlag("--backup-confirmed");
const confirmTargetsFile = readOption("--confirm-targets-file");
const outputPath = readOption("--output");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (execute && (!backupConfirmed || !confirmTargetsFile)) {
  console.error(
    "--execute requires --backup-confirmed and --confirm-targets-file from a prior dry-run.",
  );
  process.exit(1);
}

const TEST_USER_WHERE = `
  lower(coalesce(email, '')) like 'load use%'
  or lower(coalesce(username, '')) like 'load use%'
  or lower(coalesce(display_name, '')) like 'load use%'
  or lower(coalesce(email, '')) like 'codex%'
  or lower(coalesce(username, '')) like 'codex%'
  or lower(coalesce(display_name, '')) like 'codex%'
`;

async function tableExists(client, tableName) {
  const result = await client.query(
    `
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public' and table_name = $1
      ) as exists
    `,
    [tableName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function countIfTable(client, tableName, sql) {
  if (!(await tableExists(client, tableName))) return null;
  const result = await client.query(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function deleteIfTable(client, tableName, sql) {
  if (!(await tableExists(client, tableName))) return 0;
  const result = await client.query(sql);
  return result.rowCount ?? 0;
}

async function createCandidateTables(client) {
  await client.query("drop table if exists cleanup_candidate_projects");
  await client.query("drop table if exists cleanup_candidate_users");
  await client.query(`
    create temporary table cleanup_candidate_users on commit drop as
      select id, email, username, display_name, status, created_at, last_login_at
      from users
      where ${TEST_USER_WHERE}
  `);
  await client.query(`
    create temporary table cleanup_candidate_projects on commit drop as
      select id, name, owner_user_id, status, created_at, updated_at
      from projects
      where owner_user_id in (select id from cleanup_candidate_users)
  `);
}

async function readDryRun(client) {
  const users = await client.query(`
    select id, email, username, display_name, status, created_at, last_login_at
    from cleanup_candidate_users
    order by created_at desc
  `);
  const ownedProjects = await client.query(`
    select id, name, owner_user_id, status, created_at, updated_at
    from cleanup_candidate_projects
    order by updated_at desc
  `);
  const memberProjects = await client.query(`
    select distinct p.id, p.name, p.owner_user_id, p.status, p.created_at, p.updated_at
    from projects p
    join project_members pm on pm.project_id = p.id
    join cleanup_candidate_users u on u.id = pm.user_id
    where p.id not in (select id from cleanup_candidate_projects)
    order by p.updated_at desc
  `);

  const counts = {
    candidateUsers: users.rowCount ?? 0,
    ownedProjects: ownedProjects.rowCount ?? 0,
    memberOnlyProjects: memberProjects.rowCount ?? 0,
    sessions: await countIfTable(
      client,
      "sessions",
      "select count(*) from sessions where user_id in (select id from cleanup_candidate_users)",
    ),
    authTokens: await countIfTable(
      client,
      "auth_tokens",
      "select count(*) from auth_tokens where user_id in (select id from cleanup_candidate_users)",
    ),
    loginEvents: await countIfTable(
      client,
      "login_events",
      "select count(*) from login_events where user_id in (select id from cleanup_candidate_users)",
    ),
    projectMembers: await countIfTable(
      client,
      "project_members",
      `
        select count(*)
        from project_members
        where project_id in (select id from cleanup_candidate_projects)
          or user_id in (select id from cleanup_candidate_users)
      `,
    ),
    projectInvitationTokens: await countIfTable(
      client,
      "project_invitation_tokens",
      `
        select count(*)
        from project_invitation_tokens
        where created_by_user_id in (select id from cleanup_candidate_users)
           or project_member_id in (
             select id
             from project_members
             where project_id in (select id from cleanup_candidate_projects)
                or user_id in (select id from cleanup_candidate_users)
           )
      `,
    ),
    organizationMemberships: await countIfTable(
      client,
      "organization_memberships",
      "select count(*) from organization_memberships where user_id in (select id from cleanup_candidate_users)",
    ),
    systemNoticeReads: await countIfTable(
      client,
      "system_notice_reads",
      "select count(*) from system_notice_reads where user_id in (select id from cleanup_candidate_users)",
    ),
    quotas: await countIfTable(
      client,
      "quotas",
      `
        select count(*)
        from quotas
        where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
           or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
      `,
    ),
    rateLimitPolicies: await countIfTable(
      client,
      "rate_limit_policies",
      `
        select count(*)
        from rate_limit_policies
        where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
           or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
           or provider_config_id in (
             select id
             from provider_configs
             where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
                or created_by in (select id from cleanup_candidate_users)
                or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
           )
      `,
    ),
    providerConfigs: await countIfTable(
      client,
      "provider_configs",
      `
        select count(*)
        from provider_configs
        where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
           or created_by in (select id from cleanup_candidate_users)
           or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
      `,
    ),
    providerSecrets: await countIfTable(
      client,
      "provider_secrets",
      `
        select count(*)
        from provider_secrets s
        join provider_configs c on c.id = s.provider_config_id
        where (c.scope_type = 'user' and c.scope_id in (select id from cleanup_candidate_users))
           or c.created_by in (select id from cleanup_candidate_users)
           or (c.scope_type = 'project' and c.scope_id in (select id from cleanup_candidate_projects))
      `,
    ),
    runRecords: await countIfTable(
      client,
      "run_records",
      `
        select count(*)
        from run_records
        where user_id in (select id from cleanup_candidate_users)
           or project_id in (select id from cleanup_candidate_projects)
      `,
    ),
    documentRecords: await countIfTable(
      client,
      "document_records",
      `
        select count(*)
        from document_records
        where created_by_user_id in (select id from cleanup_candidate_users)
           or project_id in (select id from cleanup_candidate_projects)
      `,
    ),
    providerUsageEvents: await countIfTable(
      client,
      "provider_usage_events",
      `
        select count(*)
        from provider_usage_events
        where user_id in (select id from cleanup_candidate_users)
           or project_id in (select id from cleanup_candidate_projects)
      `,
    ),
    paymentOrders: await countIfTable(
      client,
      "payment_orders",
      "select count(*) from payment_orders where user_id in (select id from cleanup_candidate_users)",
    ),
    billingLedger: await countIfTable(
      client,
      "billing_entitlement_ledger",
      "select count(*) from billing_entitlement_ledger where user_id in (select id from cleanup_candidate_users)",
    ),
    billingReservations: await countIfTable(
      client,
      "billing_usage_reservations",
      `
        select count(*)
        from billing_usage_reservations
        where user_id in (select id from cleanup_candidate_users)
           or project_id in (select id from cleanup_candidate_projects)
      `,
    ),
    auditLogs: await countIfTable(
      client,
      "audit_logs",
      `
        select count(*)
        from audit_logs
        where actor_user_id in (select id from cleanup_candidate_users)
           or (target_type = 'user' and target_id in (select id from cleanup_candidate_users))
           or (target_type = 'project' and target_id in (select id from cleanup_candidate_projects))
           or (target_type = 'provider_config' and target_id in (
             select id
             from provider_configs
             where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
                or created_by in (select id from cleanup_candidate_users)
                or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
           ))
      `,
    ),
    riskEvents: await countIfTable(
      client,
      "risk_events",
      `
        select count(*)
        from risk_events
        where actor_user_id in (select id from cleanup_candidate_users)
           or project_id in (select id from cleanup_candidate_projects)
           or (target_type = 'user' and target_id in (select id from cleanup_candidate_users))
           or (target_type = 'project' and target_id in (select id from cleanup_candidate_projects))
           or (target_type = 'provider_config' and target_id in (
             select id
             from provider_configs
             where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
                or created_by in (select id from cleanup_candidate_users)
                or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
           ))
      `,
    ),
  };

  return {
    mode: execute ? "execute" : "dry-run",
    matchedPrefixes: ["Load Use", "codex"],
    generatedAt: new Date().toISOString(),
    candidateUsers: users.rows,
    ownedProjects: ownedProjects.rows,
    memberOnlyProjects: memberProjects.rows,
    counts,
  };
}

async function readConfirmedIds(path) {
  const { readFile } = await import("node:fs/promises");
  const parsed = JSON.parse(await readFile(path, "utf8"));
  const userIds = new Set((parsed.candidateUsers ?? []).map((item) => item.id));
  const projectIds = new Set((parsed.ownedProjects ?? []).map((item) => item.id));
  if (userIds.size === 0) {
    throw new Error("Confirmed targets file contains no candidate users.");
  }
  return { userIds, projectIds };
}

async function assertConfirmedTargetsMatch(client, confirmPath) {
  const expected = await readConfirmedIds(confirmPath);
  const currentUsers = await client.query(
    "select id from cleanup_candidate_users order by id",
  );
  const currentProjects = await client.query(
    "select id from cleanup_candidate_projects order by id",
  );
  const currentUserIds = new Set(currentUsers.rows.map((item) => item.id));
  const currentProjectIds = new Set(currentProjects.rows.map((item) => item.id));

  const mismatch =
    currentUserIds.size !== expected.userIds.size ||
    currentProjectIds.size !== expected.projectIds.size ||
    [...currentUserIds].some((id) => !expected.userIds.has(id)) ||
    [...currentProjectIds].some((id) => !expected.projectIds.has(id));
  if (mismatch) {
    throw new Error(
      "Current cleanup candidates differ from --confirm-targets-file; rerun dry-run and confirm again.",
    );
  }
}

async function executeCleanup(client) {
  const deleted = {};

  deleted.billingReservations = await deleteIfTable(
    client,
    "billing_usage_reservations",
    `
      delete from billing_usage_reservations
      where user_id in (select id from cleanup_candidate_users)
         or project_id in (select id from cleanup_candidate_projects)
    `,
  );
  deleted.billingLedger = await deleteIfTable(
    client,
    "billing_entitlement_ledger",
    "delete from billing_entitlement_ledger where user_id in (select id from cleanup_candidate_users)",
  );
  deleted.paymentOrders = await deleteIfTable(
    client,
    "payment_orders",
    "delete from payment_orders where user_id in (select id from cleanup_candidate_users)",
  );
  deleted.providerUsageEvents = await deleteIfTable(
    client,
    "provider_usage_events",
    `
      delete from provider_usage_events
      where user_id in (select id from cleanup_candidate_users)
         or project_id in (select id from cleanup_candidate_projects)
         or provider_config_id in (
           select id
           from provider_configs
           where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
              or created_by in (select id from cleanup_candidate_users)
              or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
         )
    `,
  );
  deleted.providerSecrets = await deleteIfTable(
    client,
    "provider_secrets",
    `
      delete from provider_secrets
      where provider_config_id in (
        select id
        from provider_configs
        where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
           or created_by in (select id from cleanup_candidate_users)
           or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
      )
    `,
  );
  deleted.rateLimitPolicies = await deleteIfTable(
    client,
    "rate_limit_policies",
    `
      delete from rate_limit_policies
      where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
         or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
         or provider_config_id in (
           select id
           from provider_configs
           where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
              or created_by in (select id from cleanup_candidate_users)
              or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
         )
    `,
  );
  deleted.providerConfigs = await deleteIfTable(
    client,
    "provider_configs",
    `
      delete from provider_configs
      where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
         or created_by in (select id from cleanup_candidate_users)
         or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
    `,
  );
  deleted.runRecords = await deleteIfTable(
    client,
    "run_records",
    `
      delete from run_records
      where user_id in (select id from cleanup_candidate_users)
         or project_id in (select id from cleanup_candidate_projects)
    `,
  );
  deleted.documentRecords = await deleteIfTable(
    client,
    "document_records",
    `
      delete from document_records
      where created_by_user_id in (select id from cleanup_candidate_users)
         or project_id in (select id from cleanup_candidate_projects)
    `,
  );
  deleted.auditLogs = await deleteIfTable(
    client,
    "audit_logs",
    `
      delete from audit_logs
      where actor_user_id in (select id from cleanup_candidate_users)
         or (target_type = 'user' and target_id in (select id from cleanup_candidate_users))
         or (target_type = 'project' and target_id in (select id from cleanup_candidate_projects))
         or (target_type = 'provider_config' and target_id in (
           select id
           from provider_configs
           where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
              or created_by in (select id from cleanup_candidate_users)
              or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
         ))
    `,
  );
  deleted.riskEvents = await deleteIfTable(
    client,
    "risk_events",
    `
      delete from risk_events
      where actor_user_id in (select id from cleanup_candidate_users)
         or project_id in (select id from cleanup_candidate_projects)
         or (target_type = 'user' and target_id in (select id from cleanup_candidate_users))
         or (target_type = 'project' and target_id in (select id from cleanup_candidate_projects))
         or (target_type = 'provider_config' and target_id in (
           select id
           from provider_configs
           where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
              or created_by in (select id from cleanup_candidate_users)
              or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
         ))
    `,
  );
  deleted.projectInvitationTokens = await deleteIfTable(
    client,
    "project_invitation_tokens",
    `
      delete from project_invitation_tokens
      where created_by_user_id in (select id from cleanup_candidate_users)
         or project_member_id in (
           select id
           from project_members
           where project_id in (select id from cleanup_candidate_projects)
              or user_id in (select id from cleanup_candidate_users)
         )
    `,
  );
  deleted.projectMembers = await deleteIfTable(
    client,
    "project_members",
    `
      delete from project_members
      where project_id in (select id from cleanup_candidate_projects)
         or user_id in (select id from cleanup_candidate_users)
    `,
  );
  deleted.organizationMemberships = await deleteIfTable(
    client,
    "organization_memberships",
    "delete from organization_memberships where user_id in (select id from cleanup_candidate_users)",
  );
  deleted.systemNoticeReads = await deleteIfTable(
    client,
    "system_notice_reads",
    "delete from system_notice_reads where user_id in (select id from cleanup_candidate_users)",
  );
  deleted.sessions = await deleteIfTable(
    client,
    "sessions",
    "delete from sessions where user_id in (select id from cleanup_candidate_users)",
  );
  deleted.authTokens = await deleteIfTable(
    client,
    "auth_tokens",
    "delete from auth_tokens where user_id in (select id from cleanup_candidate_users)",
  );
  deleted.loginEvents = await deleteIfTable(
    client,
    "login_events",
    "delete from login_events where user_id in (select id from cleanup_candidate_users)",
  );
  deleted.quotas = await deleteIfTable(
    client,
    "quotas",
    `
      delete from quotas
      where (scope_type = 'user' and scope_id in (select id from cleanup_candidate_users))
         or (scope_type = 'project' and scope_id in (select id from cleanup_candidate_projects))
    `,
  );
  deleted.projects = await deleteIfTable(
    client,
    "projects",
    "delete from projects where id in (select id from cleanup_candidate_projects)",
  );
  deleted.users = await deleteIfTable(
    client,
    "users",
    "delete from users where id in (select id from cleanup_candidate_users)",
  );

  return deleted;
}

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query("begin");
  await createCandidateTables(client);
  const before = await readDryRun(client);
  let result = before;

  if (execute) {
    await assertConfirmedTargetsMatch(client, confirmTargetsFile);
    const deleted = await executeCleanup(client);
    await createCandidateTables(client);
    const after = await readDryRun(client);
    result = { ...before, mode: "execute", deleted, verification: after.counts };
    await client.query("commit");
  } else {
    await client.query("rollback");
  }

  const output = JSON.stringify(result, null, 2);
  if (outputPath) await writeFile(outputPath, `${output}\n`, "utf8");
  console.log(output);
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    // Ignore rollback failures during connection setup errors.
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
