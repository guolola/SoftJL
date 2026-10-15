// Owns PostgreSQL pool creation from runtime database configuration.
import { Pool, type PoolConfig } from "pg";

export type DatabaseEnv = Record<string, string | undefined>;

export function getDatabaseUrl(env: DatabaseEnv = process.env) {
  const value = env.DATABASE_URL?.trim();
  return value ? value : null;
}

export function createPostgresPoolFromEnv(
  env: DatabaseEnv = process.env,
  options: Omit<PoolConfig, "connectionString"> = {},
) {
  const databaseUrl = getDatabaseUrl(env);
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to create a PostgreSQL pool");
  }

  const configuredMax = Number(env.DATABASE_POOL_MAX ?? env.PGPOOL_MAX);
  const max = Number.isInteger(configuredMax) && configuredMax > 0
    ? configuredMax
    : undefined;

  return new Pool({
    ...options,
    ...(max ? { max } : {}),
    connectionString: databaseUrl,
  });
}
