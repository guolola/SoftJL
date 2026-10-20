// Registers recipient-bound inbox reads and one-time invitation decisions.
import type { FastifyInstance } from "fastify";
import { inboxKindSchema, inboxRespondRequestSchema } from "@uml-platform/contracts";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { isAuthError, requireAuth } from "../../auth/guards.js";
import { listInboxMessages } from "../../inbox/records/inbox-projection.js";
import { createHttpErrorResponse } from "../../server/http-error-response.js";

export function registerInboxRoutes({ app, authStore }: { app: FastifyInstance; authStore: AuthStore }) {
  app.get("/api/inbox", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    return listInboxMessages(authStore, auth.user);
  });

  for (const action of ["respond", "read", "dismiss"] as const) {
    app.post(`/api/inbox/:kind/:id/${action}`, async (request, reply) => {
      const auth = await requireAuth(request, reply, authStore);
      if (isAuthError(auth)) return auth;
      const { kind, id } = request.params as { kind: string; id: string };
      if (!inboxKindSchema.safeParse(kind).success) { reply.code(400); return createHttpErrorResponse(reply); }
      // Resolve through the signed-in user's inbox before any mutation to prevent ID guessing.
      const inbox = await listInboxMessages(authStore, auth.user, true);
      const message = inbox.messages.find(item => item.id === `${kind}:${id}`);
      if (!message) { reply.code(404); return createHttpErrorResponse(reply); }
      if (action === "respond") {
        const input = inboxRespondRequestSchema.safeParse(request.body);
        if (!input.success) { reply.code(400); return createHttpErrorResponse(reply); }
        if (message.status !== "pending") { reply.code(409); return createHttpErrorResponse(reply); }
        const accept = input.data.decision === "accept";
        const result = kind === "project"
          ? await authStore.respondToProjectInvitation(id, auth.user.id, accept)
          : accept ? await authStore.acceptAdminInvitation(id, auth.user.id) : await authStore.declineAdminInvitation(id, auth.user.id);
        if (!result || "error" in result) { reply.code(409); return createHttpErrorResponse(reply); }
        await authStore.recordAuditLog({ actorUserId: auth.user.id, action: `${kind}.invitation.${accept ? "accept" : "decline"}`, targetType: `${kind}_invitation`, targetId: id, outcome: "success" });
      }
      await authStore.recordInboxReceipt(auth.user.id, message.id, action === "dismiss");
      return listInboxMessages(authStore, auth.user);
    });
  }
}
