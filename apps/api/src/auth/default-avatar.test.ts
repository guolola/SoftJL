// Verifies existing-account avatar assignment, preservation, and persistence across startup.
import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { DEFAULT_AVATARS } from "@uml-platform/contracts";
import { createInMemoryAuthStore } from "./in-memory-auth-store.js";
import { createPostgresAuthRepository } from "./postgres-auth-repository.js";
import { currentSchemaSql } from "../db/current-schema.js";
import type { Queryable } from "../db/transactions.js";
import { createApiPersistence } from "../server/persistence.js";
import { createProviderConfigStore } from "../provider-configs/provider-config-store.js";
import { createRunRecordStore } from "../runs/records/run-record-store.js";
import { createFileDocumentLibrary } from "../documents/library/document-library.js";

const customAvatar = "https://example.com/custom-avatar.webp";
const originalTimestamp = "2026-01-01T00:00:00.000Z";

test("in-memory avatar assignment fills empty profiles once and preserves chosen images", () => {
  const store = createInMemoryAuthStore();
  for (const [index, avatarUrl] of [null, "", "   ", customAvatar, DEFAULT_AVATARS[0]].entries()) {
    const user = store.createUser({ username: `avatar_${index}`, displayName: "Avatar", passwordHash: "hash" });
    assert.ok(user);
    store.updateUser(user.id, { avatarUrl });
    user.updatedAt = originalTimestamp;
  }
  assert.equal(store.assignMissingDefaultAvatars(), 3);
  const first = store.listUsers().map(user => ({ ...user }));
  for (const user of first.slice(0, 3)) {
    assert.ok(DEFAULT_AVATARS.some(avatar => avatar === user.avatarUrl));
    assert.notEqual(user.updatedAt, originalTimestamp);
  }
  assert.equal(first[3]?.avatarUrl, customAvatar);
  assert.equal(first[3]?.updatedAt, originalTimestamp);
  assert.equal(first[4]?.avatarUrl, DEFAULT_AVATARS[0]);
  assert.equal(first[4]?.updatedAt, originalTimestamp);
  assert.equal(store.assignMissingDefaultAvatars(), 0);
  assert.deepEqual(store.listUsers(), first);
});

test("PostgreSQL avatar assignment persists only empty profiles and is stable across restarts", async () => {
  const database = new PGlite();
  try {
    await database.exec(currentSchemaSql);
    for (const [index, avatarUrl] of [null, "", "   ", customAvatar, DEFAULT_AVATARS[0]].entries()) {
      await database.query(
        `insert into users (id, username, display_name, password_hash, avatar_url, created_at, updated_at)
         values ($1, $1, 'Avatar', 'hash', $2, $3, $3)`,
        [`avatar_${index}`, avatarUrl, originalTimestamp],
      );
    }
    const store = createPostgresAuthRepository(database as unknown as Queryable);
    assert.equal(await store.assignMissingDefaultAvatars(), 3);
    const first = await store.listUsers();
    for (const id of ["avatar_0", "avatar_1", "avatar_2"]) {
      const user = first.find(user => user.id === id)!;
      assert.ok(DEFAULT_AVATARS.some(avatar => avatar === user.avatarUrl));
      assert.notEqual(user.updatedAt, originalTimestamp);
      assert.equal(user.createdAt, originalTimestamp);
    }
    const custom = first.find(user => user.id === "avatar_3")!;
    const preset = first.find(user => user.id === "avatar_4")!;
    assert.equal(custom.avatarUrl, customAvatar);
    assert.equal(custom.updatedAt, originalTimestamp);
    assert.equal(preset.avatarUrl, DEFAULT_AVATARS[0]);
    assert.equal(preset.updatedAt, originalTimestamp);
    const restarted = createPostgresAuthRepository(database as unknown as Queryable);
    assert.equal(await restarted.assignMissingDefaultAvatars(), 0);
    const stable = await restarted.listUsers();
    assert.deepEqual(stable.sort((a, b) => a.id.localeCompare(b.id)), first.sort((a, b) => a.id.localeCompare(b.id)));
  } finally { await database.close(); }
});

test("API persistence assigns existing empty avatars before returning the stores", async () => {
  const store = createInMemoryAuthStore();
  const user = store.createUser({ username: "existing_user", displayName: "Existing User", passwordHash: "hash" });
  assert.ok(user);
  store.updateUser(user.id, { avatarUrl: null });
  const persistence = await createApiPersistence({ nodeEnv: "production", overrides: {
    authStore: store,
    providerConfigStore: createProviderConfigStore(),
    runRecordStore: createRunRecordStore(),
    documentLibrary: createFileDocumentLibrary("data/test-avatar-documents"),
  } });
  assert.equal(persistence.pool, null);
  assert.ok(DEFAULT_AVATARS.some(avatar => avatar === persistence.authStore.getUser(user.id)?.avatarUrl));
});
