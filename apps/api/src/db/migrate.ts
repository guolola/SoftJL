// Applies database migrations before deployment starts API and generation worker processes.
import { checkCurrentDatabase, runMigrations } from "./migrations.js";
import { createPostgresPoolFromEnv } from "./postgres.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
    throw new Error("Usage: node apps/api/dist/db/migrate.js [--check]");
  }
  const pool = createPostgresPoolFromEnv();
  try {
    if (args[0] === "--check") {
      const status = await checkCurrentDatabase(pool);
      console.log(`[migrations] Read-only compatibility check passed: ${status}`);
      return;
    }
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
