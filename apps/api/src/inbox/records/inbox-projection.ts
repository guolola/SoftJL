// Projects persisted invitations into a private inbox without exposing invitation tokens.
import { inboxResponseSchema, type InboxMessage } from "@uml-platform/contracts";
import type { AuthStore, UserRecord } from "../../auth/in-memory-auth-store.js";

export async function listInboxMessages(authStore: AuthStore, user: UserRecord, includeDismissed = false) {
  const [members, adminInvitations, receipts] = await Promise.all([
    authStore.listMemberInvitations(user.id), authStore.listAdminInvitations(), authStore.listInboxReceipts(user.id),
  ]);
  const receiptById = new Map(receipts.map(receipt => [receipt.messageId, receipt]));
  const sender = async (id: string | null) => {
    const actor = id ? await authStore.getUser(id) : null;
    return actor ? { username: actor.username, displayName: actor.displayName, avatarUrl: actor.avatarUrl } : null;
  };
  const messages: InboxMessage[] = [];
  for (const member of members) {
    if (member.invitedByUserId === user.id || !member.invitedAt) continue;
    const project = await authStore.getProject(member.projectId);
    if (!project || project.status === "deleted") continue;
    const status = member.status === "active" ? "accepted" : member.status === "invited"
      ? Date.parse(member.invitedAt) <= Date.now() - 7 * 86400000 ? "expired" : "pending"
      : member.status === "declined" ? "declined" : "revoked";
    const id = `project:${member.id}`;
    messages.push({ id, invitationId: member.id, kind: "project", sender: await sender(member.invitedByUserId), project: { id: project.id, name: project.name }, role: member.role, status, createdAt: member.invitedAt, unread: !receiptById.has(id) });
  }
  for (const invitation of adminInvitations.filter(item => item.username === user.username)) {
    const id = `admin:${invitation.id}`;
    messages.push({ id, invitationId: invitation.id, kind: "admin", sender: await sender(invitation.invitedByUserId), project: null, role: invitation.role, status: invitation.status, createdAt: invitation.updatedAt, unread: !receiptById.has(id) });
  }
  const visible = messages.filter(message => includeDismissed || !receiptById.get(message.id)?.dismissedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return inboxResponseSchema.parse({ messages: visible, unreadCount: visible.filter(message => message.unread).length });
}
