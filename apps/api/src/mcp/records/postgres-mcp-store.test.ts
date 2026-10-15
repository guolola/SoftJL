// Runs the actual PostgreSQL SQL in an isolated engine and checks persistence, atomic consume and shared revocation.
import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createPostgresMcpStore } from "./postgres-mcp-store.js";
import { mcpSchemaSql } from "./mcp-schema.js";
import type { Queryable } from "../../db/transactions.js";
import type { McpConnection } from "./mcp-store.js";
import { hasAccountProjectScope } from "./mcp-store.js";
const databaseAdapter = (db: PGlite): Queryable => ({
  async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await db.query<T>(sql, values ? [...values] : []);
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  },
});
test("PostgreSQL migration, shared instances, atomic consumption, expiry and restart persistence", async () => {
  const db = new PGlite();
  await db.exec(
    "create table users (id text primary key); insert into users values ('student');",
  );
  await db.exec(mcpSchemaSql);
  await db.exec(mcpSchemaSql);
  const first = createPostgresMcpStore(databaseAdapter(db));
  const second = createPostgresMcpStore(databaseAdapter(db));
  const connection: McpConnection = {
    id: "grant",
    userId: "student",
    clientId: "agent",
    name: "test",
    kind: "oauth",
    projectScope: "selected",
    projectIds: ["project"],
    tokenHash: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    revokedAt: null,
    lastUsedAt: null,
  };
  await first.putConnection(connection);
  assert.deepEqual(await second.getConnection("grant"), connection);
  const accountToken: McpConnection = { ...connection, id: "account-token", kind: "pat", projectScope: "account", projectIds: [], tokenHash: "account-token-hash" };
  await first.putConnection(accountToken);
  assert.deepEqual(new Set((await second.listConnections("student")).map((c) => c.id)), new Set(["grant", "account-token"]));
  assert.deepEqual(await second.findToken("account-token-hash"), accountToken);
  assert.equal(hasAccountProjectScope(accountToken), true);
  const accountGrant: McpConnection = { ...connection, id: "account-grant", projectScope: "account", projectIds: [] };
  await first.putConnection(accountGrant);
  assert.deepEqual(await second.getConnection(accountGrant.id), accountGrant);
  assert.equal(hasAccountProjectScope(accountGrant), true);
  assert.equal(hasAccountProjectScope(connection), false);
  await first.putEntity({
    model: "AuthorizationCode",
    id: "code",
    payload: { grantId: "grant", uid: "uid", accountId: "student" },
    expiresAt: Date.now() + 60000,
  });
  assert.equal(
    (await second.findEntity("AuthorizationCode", "uid", "uid"))?.accountId,
    "student",
  );
  const consumed = await Promise.allSettled([
    first.consumeEntity("AuthorizationCode", "code"),
    second.consumeEntity("AuthorizationCode", "code"),
  ]);
  assert.equal(
    consumed.filter((result) => result.status === "fulfilled").length,
    1,
  );
  await first.putEntity({
    model: "AuthorizationCode",
    id: "code",
    payload: { grantId: "grant" },
    expiresAt: Date.now() + 60000,
  });
  assert.ok(
    (await second.findEntity("AuthorizationCode", "id", "code"))?.consumed,
  );
  await first.putEntity({
    model: "AccessToken",
    id: "expired",
    payload: {},
    expiresAt: Date.now() - 1000,
  });
  assert.equal(
    await second.findEntity("AccessToken", "id", "expired"),
    undefined,
  );
  const limits = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      (i % 2 ? first : second).takeRateLimit("tool:user", 4, 60),
    ),
  );
  assert.equal(limits.filter(Boolean).length, 4);
  const archive = await db.dumpDataDir();
  await db.close();
  const restarted = await PGlite.create({ loadDataDir: archive });
  try {
    const persisted = createPostgresMcpStore(databaseAdapter(restarted));
    assert.equal((await persisted.getConnection("grant"))?.userId, "student");
    const persistedAccount = await persisted.findToken("account-token-hash");
    assert.ok(persistedAccount);
    assert.equal(hasAccountProjectScope(persistedAccount), true);
    const persistedGrant = await persisted.getConnection(accountGrant.id);
    assert.ok(persistedGrant);
    assert.equal(hasAccountProjectScope(persistedGrant), true);
    assert.ok(
      (await persisted.findEntity("AuthorizationCode", "id", "code"))?.consumed,
    );
    await persisted.revokeGrant("grant");
    assert.ok((await persisted.getConnection("grant"))?.revokedAt);
    assert.equal(
      await persisted.findEntity("AuthorizationCode", "id", "code"),
      undefined,
    );
  } finally {
    await restarted.close();
  }
});
