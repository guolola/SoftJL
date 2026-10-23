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
