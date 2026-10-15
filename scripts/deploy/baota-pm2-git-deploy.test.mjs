// Exercises the release startup ordering and failure guard without touching PM2 or a server.
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = readFileSync(new URL("./baota-pm2-git-deploy.sh", import.meta.url), "utf8");
const reload = script.slice(script.indexOf("reload_pm2_for_release() {"), script.indexOf("rollback_to_previous_release() {"));

for (const { migrationStatus, rollback } of [
  { migrationStatus: 0, rollback: false },
  { migrationStatus: 1, rollback: false },
  { migrationStatus: 1, rollback: true },
]) {
  test(`release startup respects database migration status ${migrationStatus} (rollback: ${rollback})`, () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "uml-release-startup-"));
    try {
      const result = spawnSync(process.env.UML_TEST_BASH ?? "bash", ["-s"], {
        encoding: "utf8",
        env: { ...process.env, TEST_RELEASE_DIR: directory.replaceAll("\\", "/") },
        input: `
          set -Eeuo pipefail
          run_timed() { shift; "$@"; }
          load_production_env() { :; }
          pm2() { printf 'pm2 %s\\n' "$*"; }
          node() { printf 'migration %s\\n' "$*"; return ${migrationStatus}; }
          sleep() { :; }
          wait_for_http_health() { :; }
          check_pm2_cwd() { :; }
          curl() { echo '{"supportsDesignTableDiagram":true,"releaseSha":"test-release"}'; }
          ${reload}
          if ! reload_pm2_for_release "$TEST_RELEASE_DIR" test-release now ${!rollback}; then exit 1; fi
        `,
      });
      assert.ifError(result.error);
      assert.equal(result.status, rollback ? 0 : migrationStatus, result.stderr);
      const events = result.stdout;
      if (rollback) {
        assert.doesNotMatch(events, /migration apps\/api/);
        assert.match(events, /pm2 start ecosystem.config.cjs/);
        assert.match(events, /pm2 save/);
      } else {
        assert.ok(events.indexOf("pm2 delete uml-api") < events.indexOf("migration apps/api/dist/db/migrate.js"), events);
        if (migrationStatus === 0) {
          assert.ok(events.indexOf("migration apps/api/dist/db/migrate.js") < events.indexOf("pm2 start ecosystem.config.cjs"), events);
          assert.match(events, /pm2 save/);
        } else {
          assert.doesNotMatch(events, /pm2 start|Checking API health|pm2 save/);
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
