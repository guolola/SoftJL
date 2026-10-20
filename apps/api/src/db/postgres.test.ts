// Verifies the PostgreSQL persistence foundation without requiring a live database.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createPostgresPoolFromEnv,
  getDatabaseUrl,
} from "./postgres.js";
import { checkCurrentDatabase, migrationTableName, migrations, runMigrations } from "./migrations.js";
import { currentSchemaSql } from "./current-schema.js";
import { PGlite } from "@electric-sql/pglite";
import { createPostgresAuthRepository } from "../auth/postgres-auth-repository.js";
import { createProviderUsageTracker } from "../provider-configs/provider-usage-tracker.js";
import {
  checkDatabaseHealth,
  withTransaction,
  type Queryable,
} from "./transactions.js";

class FakeClient implements Queryable {
  readonly queries: string[] = [];

  constructor(private readonly appliedMigrationIds = new Set<string>()) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.queries.push(params ? `${sql} ${JSON.stringify(params)}` : sql);

    if (/select id from schema_migrations/i.test(sql)) {
      return {
        rows: [...this.appliedMigrationIds].map((id) => ({ id })),
        rowCount: this.appliedMigrationIds.size,
      };
    }

    if (/insert into schema_migrations/i.test(sql)) {
      const id = String(params?.[0] ?? "");
      this.appliedMigrationIds.add(id);
      return { rows: [], rowCount: 1 };
    }

