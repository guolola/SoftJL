// Registers public read and admin configuration routes for system notices.
import type { FastifyInstance } from "fastify";
import { systemNoticeCreateRequestSchema, systemNoticeDtoSchema, systemNoticeListResponseSchema, systemNoticeReadRequestSchema, systemNoticeUpdateRequestSchema, } from "@uml-platform/contracts";
import { isAuthError, requireAuth } from "../../auth/guards.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import {} from "../../security/admin-guard.js";
import type { SystemNoticeRecord, SystemNoticeStore, } from "../../system-notices/records/system-notice-store.js";
function noticeDto(notice: SystemNoticeRecord, readIds?: Set<string>) {
    return systemNoticeDtoSchema.parse({
        ...notice,
        unread: readIds ? !readIds.has(notice.id) : undefined,
    });
}
function noticeListResponse({ notices, readIds, }: {
    notices: SystemNoticeRecord[];
    readIds?: Set<string>;
}) {
    const dtoNotices = notices.map((notice) => noticeDto(notice, readIds));
    return systemNoticeListResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        notices: dtoNotices,
        unreadCount: readIds
            ? dtoNotices.filter((notice) => notice.unread).length
            : 0,
    });
}
async function recordSystemNoticeAudit(authStore: AuthStore, input: {
    actorUserId: string;
    action: string;
    targetId: string | null;
    outcome: "success" | "failure";
    message: string;
}) {
    await authStore.recordAuditLog({
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: "system_notice",
        targetId: input.targetId,
        outcome: input.outcome,
        message: input.message,
    });
}
export function registerSystemNoticeRoutes({ app, authStore, systemNotices, }: {
    app: FastifyInstance;
    authStore: AuthStore;
    systemNotices: SystemNoticeStore;
}) {
    app.get("/api/system-notices", async (request, reply) => {
        const auth = await requireAuth(request, reply, authStore);
        if (isAuthError(auth))
            return auth;
        const [notices, readIds] = await Promise.all([
            systemNotices.listPublished(),
            systemNotices.listReadNoticeIds(auth.user.id),
        ]);
        return noticeListResponse({ notices, readIds });
    });
    app.post("/api/system-notices/read", async (request, reply) => {
        const auth = await requireAuth(request, reply, authStore);
        if (isAuthError(auth))
            return auth;
        const input = systemNoticeReadRequestSchema.parse(request.body ?? {});
        const published = await systemNotices.listPublished();
        const publishedIds = new Set(published.map((notice) => notice.id));
        const noticeIds = input.noticeIds && input.noticeIds.length > 0
            ? input.noticeIds.filter((id) => publishedIds.has(id))
            : [...publishedIds];
        await systemNotices.markRead(auth.user.id, noticeIds);
        const readIds = await systemNotices.listReadNoticeIds(auth.user.id);
        return noticeListResponse({ notices: published, readIds });
    });
}
