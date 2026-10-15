// Verifies migration atomicity and concurrent startup against isolated PostgreSQL schemas.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { runMigrations } from "./migrations.js";
import type { Queryable } from "./transactions.js";

test("failed ledger writes roll back migration effects and allow a clean retry", async () => {
  const database = new PGlite();
  const client: Queryable = {
    async query(sql, params) {
      const result = params
        ? await database.query(sql, [...params])
        : (await database.exec(sql)).at(-1)!;
      return { rows: result.rows as never[], rowCount: result.affectedRows ?? null };
    },
  };
  try {
    await client.query(`
      CREATE TABLE schema_migrations(id text PRIMARY KEY CHECK(id <> 'rejected'), applied_at timestamptz DEFAULT now());
      CREATE TABLE migration_effects(id text PRIMARY KEY);
    `);
    const pending = [{ id: "rejected", sql: "INSERT INTO migration_effects VALUES ('once')" }];
    await assert.rejects(runMigrations(client, pending), /check constraint/);
    assert.deepEqual((await client.query("SELECT * FROM migration_effects")).rows, []);
    assert.deepEqual((await client.query("SELECT id FROM schema_migrations")).rows, []);

    pending[0]!.id = "accepted";
    assert.deepEqual(await runMigrations(client, pending), ["accepted"]);
    assert.deepEqual(await runMigrations(client, pending), []);
    assert.deepEqual((await client.query("SELECT * FROM migration_effects")).rows, [{ id: "once" }]);
  } finally {
    await database.close();
  }
});

// Use only the explicit test URL, never DATABASE_URL or production application schemas.
const testDatabaseUrl = process.env.UML_MIGRATION_TEST_DATABASE_URL;
test("eight independent worker pools apply migrations once and recover after a failed migration", {
  skip: !testDatabaseUrl,
  timeout: 30_000,
}, async () => {
  const schema = `migration_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^migration_test_[a-f0-9]{32}$/);
  const admin = new Pool({ connectionString: testDatabaseUrl });
  const workers = Array.from({ length: 8 }, () => new Pool({
    connectionString: testDatabaseUrl,
    max: 2,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  }));
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const pending = [{ id: "once", sql: `
      CREATE TABLE migration_effects(id text PRIMARY KEY);
      INSERT INTO migration_effects VALUES ('once');
      SELECT pg_sleep(0.1);
    ` }];
    const results = await Promise.all(workers.map((pool) => runMigrations(pool, pending)));
    assert.equal(results.filter((ids) => ids.length === 1).length, 1);
    assert.equal(results.filter((ids) => ids.length === 0).length, 7);
    assert.deepEqual((await workers[0]!.query("SELECT * FROM migration_effects")).rows, [{ id: "once" }]);
    assert.deepEqual((await workers[0]!.query("SELECT id FROM schema_migrations")).rows, [{ id: "once" }]);

    await assert.rejects(runMigrations(workers[0]!, [{ id: "retry", sql: `
      INSERT INTO migration_effects VALUES ('retry');
      SELECT * FROM missing_migration_table;
    ` }]), /missing_migration_table/);
    const retry = [{ id: "retry", sql: "INSERT INTO migration_effects VALUES ('retry')" }];
    assert.deepEqual(await runMigrations(workers[1]!, retry), ["retry"]);
    assert.deepEqual(await runMigrations(workers[2]!, retry), []);
    assert.equal((await workers[1]!.query("SELECT * FROM migration_effects")).rows.length, 2);
  } finally {
    await Promise.all(workers.map((pool) => pool.end()));
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
