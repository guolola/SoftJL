// Defines personal invitation messages and recipient-only inbox actions.
import { z } from "zod";
import { usernameSchema } from "./access/auth-account.js";

export const inboxKindSchema = z.enum(["project", "admin"]);
export const inboxMessageSchema = z.object({
  id: z.string().min(1),
  invitationId: z.string().min(1),
  kind: inboxKindSchema,
  sender: z.object({ username: usernameSchema, displayName: z.string(), avatarUrl: z.string().nullable() }).nullable(),
  project: z.object({ id: z.string(), name: z.string() }).nullable(),
  role: z.string().min(1),
  status: z.enum(["pending", "accepted", "declined", "revoked", "expired"]),
  createdAt: z.string().datetime({ offset: true }),
  unread: z.boolean(),
});
export const inboxResponseSchema = z.object({ messages: z.array(inboxMessageSchema), unreadCount: z.number().int().nonnegative() });
export const inboxRespondRequestSchema = z.object({ decision: z.enum(["accept", "decline"]) }).strict();
export type InboxMessage = z.infer<typeof inboxMessageSchema>;
export type InboxResponse = z.infer<typeof inboxResponseSchema>;

export const adminUserInvitationSchema = z.object({
  id: z.string().min(1), projectId: z.string().min(1), projectName: z.string(),
  inviterUsername: usernameSchema.nullable(), inviteeUsername: usernameSchema,
  role: z.string().min(1), status: z.string().min(1),
  invitedAt: z.string().datetime({ offset: true }).nullable(), joinedAt: z.string().datetime({ offset: true }).nullable(),
});
export const adminUserInvitationsResponseSchema = z.object({ invitations: z.array(adminUserInvitationSchema) });
export type AdminUserInvitation = z.infer<typeof adminUserInvitationSchema>;
