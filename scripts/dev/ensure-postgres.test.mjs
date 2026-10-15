// Verifies that local PostgreSQL startup reuses compatible data and never replaces unknown containers.
import assert from "node:assert/strict";
import test from "node:test";
import { ensurePostgres } from "./ensure-postgres.mjs";

const refused = { ok: false, code: "ECONNREFUSED", message: "connection refused" };
const ready = { ok: true };

function compatibleContainer(running) {
  return {
    State: { Running: running },
    Config: {
      Image: "postgres:16-alpine",
      Env: [
        "POSTGRES_USER=uml_user",
        "POSTGRES_PASSWORD=uml_dev_password_123",
        "POSTGRES_DB=uml_platform",
      ],
    },
    HostConfig: {
      PortBindings: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "5432" }] },
    },
  };
}

function probeSequence(...results) {
  let index = 0;
  return async () => results[Math.min(index++, results.length - 1)];
}

test("uses an already available development database without Docker", async () => {
  await ensurePostgres({
    probe: async () => ready,
    run: async () => assert.fail("Docker should not be called"),
  });
});

test("creates a database with a persistent volume when no container exists", async () => {
  const commands = [];
  await ensurePostgres({
    probe: probeSequence(
      refused,
      { ok: false, message: "Connection terminated unexpectedly" },
      ready,
    ),
    delay: async () => {},
    run: async (_command, args) => {
      commands.push(args);
      if (args[0] === "inspect") {
        return { ok: false, stderr: "No such object: uml-platform-postgres" };
      }
      return { ok: true, stdout: "16.0" };
    },
  });

  const creation = commands.find(([command]) => command === "run");
  assert.ok(creation);
  assert.ok(creation.includes("uml-platform-postgres-data:/var/lib/postgresql/data"));
  assert.ok(creation.includes("127.0.0.1:5432:5432"));
  assert.equal(commands.some(([command]) => command === "start"), false);
});

test("starts a compatible stopped container without creating another one", async () => {
  const commands = [];
  await ensurePostgres({
    probe: probeSequence(refused, ready),
    run: async (_command, args) => {
      commands.push(args);
      return args[0] === "inspect"
        ? { ok: true, stdout: JSON.stringify(compatibleContainer(false)) }
        : { ok: true, stdout: "" };
    },
  });

  assert.deepEqual(commands.at(-1), ["start", "uml-platform-postgres"]);
  assert.equal(commands.some(([command]) => command === "run"), false);
});

test("leaves an incompatible existing container untouched", async () => {
  const commands = [];
  const container = compatibleContainer(false);
  container.Config.Env = ["POSTGRES_DB=another_database"];

  await assert.rejects(
    ensurePostgres({
      probe: async () => refused,
      run: async (_command, args) => {
        commands.push(args);
        return args[0] === "inspect"
          ? { ok: true, stdout: JSON.stringify(container) }
          : { ok: true, stdout: "" };
      },
    }),
    /left untouched so its data is safe/,
  );
  assert.equal(commands.some(([command]) => ["run", "start"].includes(command)), false);
});

test("does not start Docker when another service rejects the database credentials", async () => {
  await assert.rejects(
    ensurePostgres({
      probe: async () => ({ ok: false, code: "28P01", message: "authentication failed" }),
      run: async () => assert.fail("Docker should not be called"),
    }),
    /development database is unavailable: authentication failed/,
  );
});
