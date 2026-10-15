// Ensures the local OnlyOffice Document Server needed by npm run dev is reachable.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CONTAINER_NAME = "onlyoffice-documentserver";
const IMAGE_NAME = "onlyoffice/documentserver";
const HEALTH_URL = "http://127.0.0.1:8080/healthcheck";
const JWT_SECRET = "local-onlyoffice-jwt-secret";
const WAIT_TIMEOUT_MS = 120_000;
const WAIT_INTERVAL_MS = 2_000;
const DOCKER_CLI_PATH = "C:\\Program Files\\Docker\\Docker\\resources\\bin";

function log(message) {
  console.log(`[onlyoffice] ${message}`);
}

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

async function run(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      ...options,
    });
    return {
      ok: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout.trim() : "",
      stderr: typeof error.stderr === "string" ? error.stderr.trim() : "",
      message: error instanceof Error ? error.message : String(error),
      command: formatCommand(command, args),
    };
  }
}

async function checkHealth() {
  try {
    const response = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(2_000),
    });
    const body = (await response.text()).trim();
    return response.ok && body === "true";
  } catch {
    return false;
  }
}

async function waitForHealth() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    if (await checkHealth()) {
      log(`Document Server is ready at ${HEALTH_URL}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }

  throw new Error(
    [
      `OnlyOffice did not become ready within ${WAIT_TIMEOUT_MS / 1000}s.`,
      `Try: docker logs ${CONTAINER_NAME} --tail 100`,
      `Also check that http://127.0.0.1:8080/healthcheck is reachable.`,
    ].join("\n"),
  );
}

async function ensureDockerAvailable() {
  const result = await run("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (!result.ok) {
    if (/ENOENT/i.test(result.message ?? "")) {
      throw new Error(
        [
          "Docker CLI was not found in this terminal.",
          `Failed command: ${result.command}`,
          "Install Docker Desktop for Windows, or add docker.exe to PATH.",
          `Common Docker CLI path: ${DOCKER_CLI_PATH}`,
          "After changing PATH, open a new PowerShell and run: docker version",
        ].join("\n"),
      );
    }

    throw new Error(
      [
        "Docker CLI is available, but Docker Desktop does not seem to be running.",
        `Failed command: ${result.command}`,
        result.stderr || result.message,
        "Start Docker Desktop, wait until it is ready, then run npm run dev again.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

async function inspectContainer() {
  const result = await run("docker", [
    "inspect",
    "--format",
    "{{.State.Running}}",
    CONTAINER_NAME,
  ]);
  if (!result.ok) return null;
  return { running: result.stdout === "true" };
}

async function readContainerEnv() {
  const result = await run("docker", [
    "inspect",
    "--format",
    "{{range .Config.Env}}{{println .}}{{end}}",
    CONTAINER_NAME,
  ]);
  if (!result.ok) return new Map();
  return new Map(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return separatorIndex === -1
          ? [line, ""]
          : [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

async function assertCompatibleJwtSecret() {
  const env = await readContainerEnv();
  const existingSecret = env.get("JWT_SECRET");
  if (existingSecret === JWT_SECRET) return;

  throw new Error(
    [
      `${CONTAINER_NAME} already exists with a missing or different JWT_SECRET.`,
      "The local API uses ONLYOFFICE_JWT_SECRET=local-onlyoffice-jwt-secret.",
      "To recreate the local development container manually, run:",
      `docker rm -f ${CONTAINER_NAME}`,
      [
        "docker run -d",
        `--name ${CONTAINER_NAME}`,
        "-p 8080:80",
        "-e JWT_ENABLED=true",
        `-e JWT_SECRET=${JWT_SECRET}`,
        IMAGE_NAME,
      ].join(" "),
    ].join("\n"),
  );
}

async function createContainer() {
  log(`Creating ${CONTAINER_NAME} on http://127.0.0.1:8080 ...`);
  const result = await run("docker", [
    "run",
    "-d",
    "--name",
    CONTAINER_NAME,
    "-p",
    "8080:80",
    "-e",
    "JWT_ENABLED=true",
    "-e",
    `JWT_SECRET=${JWT_SECRET}`,
    IMAGE_NAME,
  ]);
  if (!result.ok) {
    throw new Error(
      [
        `Failed to create ${CONTAINER_NAME}.`,
        result.stderr || result.message,
        "If port 8080 is already in use, stop the other service or change the local OnlyOffice setup.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

async function startContainer() {
  log(`Starting existing ${CONTAINER_NAME} ...`);
  const result = await run("docker", ["start", CONTAINER_NAME]);
  if (!result.ok) {
    throw new Error(
      [`Failed to start ${CONTAINER_NAME}.`, result.stderr || result.message]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

async function main() {
  if (await checkHealth()) {
    const docker = await run("docker", ["version", "--format", "{{.Server.Version}}"]);
    if (docker.ok) {
      const container = await inspectContainer();
      if (container) {
        await assertCompatibleJwtSecret();
      }
    }
    log(`Document Server is already reachable at ${HEALTH_URL}`);
    return;
  }

  await ensureDockerAvailable();

  const container = await inspectContainer();
  if (!container) {
    await createContainer();
  } else {
    await assertCompatibleJwtSecret();
    if (!container.running) {
      await startContainer();
    } else {
      log(`${CONTAINER_NAME} is running; waiting for healthcheck ...`);
    }
  }

  await waitForHealth();
}

main().catch((error) => {
  console.error(`\n[onlyoffice] ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
