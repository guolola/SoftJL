// Initializes the current database schema under a transaction and startup lock.
import type { Queryable, TransactionPool } from "./transactions.js";
import { currentSchemaSql } from "./current-schema.js";

export const migrationTableName = "schema_migrations";
export const migrations = [{ id: "current_platform_schema_v3", sql: currentSchemaSql }] as const;

const OBSOLETE_SCHEMA_MESSAGE = "Database schema is obsolete; initialize a clean database with the current schema.";

// Deployment checks the candidate against the live database without creating a
// ledger or changing application data, before stopping the serving release.
export async function checkCurrentDatabase(db: Queryable): Promise<"empty" | "current"> {
  const tables = await db.query<{ table_name: string }>(`
    select table_name from information_schema.tables
    where table_schema = current_schema() and table_type = 'BASE TABLE'
  `);
  const names = tables.rows.map((row) => row.table_name);
  if (names.length === 0) return "empty";
  if (!names.includes(migrationTableName)) {
    throw new Error("Database schema is unversioned; initialize a clean database with the current schema.");
  }
  const applied = await db.query<{ id: string }>(`select id from ${migrationTableName}`);
  if (applied.rows.length === 0 && names.every((name) => name === migrationTableName)) return "empty";
  if (applied.rows.length !== migrations.length ||
    applied.rows.some((row) => !migrations.some((entry) => entry.id === row.id))) {
    throw new Error(OBSOLETE_SCHEMA_MESSAGE);
  }
  return "current";
}

export async function runMigrations(
  db: Queryable | TransactionPool,
  migrationList: readonly { id: string; sql: string }[] = migrations,
) {
  // Pin the pool connection: the lock, SQL and ledger must share one transaction.
  const connection = "connect" in db
    ? { client: await db.connect(), pooled: true as const }
    : { client: db, pooled: false as const };
  const { client } = connection;
  try {
    await client.query("BEGIN");
    // Serialize API/worker startup before even creating or reading the ledger.
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [0x554d4c, 1]);
    await client.query(`
      create table if not exists ${migrationTableName} (
        id text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedRows = await client.query<{ id: string }>(
      `select id from ${migrationTableName}`,
    );
    const applied = new Set(appliedRows.rows.map((row) => row.id));
    // An obsolete ledger is rejected instead of replaying historical repair patches.
    if (migrationList === migrations && [...applied].some((id) => !migrations.some((entry) => entry.id === id))) {
      throw new Error(OBSOLETE_SCHEMA_MESSAGE);
    }
    const newlyApplied: string[] = [];

    for (const migration of migrationList) {
      if (applied.has(migration.id)) continue;

      await client.query(migration.sql);
      // Keep migration effects and their ledger entries in the same transaction.
      await client.query(`insert into ${migrationTableName} (id) values ($1)`, [
        migration.id,
      ]);
      newlyApplied.push(migration.id);
    }

    await client.query("COMMIT");
    return newlyApplied;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    if (connection.pooled) connection.client.release();
  }
}
