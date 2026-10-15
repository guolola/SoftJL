// Starts or reuses the persistent local PostgreSQL database for development.
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { promisify } from "node:util";

const requireApi = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { Client } = requireApi("pg");
const execFileAsync = promisify(execFile);

const CONTAINER_NAME = "uml-platform-postgres";
const VOLUME_NAME = "uml-platform-postgres-data";
const IMAGE_NAME = "postgres:16-alpine";
const DATABASE_URL = "postgres://uml_user:uml_dev_password_123@127.0.0.1:5432/uml_platform";
const DATABASE_ENV = {
  POSTGRES_USER: "uml_user",
  POSTGRES_PASSWORD: "uml_dev_password_123",
  POSTGRES_DB: "uml_platform",
};
const WAIT_TIMEOUT_MS = 120_000;
const WAIT_INTERVAL_MS = 2_000;

function log(message) {
  console.log(`[postgres] ${message}`);
}

async function runCommand(command, args) {
  try {
    const result = await execFileAsync(command, args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout.trim() : "",
      stderr: typeof error.stderr === "string" ? error.stderr.trim() : "",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeDatabase() {
  const client = new Client({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 2_000,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: error?.code,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

function isConnectionPending(result) {
  // PostgreSQL briefly closes TCP connections while its Docker init process restarts it.
  return (
    ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P03"].includes(result.code) ||
    /connection terminated unexpectedly|server closed the connection unexpectedly/i.test(
      result.message ?? "",
    )
  );
}

function requireCompatibleDatabase(result) {
  if (result.ok || isConnectionPending(result)) return;
  throw new Error(
    `Port 5432 has a PostgreSQL service, but the development database is unavailable: ${result.message}. Check its database, user, and password before starting the platform.`,
  );
}

async function ensureDockerAvailable(run) {
  const result = await run("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (result.ok) return;
  const detail = result.stderr || result.message || "unknown error";
  throw new Error(
    `PostgreSQL is not reachable and Docker is unavailable: ${detail}. Start Docker Desktop, then retry npm run dev:postgres:demo.`,
  );
}

async function inspectContainer(run) {
  const result = await run("docker", [
    "inspect",
    "--format",
    "{{json .}}",
    CONTAINER_NAME,
  ]);
  if (!result.ok) {
    if (/No such (object|container)/i.test(`${result.stderr} ${result.message}`)) {
      return null;
    }
    throw new Error(`Could not inspect ${CONTAINER_NAME}: ${result.stderr || result.message}`);
  }
  return JSON.parse(result.stdout);
}

function assertCompatibleContainer(container) {
  const env = new Map(
    (container.Config?.Env ?? []).map((entry) => {
      const separator = entry.indexOf("=");
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
  const bindings = container.HostConfig?.PortBindings?.["5432/tcp"] ?? [];
  const hasExpectedPort = bindings.some(
    (binding) =>
      binding.HostPort === "5432" &&
      ["127.0.0.1", "0.0.0.0", ""].includes(binding.HostIp ?? ""),
  );
  if (
    !container.Config?.Image?.startsWith("postgres:") ||
    !hasExpectedPort ||
    Object.entries(DATABASE_ENV).some(([key, value]) => env.get(key) !== value)
  ) {
    throw new Error(
      `${CONTAINER_NAME} already exists with a different image, port, or database configuration. It was left untouched so its data is safe.`,
    );
  }
}

async function createContainer(run) {
  log(`Creating ${CONTAINER_NAME} with persistent volume ${VOLUME_NAME} ...`);
  const result = await run("docker", [
    "run",
    "-d",
    "--name",
    CONTAINER_NAME,
    "-p",
    "127.0.0.1:5432:5432",
    "-v",
    `${VOLUME_NAME}:/var/lib/postgresql/data`,
    ...Object.entries(DATABASE_ENV).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
    IMAGE_NAME,
  ]);
  if (!result.ok) {
    throw new Error(`Could not create ${CONTAINER_NAME}: ${result.stderr || result.message}`);
  }
}

async function startContainer(run) {
  log(`Starting existing ${CONTAINER_NAME} ...`);
  const result = await run("docker", ["start", CONTAINER_NAME]);
  if (!result.ok) {
    throw new Error(`Could not start ${CONTAINER_NAME}: ${result.stderr || result.message}`);
  }
}

async function waitForDatabase(probe, delay) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    const result = await probe();
    if (result.ok) return;
    requireCompatibleDatabase(result);
    await delay(WAIT_INTERVAL_MS);
  }
  throw new Error(
    `PostgreSQL did not become ready within ${WAIT_TIMEOUT_MS / 1000}s. Check: docker logs ${CONTAINER_NAME} --tail 100`,
  );
}

export async function ensurePostgres({
  probe = probeDatabase,
  run = runCommand,
  delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms)),
} = {}) {
  const initial = await probe();
  if (initial.ok) {
    log("Development database is already available at 127.0.0.1:5432");
    return;
  }
  requireCompatibleDatabase(initial);
  await ensureDockerAvailable(run);

  const container = await inspectContainer(run);
  if (!container) {
    await createContainer(run);
  } else {
    assertCompatibleContainer(container);
    if (!container.State?.Running) {
      await startContainer(run);
    }
  }

  await waitForDatabase(probe, delay);
  log("Development database is ready at 127.0.0.1:5432");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensurePostgres().catch((error) => {
    console.error(`\n[postgres] ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
