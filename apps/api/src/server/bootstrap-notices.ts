// Seeds the requested announcement once for explicitly enabled PostgreSQL demos.
import type { SystemNoticeStore } from "../system-notices/records/system-notice-store.js";
import { demoMcpNotice } from "../system-notices/records/demo-notices.js";

export async function seedDemoNotices(
  store: SystemNoticeStore,
  nodeEnv: string | null,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (nodeEnv === "production" || env.UML_DEMO_NOTICE_SEED !== "true" || !env.DATABASE_URL?.trim()) return;
  // Repeated startup keeps the existing announcement, edits and per-user read receipts.
  if ((await store.listAll()).some(notice => notice.title === demoMcpNotice.title)) return;
  await store.create(demoMcpNotice);
}