    if (/select 1 as ok/i.test(sql)) {
      return { rows: [{ ok: 1 }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }
}

class FakePool {
  readonly client = new FakeClient();
  connectCount = 0;
  releaseCount = 0;

  async connect() {
    this.connectCount += 1;
    return {
      query: (sql: string, params?: readonly unknown[]) =>
        this.client.query(sql, params),
      release: () => {
        this.releaseCount += 1;
      },
    };
  }
}

test("database url is read from DATABASE_URL and blank values are ignored", () => {
  assert.equal(getDatabaseUrl({ DATABASE_URL: "   " }), null);
  assert.equal(
    getDatabaseUrl({ DATABASE_URL: " postgres://user:pass:5432/app " }),
    "postgres://user:pass:5432/app",
  );
});

test("postgres pool is created from DATABASE_URL without connecting eagerly", () => {
  const pool = createPostgresPoolFromEnv({
    DATABASE_URL: "postgres://user:pass:5432/app",
  });

  assert.equal(pool.options.connectionString, "postgres://user:pass:5432/app");
  void pool.end();
});

test("the current schema has one installation baseline without historical transforms", () => {
  assert.deepEqual(migrations.map((entry) => entry.id), ["current_platform_schema_v3"]);
  assert.doesNotMatch(currentSchemaSql, /alter table|update users|update projects|delete from|strip_retired|RUN_LEGACY_FAILURE/i);
});

test("deployment compatibility checks leave empty, current and obsolete databases untouched", async () => {
  for (const scenario of [
    { tables: [], ids: [], status: "empty" },
    { tables: ["schema_migrations"], ids: [], status: "empty" },
    { tables: ["schema_migrations", "projects"], ids: ["current_platform_schema_v3"], status: "current" },
    { tables: ["schema_migrations", "projects"], ids: ["current_platform_schema_v1"], status: null },
    { tables: ["schema_migrations", "projects"], ids: ["current_platform_schema_v2"], status: null },
    { tables: ["schema_migrations", "projects"], ids: ["001_user_admin_platform_base"], status: null },
    { tables: ["schema_migrations", "projects"], ids: ["current_platform_schema_v3", "old"], status: null },
    { tables: ["schema_migrations", "projects"], ids: [], status: null },
    { tables: ["projects"], ids: [], status: null },
  ]) {
    const queries: string[] = [];
    const db = {
      async query(sql: string) {
        queries.push(sql);
        return { rows: sql.includes("information_schema.tables")
          ? scenario.tables.map((table_name) => ({ table_name }))
          : scenario.ids.map((id) => ({ id })), rowCount: 0 };
      },
    } as Queryable;
    if (scenario.status) assert.equal(await checkCurrentDatabase(db), scenario.status);
    else await assert.rejects(checkCurrentDatabase(db), /Database schema is (obsolete|unversioned)/);
    assert.ok(queries.every((sql) => /^\s*select\b/i.test(sql)), "preflight must execute only SELECT statements");
  }
});

test("clean installation creates the complete schema and current constraints", async () => {
  const database = new PGlite();
  try {
    await database.exec(currentSchemaSql);
    const tables = await database.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public'");
    const names = new Set(tables.rows.map((row) => row.table_name));
    for (const name of ["organizations", "courses", "classes", "teams", "organization_memberships", "quotas"]) assert.equal(names.has(name), false, name);
    for (const name of ["users", "projects", "run_records", "run_events", "document_records", "document_record_versions", "billing_usage_reservations", "billing_entitlement_ledger", "mcp_connections", "prompt_runtime_versions", "user_onboarding_state", "llm_request_telemetry", "admin_invitations"]) assert.ok(names.has(name), name);
    const columns = await database.query<{ column_name: string; is_nullable: string }>("select column_name, is_nullable from information_schema.columns where table_name = 'projects'");
    assert.equal(columns.rows.find((row) => row.column_name === "project_mode")?.is_nullable, "NO");
    for (const name of ["organization_id", "course_id", "class_id", "team_id", "visibility"]) assert.equal(columns.rows.some((row) => row.column_name === name), false, name);
    const indexes = await database.query<{ indexname: string }>("select indexname from pg_indexes where schemaname = 'public'");
    for (const name of ["billing_reversal_ledger_unique", "billing_reservations_ledger_entry_idx", "llm_telemetry_project_run_idx", "run_records_error_code_idx"]) assert.ok(indexes.rows.some((row) => row.indexname === name), name);
    await database.exec("insert into users(id,username,display_name,password_hash) values('u','user','User','hash')");
    await assert.rejects(database.exec("insert into projects(id,name,owner_user_id) values('p','Project','u')"), /project_mode/);
    await assert.rejects(database.exec("insert into projects(id,name,owner_user_id,project_mode) values('p','Project','u','obsolete')"), /check constraint/);
    await database.exec("insert into projects(id,name,owner_user_id,project_mode) values('s','Standard','u','standard'),('p','Professional','u','professional')");
    assert.deepEqual((await database.query("select project_mode from projects order by id")).rows, [{ project_mode: "professional" }, { project_mode: "standard" }]);
    const mcpColumns = await database.query<{ column_name: string; column_default: string }>("select column_name, column_default from information_schema.columns where table_name = 'mcp_connections'");
    assert.match(mcpColumns.rows.find(row => row.column_name === "project_scope")?.column_default ?? "", /selected/);
    // Exercise the real parameter bindings after removing project and usage hierarchy columns.
    const db = database as unknown as Queryable;
    const repository = createPostgresAuthRepository(db);
    const { project, ownerMember } = await repository.createProject({ ownerUserId: "u", name: "Shared project", description: null, projectMode: "standard" });
    assert.equal(ownerMember.role, "owner");
    const updated = await repository.updateProject(project.id, { name: "Renamed", backgroundKey: "booking", retentionPolicy: "one_year_365_days" });
    assert.equal(updated?.name, "Renamed");
    assert.equal(updated?.backgroundKey, "booking");
    assert.equal(updated?.retentionPolicy, "one_year_365_days");
    await database.exec("insert into provider_configs(id,name,provider,base_url,default_model) values('provider','Provider','openai','https://example.test/v1','model')");
    const tracker = createProviderUsageTracker(db);
    await tracker.recordUsage({ userId: "u", projectId: project.id, providerConfigId: "provider", taskType: "provider_test", units: 2 });
    assert.equal((await tracker.listUsageEvents?.())?.[0]?.units, 2);
    const decision = await tracker.checkLimit({ userId: "u", projectId: project.id, providerConfigId: "provider", taskType: "provider_test", limit: 3, windowSeconds: 3600 });
    assert.equal(decision.remainingUnits, 1);
  } finally { await database.close(); }
});

test("migration runner creates its ledger and skips already applied migrations", async () => {
  const client = new FakeClient(new Set(migrations.map((migration) => migration.id)));

  const applied = await runMigrations(client);

  assert.equal(applied.length, 0);
  assert.equal(client.queries[0], "BEGIN");
  assert.match(client.queries[1] ?? "", /pg_advisory_xact_lock/i);
  assert.match(client.queries[2] ?? "", new RegExp(`create table if not exists ${migrationTableName}`, "i"));
  assert.equal(client.queries.at(-1), "COMMIT");
  assert.doesNotMatch(client.queries.join("\n"), /create table users/i);
});

test("migration runner applies missing migrations and records them", async () => {
  const client = new FakeClient();

  const applied = await runMigrations(client);

  assert.deepEqual(applied, migrations.map((migration) => migration.id));
  assert.match(client.queries.join("\n"), /create table users/i);
  assert.match(client.queries.join("\n"), /insert into schema_migrations/i);
});

test("migration runner uses one pool connection and releases it after commit", async () => {
  const pool = new FakePool();
  const applied = await runMigrations(pool, [{ id: "pool-test", sql: "SELECT 42" }]);

  assert.deepEqual(applied, ["pool-test"]);
  assert.equal(pool.connectCount, 1);
  assert.equal(pool.releaseCount, 1);
  assert.equal(pool.client.queries[0], "BEGIN");
  assert.match(pool.client.queries[1]!, /pg_advisory_xact_lock/);
  assert.equal(pool.client.queries.at(-1), "COMMIT");
});

for (const failedStep of ["BEGIN", "pg_advisory_xact_lock", "SELECT 42", "insert into schema_migrations"]) {
  test(`migration runner rolls back and releases the pool connection when ${failedStep} fails`, async () => {
    const pool = new FakePool();
    const query = pool.client.query.bind(pool.client);
    const failure = new Error("database operation failed");
    pool.client.query = async (sql, params) => {
      if (sql.includes(failedStep)) throw failure;
      return query(sql, params);
    };

    await assert.rejects(runMigrations(pool, [{ id: "pool-test", sql: "SELECT 42" }]), failure);
    assert.equal(pool.releaseCount, 1);
    assert.equal(pool.client.queries.at(-1), "ROLLBACK");
    assert.ok(!pool.client.queries.includes("COMMIT"));
  });
}

test("obsolete schema ledgers are rejected without applying repair SQL", async () => {
  const client = new FakeClient(new Set(["001_user_admin_platform_base"]));
  await assert.rejects(runMigrations(client), /schema is obsolete/);
  assert.equal(client.queries.at(-1), "ROLLBACK");
  assert.doesNotMatch(client.queries.join("\n"), /create table users/i);
});

test("health check reports ok when SELECT 1 succeeds", async () => {
  const health = await checkDatabaseHealth(new FakeClient());

  assert.equal(health.ok, true);
  assert.equal(typeof health.checkedAt, "string");
});

test("transaction helper commits successful work and releases the client", async () => {
  const pool = new FakePool();

  const result = await withTransaction(pool, async (client) => {
    await client.query("select 1 as ok");
    return "committed";
  });

  assert.equal(result, "committed");
  assert.deepEqual(pool.client.queries.map((query) => query.split(" ")[0]), [
    "BEGIN",
    "select",
    "COMMIT",
  ]);
  assert.equal(pool.releaseCount, 1);
});

test("transaction helper rolls back failed work and releases the client", async () => {
  const pool = new FakePool();

  await assert.rejects(
    () =>
      withTransaction(pool, async () => {
        throw new Error("boom");
      }),
    /boom/,
  );

  assert.deepEqual(pool.client.queries, ["BEGIN", "ROLLBACK"]);
  assert.equal(pool.releaseCount, 1);
});
