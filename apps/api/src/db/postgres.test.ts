// Verifies the PostgreSQL persistence foundation without requiring a live database.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createPostgresPoolFromEnv,
  getDatabaseUrl,
} from "./postgres.js";
import {
  baseSchemaSql,
  clearProjectDefaultProviderConfigSql,
  migrationTableName,
  migrations,
  noneLinearDomesticEndpointSql,
  providerModelCapabilitiesEnforcementSql,
  providerBreakerProbeLeaseSql,
  providerStructuredOutputCapabilitiesEnforcementSql,
  providerConfigStoreSql,
  runMigrations,
  usernamesSql,
} from "./migrations.js";
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
    getDatabaseUrl({ DATABASE_URL: " postgres://user:pass@localhost:5432/app " }),
    "postgres://user:pass@localhost:5432/app",
  );
});

test("postgres pool is created from DATABASE_URL without connecting eagerly", () => {
  const pool = createPostgresPoolFromEnv({
    DATABASE_URL: "postgres://user:pass@localhost:5432/app",
  });

  assert.equal(pool.options.connectionString, "postgres://user:pass@localhost:5432/app");
  void pool.end();
});

test("base schema migration includes the required platform tables", () => {
  const requiredTables = [
    "users",
    "sessions",
    "login_events",
    "projects",
    "project_members",
    "audit_logs",
    "risk_events",
    "provider_configs",
    "provider_secrets",
    "provider_usage_events",
    "run_records",
    "run_events",
    "document_records",
  ];

  for (const table of requiredTables) {
    assert.match(baseSchemaSql, new RegExp(`create table if not exists ${table}`, "i"));
  }
});

test("base schema includes DB-backed document metadata and versions", () => {
  for (const column of [
    "workspace_id",
    "file_name",
    "byte_length",
    "source_run_id",
  ]) {
    assert.match(baseSchemaSql, new RegExp(column, "i"));
  }

  assert.match(
    baseSchemaSql,
    /create table if not exists document_record_versions/i,
  );
  assert.match(
    migrations.map((migration) => migration.id).join("\n"),
    /document_repository_metadata/i,
  );
});

test("user schema and migrations include unique login usernames", () => {
  assert.match(baseSchemaSql, /username text not null unique/i);
  assert.match(usernamesSql, /alter table users add column if not exists username text/i);
  assert.match(usernamesSql, /create unique index if not exists users_username_unique_idx/i);
  assert.match(
    migrations.map((migration) => migration.id).join("\n"),
    /015_usernames/,
  );
});

test("provider config migration includes secure view fields and usage dimensions", () => {
  for (const column of [
    "masked_key",
    "key_purpose",
    "risk_state",
    "quota",
    "last_used_at",
    "breaker_probe_started_at",
    "secret_hash",
  ]) {
    assert.match(providerConfigStoreSql, new RegExp(column, "i"));
  }

  assert.match(providerConfigStoreSql, /create table if not exists provider_usage_events/i);
  assert.match(providerConfigStoreSql, /user_id.*project_id.*provider_config_id.*task_type/is);
});

test("provider breaker recovery lease is added for existing databases", () => {
  assert.match(
    providerBreakerProbeLeaseSql,
    /add column if not exists breaker_probe_started_at timestamptz/i,
  );
  assert.match(
    migrations.map((migration) => migration.id).join("\n"),
    /025_provider_breaker_probe_lease/,
  );
});

test("NoneLinear legacy endpoints migrate to the mainland endpoint", () => {
  assert.match(
    noneLinearDomesticEndpointSql,
    /base_url = 'https:\/\/api\.nonelinear\.com\.cn'/i,
  );
  assert.match(noneLinearDomesticEndpointSql, /breaker_state = 'closed'/i);
  assert.match(
    migrations.map((migration) => migration.id).join("\n"),
    /026_nonelinear_domestic_endpoint/,
  );
});

test("provider model capabilities enforcement deletes incompatible legacy provider rows", () => {
  assert.match(
    providerModelCapabilitiesEnforcementSql,
    /not exists \([^]*column_name = 'model_capabilities'[^]*\)/i,
  );
  assert.match(providerModelCapabilitiesEnforcementSql, /delete from provider_configs/i);
  assert.match(
    providerModelCapabilitiesEnforcementSql,
    /add column if not exists model_capabilities jsonb not null default '\{\}'::jsonb/i,
  );
  assert.match(
    migrations.map((migration) => migration.id).join("\n"),
    /018_enforce_provider_model_capabilities/,
  );
});

