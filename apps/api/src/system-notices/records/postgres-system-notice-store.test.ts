// Verifies notice persistence accepts only the current JSONB content-block array.
import assert from "node:assert/strict";
import test from "node:test";
import type { Queryable } from "../../db/transactions.js";
import { createPostgresSystemNoticeStore } from "./postgres-system-notice-store.js";

function noticeStore(contentBlocks: unknown) {
  const row = { id: "notice", title: "更新", notice_type: "feature_update", icon: null,
    content_blocks: contentBlocks, status: "published", published_at: "2026-10-26T00:00:00.000Z",
    created_at: "2026-10-26T00:00:00.000Z", updated_at: "2026-10-26T00:00:00.000Z" };
  const db: Queryable = { async query<T>() { return { rows: [row] as T[], rowCount: 1 }; } };
  return { store: createPostgresSystemNoticeStore(db), row };
}

test("notice reads preserve current content blocks", async () => {
  const blocks = [{ kind: "paragraph", text: "当前通知" }];
  const { store } = noticeStore(blocks);
  assert.deepEqual((await store.listAll())[0]!.contentBlocks, blocks);
  assert.deepEqual((await store.listPublished())[0]!.contentBlocks, blocks);
});

test("notice reads reject serialized and missing blocks without replacing stored data", async () => {
  for (const obsolete of [undefined, null, "[]", "", {}]) {
    const { store, row } = noticeStore(obsolete);
    const before = structuredClone(row);
    await assert.rejects(store.listAll(), /contentBlocks/);
    await assert.rejects(store.listPublished(), /contentBlocks/);
    assert.deepEqual(row, before);
  }
});
