// Applies database migrations before deployment starts API and generation worker processes.
import { runMigrations } from "./migrations.js";
import { createPostgresPoolFromEnv } from "./postgres.js";

async function main() {
  const pool = createPostgresPoolFromEnv();
  try {
    console.log("[migrations] Waiting for the database migration lock");
    const applied = await runMigrations(pool);
    console.log(`[migrations] Applied ${applied.length} migrations: ${applied.join(", ") || "already up to date"}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[migrations] Failed:", error);
  process.exitCode = 1;
});
