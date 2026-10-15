// Provides small database helpers shared by repositories and migration scripts.
export interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

export interface Queryable {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<QueryResultLike<T>>;
}

export interface TransactionClient extends Queryable {
  release(): void;
}

export interface TransactionPool {
  connect(): Promise<TransactionClient>;
}

export async function withTransaction<T>(
  pool: TransactionPool,
  operation: (client: Queryable) => Promise<T>,
) {
  const client = await pool.connect();
  await client.query("BEGIN");

  try {
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth(db: Queryable) {
  const checkedAt = new Date().toISOString();

  try {
    const result = await db.query<{ ok: number }>("select 1 as ok");
    return {
      ok: result.rows[0]?.ok === 1,
      checkedAt,
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      errorMessage: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}