test("provider structured output capability enforcement deletes old capability rows", () => {
  assert.match(
    providerStructuredOutputCapabilitiesEnforcementSql,
    /jsonb_each\(model_capabilities\)/i,
  );
  assert.match(
    providerStructuredOutputCapabilitiesEnforcementSql,
    /structuredOutputMode/i,
  );
  assert.match(
    providerStructuredOutputCapabilitiesEnforcementSql,
    /cardinality\(allowed_models\)/i,
  );
  assert.match(
    providerStructuredOutputCapabilitiesEnforcementSql,
    /unnest\(allowed_models\)/i,
  );
  assert.match(
    providerStructuredOutputCapabilitiesEnforcementSql,
    /delete from provider_configs/i,
  );
  assert.match(
    migrations.map((migration) => migration.id).join("\n"),
    /019_enforce_provider_structured_output_capabilities/,
  );
});

test("project default provider cleanup clears stale project bindings", () => {
  assert.match(
    clearProjectDefaultProviderConfigSql,
    /update projects\s+set default_provider_config_id = null/is,
  );
  assert.match(
    clearProjectDefaultProviderConfigSql,
    /where default_provider_config_id is not null/i,
  );
  assert.match(
    migrations.map((migration) => migration.id).join("\n"),
    /020_clear_project_default_provider_config/,
  );
});

test("migration runner creates its ledger and skips already applied migrations", async () => {
  const client = new FakeClient(new Set(migrations.map((migration) => migration.id)));

  const applied = await runMigrations(client);

  assert.equal(applied.length, 0);
  assert.equal(client.queries[0], "BEGIN");
  assert.match(client.queries[1] ?? "", /pg_advisory_xact_lock/i);
  assert.match(client.queries[2] ?? "", new RegExp(`create table if not exists ${migrationTableName}`, "i"));
  assert.equal(client.queries.at(-1), "COMMIT");
  assert.doesNotMatch(client.queries.join("\n"), /create table if not exists users/i);
});

test("migration runner applies missing migrations and records them", async () => {
  const client = new FakeClient();

  const applied = await runMigrations(client);

  assert.deepEqual(applied, migrations.map((migration) => migration.id));
  assert.match(client.queries.join("\n"), /create table if not exists users/i);
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

test("migration runner applies provider capability enforcement after previous migrations", async () => {
  const appliedMigrationIds = migrations
    .filter(
      (migration) => migration.id !== "018_enforce_provider_model_capabilities",
    )
    .map((migration) => migration.id);
  const client = new FakeClient(new Set(appliedMigrationIds));

  const applied = await runMigrations(client);

  assert.deepEqual(applied, ["018_enforce_provider_model_capabilities"]);
  assert.match(client.queries.join("\n"), /delete from provider_configs/i);
  assert.match(
    client.queries.join("\n"),
    /add column if not exists model_capabilities jsonb not null default '\{\}'::jsonb/i,
  );
  assert.match(
    client.queries.join("\n"),
    /insert into schema_migrations \(id\) values \(\$1\).*018_enforce_provider_model_capabilities/is,
  );
});

test("migration runner applies structured output capability enforcement after previous migrations", async () => {
  const appliedMigrationIds = migrations
    .filter(
      (migration) =>
        migration.id !== "019_enforce_provider_structured_output_capabilities",
    )
    .map((migration) => migration.id);
  const client = new FakeClient(new Set(appliedMigrationIds));

  const applied = await runMigrations(client);

  assert.deepEqual(applied, [
    "019_enforce_provider_structured_output_capabilities",
  ]);
  assert.match(client.queries.join("\n"), /structuredOutputMode/i);
  assert.match(client.queries.join("\n"), /delete from provider_configs/i);
  assert.match(
    client.queries.join("\n"),
    /insert into schema_migrations \(id\) values \(\$1\).*019_enforce_provider_structured_output_capabilities/is,
  );
});

test("migration runner applies project default provider cleanup after previous migrations", async () => {
  const appliedMigrationIds = migrations
    .filter(
      (migration) => migration.id !== "020_clear_project_default_provider_config",
    )
    .map((migration) => migration.id);
  const client = new FakeClient(new Set(appliedMigrationIds));

  const applied = await runMigrations(client);

  assert.deepEqual(applied, ["020_clear_project_default_provider_config"]);
  assert.match(client.queries.join("\n"), /default_provider_config_id = null/i);
  assert.match(
    client.queries.join("\n"),
    /insert into schema_migrations \(id\) values \(\$1\).*020_clear_project_default_provider_config/is,
  );
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
