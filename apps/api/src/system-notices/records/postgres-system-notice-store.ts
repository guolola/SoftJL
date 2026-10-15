// Persists system notices and per-user read receipts in PostgreSQL.
import { randomUUID } from "node:crypto";
import {
  systemNoticeDtoSchema,
  type SystemNoticeContentBlock,
  type SystemNoticeCreateRequest,
  type SystemNoticeStatus,
  type SystemNoticeUpdateRequest,
} from "@uml-platform/contracts";
import type { Queryable } from "../../db/transactions.js";
import {
  normalizeNoticePublishedAt,
  type SystemNoticeRecord,
  type SystemNoticeStore,
} from "./system-notice-store.js";

type SystemNoticeRow = {
  id: string;
  title: string;
  notice_type: string;
  icon: string | null;
  content_blocks: SystemNoticeContentBlock[] | string | null;
  status: SystemNoticeStatus;
  published_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function parseContentBlocks(
  value: SystemNoticeRow["content_blocks"],
): SystemNoticeContentBlock[] {
  if (!value) return [];
  if (typeof value === "string") {
    return JSON.parse(value) as SystemNoticeContentBlock[];
  }
  return value;
}

function mapNoticeRow(row: SystemNoticeRow): SystemNoticeRecord {
  return systemNoticeDtoSchema.omit({ unread: true }).parse({
    id: row.id,
    title: row.title,
    type: row.notice_type,
    icon: row.icon,
    contentBlocks: parseContentBlocks(row.content_blocks),
    status: row.status,
    publishedAt: row.published_at ? toIsoString(row.published_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

const noticeColumns = `
  id,
  title,
  notice_type,
  icon,
  content_blocks,
  status,
  published_at,
  created_at,
  updated_at
`;

export function createPostgresSystemNoticeStore(
  db: Queryable,
): SystemNoticeStore {
  return {
    async listAll() {
      const result = await db.query<SystemNoticeRow>(
        `select ${noticeColumns}
         from system_notices
         order by updated_at desc`,
      );
      return result.rows.map(mapNoticeRow);
    },
    async listPublished() {
      const result = await db.query<SystemNoticeRow>(
        `select ${noticeColumns}
         from system_notices
         where status = 'published'
         order by coalesce(published_at, created_at) desc, created_at desc`,
      );
      return result.rows.map(mapNoticeRow);
    },
    async create(input: SystemNoticeCreateRequest) {
      const id = randomUUID();
      const publishedAt = normalizeNoticePublishedAt(input);
      const result = await db.query<SystemNoticeRow>(
        `insert into system_notices (
           id, title, notice_type, icon, content_blocks, status, published_at
         )
         values ($1, $2, $3, $4, $5::jsonb, $6, $7)
         returning ${noticeColumns}`,
        [
          id,
          input.title,
          input.type,
          input.icon ?? null,
          JSON.stringify(input.contentBlocks ?? []),
          input.status,
          publishedAt,
        ],
      );
      return mapNoticeRow(result.rows[0]);
    },
    async update(id: string, input: SystemNoticeUpdateRequest) {
      const currentResult = await db.query<SystemNoticeRow>(
        `select ${noticeColumns} from system_notices where id = $1`,
        [id],
      );
      const current = currentResult.rows[0];
      if (!current) return null;
      const currentNotice = mapNoticeRow(current);
      const nextStatus = input.status ?? currentNotice.status;
      const publishedAt =
        input.publishedAt === undefined && input.status === undefined
          ? currentNotice.publishedAt
          : normalizeNoticePublishedAt({
              status: nextStatus,
              publishedAt:
                input.publishedAt === undefined
                  ? currentNotice.publishedAt
                  : input.publishedAt,
            });
      const result = await db.query<SystemNoticeRow>(
        `update system_notices
         set title = $2,
             notice_type = $3,
             icon = $4,
             content_blocks = $5::jsonb,
             status = $6,
             published_at = $7,
             updated_at = now()
         where id = $1
         returning ${noticeColumns}`,
        [
          id,
          input.title ?? currentNotice.title,
          input.type ?? currentNotice.type,
          input.icon === undefined ? currentNotice.icon : input.icon,
          JSON.stringify(input.contentBlocks ?? currentNotice.contentBlocks),
          nextStatus,
          publishedAt,
        ],
      );
      return result.rows[0] ? mapNoticeRow(result.rows[0]) : null;
    },
    async delete(id: string) {
      const result = await db.query(
        `delete from system_notices where id = $1`,
        [id],
      );
      return (result.rowCount ?? 0) > 0;
    },
    async listReadNoticeIds(userId: string) {
      const result = await db.query<{ notice_id: string }>(
        `select notice_id from system_notice_reads where user_id = $1`,
        [userId],
      );
      return new Set(result.rows.map((row) => row.notice_id));
    },
    async markRead(userId: string, noticeIds: string[]) {
      if (noticeIds.length === 0) return;
      await db.query(
        `insert into system_notice_reads (user_id, notice_id, read_at)
         select $1, unnest($2::text[]), now()
         on conflict (user_id, notice_id)
         do update set read_at = excluded.read_at`,
        [userId, noticeIds],
      );
    },
  };
}
