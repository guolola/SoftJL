// Projects published announcements into a user's feed using persisted read and dismissal receipts.
import { systemNoticeListResponseSchema } from "@uml-platform/contracts";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import type { SystemNoticeStore } from "./system-notice-store.js";

export async function listUserNotices(authStore: AuthStore, store: SystemNoticeStore, userId: string) {
  const [published, readIds, receipts] = await Promise.all([
    store.listPublished(), store.listReadNoticeIds(userId), authStore.listInboxReceipts(userId),
  ]);
  const dismissed = new Set(receipts.filter(receipt => receipt.dismissedAt).map(receipt => receipt.messageId));
  const notices = published.filter(notice => !dismissed.has(`notice:${notice.id}`))
    .map(notice => ({ ...notice, unread: !readIds.has(notice.id) }));
  return systemNoticeListResponseSchema.parse({
    generatedAt: new Date().toISOString(), notices, unreadCount: notices.filter(notice => notice.unread).length,
  });
}
