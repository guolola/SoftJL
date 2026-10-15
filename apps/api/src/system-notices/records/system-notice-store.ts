// Defines the system notice store contract used by public and admin routes.
import { randomUUID } from "node:crypto";
import {
  systemNoticeDtoSchema,
  type SystemNoticeContentBlock,
  type SystemNoticeCreateRequest,
  type SystemNoticeDto,
  type SystemNoticeStatus,
  type SystemNoticeUpdateRequest,
} from "@uml-platform/contracts";

export type SystemNoticeRecord = Omit<SystemNoticeDto, "unread">;

export interface SystemNoticeStore {
  listAll(): Promise<SystemNoticeRecord[]>;
  listPublished(): Promise<SystemNoticeRecord[]>;
  create(input: SystemNoticeCreateRequest): Promise<SystemNoticeRecord>;
  update(
    id: string,
    input: SystemNoticeUpdateRequest,
  ): Promise<SystemNoticeRecord | null>;
  delete(id: string): Promise<boolean>;
  listReadNoticeIds(userId: string): Promise<Set<string>>;
  markRead(userId: string, noticeIds: string[]): Promise<void>;
}

function nowIso() {
  return new Date().toISOString();
}

export function normalizeNoticePublishedAt(input: {
  status: SystemNoticeStatus;
  publishedAt?: string | null;
}) {
  if (input.status !== "published") return input.publishedAt ?? null;
  return input.publishedAt ?? nowIso();
}

function compareByPublishedAtDesc(
  left: SystemNoticeRecord,
  right: SystemNoticeRecord,
) {
  return (
    (right.publishedAt ?? right.createdAt).localeCompare(
      left.publishedAt ?? left.createdAt,
    ) || right.createdAt.localeCompare(left.createdAt)
  );
}

function parseNotice(record: SystemNoticeRecord) {
  return systemNoticeDtoSchema.omit({ unread: true }).parse(record);
}

export function createInMemorySystemNoticeStore(
  seed: SystemNoticeCreateRequest[] = [],
): SystemNoticeStore {
  const notices = new Map<string, SystemNoticeRecord>();
  const reads = new Map<string, Set<string>>();

  function create(input: SystemNoticeCreateRequest) {
    const createdAt = nowIso();
    const notice = parseNotice({
      id: randomUUID(),
      title: input.title,
      type: input.type,
      icon: input.icon ?? null,
      contentBlocks: input.contentBlocks ?? [],
      status: input.status,
      publishedAt: normalizeNoticePublishedAt(input),
      createdAt,
      updatedAt: createdAt,
    });
    notices.set(notice.id, notice);
    return notice;
  }

  for (const input of seed) {
    create(input);
  }

  return {
    async listAll() {
      return [...notices.values()].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );
    },
    async listPublished() {
      return [...notices.values()]
        .filter((notice) => notice.status === "published")
        .sort(compareByPublishedAtDesc);
    },
    async create(input) {
      return create(input);
    },
    async update(id, input) {
      const existing = notices.get(id);
      if (!existing) return null;
      const nextStatus = input.status ?? existing.status;
      const next = parseNotice({
        ...existing,
        ...input,
        icon: input.icon === undefined ? existing.icon : input.icon,
        contentBlocks:
          input.contentBlocks === undefined
            ? existing.contentBlocks
            : (input.contentBlocks as SystemNoticeContentBlock[]),
        status: nextStatus,
        publishedAt:
          input.publishedAt === undefined && input.status === undefined
            ? existing.publishedAt
            : normalizeNoticePublishedAt({
                status: nextStatus,
                publishedAt:
                  input.publishedAt === undefined
                    ? existing.publishedAt
                    : input.publishedAt,
              }),
        updatedAt: nowIso(),
      });
      notices.set(id, next);
      return next;
    },
    async delete(id) {
      for (const readSet of reads.values()) {
        readSet.delete(id);
      }
      return notices.delete(id);
    },
    async listReadNoticeIds(userId) {
      return new Set(reads.get(userId) ?? []);
    },
    async markRead(userId, noticeIds) {
      const readSet = reads.get(userId) ?? new Set<string>();
      for (const noticeId of noticeIds) {
        if (notices.has(noticeId)) readSet.add(noticeId);
      }
      reads.set(userId, readSet);
    },
  };
}
