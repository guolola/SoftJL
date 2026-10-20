// Registers authenticated notice reads and personal read/dismiss receipts.
import { createHttpErrorResponse } from "../../server/http-error-response.js";
import type { FastifyInstance } from "fastify";
import {
  systemNoticeReadRequestSchema,
} from "@uml-platform/contracts";
import { isAuthError, requireAuth } from "../../auth/guards.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { listUserNotices } from "../../system-notices/records/user-notice-feed.js";
import type {
  SystemNoticeStore,
} from "../../system-notices/records/system-notice-store.js";

export function registerSystemNoticeRoutes({
  app,
  authStore,
  systemNotices,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
  systemNotices: SystemNoticeStore;
}) {
  app.get("/api/system-notices", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    return listUserNotices(authStore, systemNotices, auth.user.id);
  });

  app.post("/api/system-notices/read", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const input = systemNoticeReadRequestSchema.parse(request.body ?? {});
    const published = await systemNotices.listPublished();
    const publishedIds = new Set(published.map((notice) => notice.id));
    const noticeIds =
      input.noticeIds && input.noticeIds.length > 0
        ? input.noticeIds.filter((id) => publishedIds.has(id))
        : [...publishedIds];
    await systemNotices.markRead(auth.user.id, noticeIds);
    return listUserNotices(authStore, systemNotices, auth.user.id);
  });

  app.post("/api/system-notices/:id/dismiss", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const { id } = request.params as { id: string };
    if (!(await systemNotices.listPublished()).some(notice => notice.id === id)) {
      reply.code(404);
      return createHttpErrorResponse(reply);
    }
    // This records only the authenticated user's dismissal; the published notice remains intact.
    await authStore.recordInboxReceipt(auth.user.id, `notice:${id}`, true);
    return listUserNotices(authStore, systemNotices, auth.user.id);
  });
}
