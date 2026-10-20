// Verifies demo-only announcement seeding, persistence and restart behavior.
import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { currentSchemaSql } from "../db/current-schema.js";
import type { Queryable } from "../db/transactions.js";
import { createInMemorySystemNoticeStore } from "../system-notices/records/system-notice-store.js";
import { createPostgresSystemNoticeStore } from "../system-notices/records/postgres-system-notice-store.js";
import { seedDemoNotices } from "./bootstrap-notices.js";

const demoEnv = { UML_DEMO_NOTICE_SEED: "true", DATABASE_URL: "postgres://localhost/demo" };

test("PostgreSQL demo stores the requested MCP announcement once and preserves read state", async () => {
  const database = new PGlite();
  try {
    await database.exec(currentSchemaSql);
    const store = createPostgresSystemNoticeStore(database as unknown as Queryable);
    await seedDemoNotices(store, "development", demoEnv);
    const [notice] = await store.listPublished();
    assert.ok(notice);
    assert.equal(notice.title, "MCP 功能上线啦！连接你的 AI 编程助手");
    assert.equal(notice.type, "feature_update");
    assert.equal(notice.status, "published");
    assert.equal(notice.contentBlocks.length, 7);
    assert.match(notice.contentBlocks[0]!.text, /SoftJL 已开通 MCP 功能/u);
    assert.match(notice.contentBlocks[6]!.text, /当前 MCP 提供只读访问/u);
    await database.exec("insert into users(id, username, display_name, password_hash) values ('reader', 'reader', 'Reader', 'hash')");
    await store.markRead("reader", [notice.id]);
    const restarted = createPostgresSystemNoticeStore(database as unknown as Queryable);
    await seedDemoNotices(restarted, "development", demoEnv);
    assert.equal((await restarted.listAll()).length, 1);
    assert.ok((await restarted.listReadNoticeIds("reader")).has(notice.id));
  } finally { await database.close(); }
});

test("production, ordinary startup and non-PostgreSQL demos never receive mock announcements", async () => {
  const store = createInMemorySystemNoticeStore();
  await seedDemoNotices(store, "production", demoEnv);
  await seedDemoNotices(store, "development", {});
  await seedDemoNotices(store, "development", { UML_DEMO_NOTICE_SEED: "true" });
  assert.deepEqual(await store.listAll(), []);
});
