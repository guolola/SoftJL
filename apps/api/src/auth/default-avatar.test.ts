// Verifies new accounts receive default avatars while reads and startup preserve saved profiles.
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

test("in-memory accounts receive a default avatar only on creation", () => {
  const store = createInMemoryAuthStore();
  for (const [index, avatarUrl] of [null, customAvatar, DEFAULT_AVATARS[0]].entries()) {
    const user = store.createUser({ username: `avatar_${index}`, displayName: "Avatar", passwordHash: "hash" });
    assert.ok(user);
    assert.ok(DEFAULT_AVATARS.some(avatar => avatar === user.avatarUrl));
    store.updateUser(user.id, { avatarUrl });
    user.updatedAt = originalTimestamp;
    assert.equal(store.getUser(user.id)?.avatarUrl, avatarUrl);
    assert.equal(store.getUser(user.id)?.updatedAt, originalTimestamp);
  }
});

test("PostgreSQL account reads preserve nullable and chosen avatars across restarts", async () => {
  const database = new PGlite();
  try {
    await database.exec(currentSchemaSql);
    const store = createPostgresAuthRepository(database as unknown as Queryable);
    const created = await store.createUser({ username: "new_avatar", displayName: "New", passwordHash: "hash" });
    assert.ok(created);
    assert.ok(DEFAULT_AVATARS.some(avatar => avatar === created.avatarUrl));
    for (const [index, avatarUrl] of [null, customAvatar, DEFAULT_AVATARS[0]].entries()) {
      await database.query(
        `insert into users (id, username, display_name, password_hash, avatar_url, created_at, updated_at)
         values ($1, $1, 'Avatar', 'hash', $2, $3, $3)`,
        [`avatar_${index}`, avatarUrl, originalTimestamp],
      );
    }
    const restarted = createPostgresAuthRepository(database as unknown as Queryable);
    for (const [index, avatarUrl] of [null, customAvatar, DEFAULT_AVATARS[0]].entries()) {
      const user = await restarted.getUser(`avatar_${index}`);
      assert.equal(user?.avatarUrl, avatarUrl);
      assert.equal(user?.updatedAt, originalTimestamp);
    }
  } finally { await database.close(); }
});

test("API startup does not backfill existing nullable avatars", async () => {
  const store = createInMemoryAuthStore();
  const user = store.createUser({ username: "existing_user", displayName: "Existing User", passwordHash: "hash" });
  assert.ok(user);
  store.updateUser(user.id, { avatarUrl: null });
  user.updatedAt = originalTimestamp;
  const persistence = await createApiPersistence({ nodeEnv: "production", overrides: {
    authStore: store,
    providerConfigStore: createProviderConfigStore(),
    runRecordStore: createRunRecordStore(),
    documentLibrary: createFileDocumentLibrary("data/test-avatar-documents"),
  } });
  assert.equal(persistence.pool, null);
  assert.equal(persistence.authStore.getUser(user.id)?.avatarUrl, null);
  assert.equal(persistence.authStore.getUser(user.id)?.updatedAt, originalTimestamp);
});
