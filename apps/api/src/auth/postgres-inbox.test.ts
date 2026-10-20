// Exercises invitation persistence and inbox receipts against the real current SQL schema.
import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { currentSchemaSql } from "../db/current-schema.js";
import type { Queryable } from "../db/transactions.js";
import { listInboxMessages } from "../inbox/records/inbox-projection.js";
import type { AuthStore } from "./in-memory-auth-store.js";
import { createPostgresAuthRepository } from "./postgres-auth-repository.js";
import { createPostgresSystemNoticeStore } from "../system-notices/records/postgres-system-notice-store.js";
import { listUserNotices } from "../system-notices/records/user-notice-feed.js";

test("PostgreSQL inbox persists recipient decisions, read state and resent invitations", async () => {
  const database = new PGlite();
  try {
    await database.exec(currentSchemaSql);
    const store = createPostgresAuthRepository(database as unknown as Queryable);
    const owner = (await store.createUser({ username: "owner", displayName: "Owner", passwordHash: "hash" }))!;
    const recipient = (await store.createUser({ username: "recipient", displayName: "Recipient", passwordHash: "hash" }))!;
    const stranger = (await store.createUser({ username: "stranger", displayName: "Stranger", passwordHash: "hash" }))!;
    const { project } = await store.createProject({ ownerUserId: owner.id, name: "Inbox project", description: null, visibility: "private", projectMode: "standard" });
    const member = await store.createMember({ projectId: project.id, userId: recipient.id, username: recipient.username, displayName: recipient.displayName, role: "editor", status: "invited", invitedByUserId: owner.id, invitedAt: new Date().toISOString(), joinedAt: null });
    const inbox = () => listInboxMessages(store as unknown as AuthStore, recipient);
    assert.equal((await inbox()).unreadCount, 1);
    assert.deepEqual((await listInboxMessages(store as unknown as AuthStore, stranger)).messages, []);
    await store.recordInboxReceipt(recipient.id, `project:${member.id}`, true);
    assert.deepEqual((await inbox()).messages, []);
    await store.refreshProjectInvitation(member.id);
    assert.equal((await inbox()).unreadCount, 1);
    assert.equal(await store.respondToProjectInvitation(member.id, stranger.id, true), null);
    assert.equal((await store.respondToProjectInvitation(member.id, recipient.id, true))?.status, "active");
    assert.equal(await store.respondToProjectInvitation(member.id, recipient.id, false), null);
    await store.recordInboxReceipt(recipient.id, `project:${member.id}`);
    const restarted = createPostgresAuthRepository(database as unknown as Queryable);
    const persisted = await listInboxMessages(restarted as unknown as AuthStore, recipient);
    assert.equal(persisted.messages[0]?.status, "accepted");
    assert.equal(persisted.unreadCount, 0);
    const invitation = (await store.createAdminInvitation({ username: recipient.username, role: "auditor", invitedByUserId: owner.id }))!;
    assert.equal((await store.acceptAdminInvitation(invitation.invitation.id, stranger.id))?.error, "username_mismatch");
    const accepted = await store.acceptAdminInvitation(invitation.invitation.id, recipient.id);
    assert.ok(accepted && "user" in accepted);
    assert.deepEqual(accepted.user.systemRoles, ["auditor"]);
    assert.equal(await store.acceptAdminInvitation(invitation.invitation.id, recipient.id), null);
    assert.equal((await inbox()).messages.find(message => message.kind === "admin")?.status, "accepted");
    const noticeStore = createPostgresSystemNoticeStore(database as unknown as Queryable);
    const notice = await noticeStore.create({ title: "Persistent announcement", type: "feature_update", status: "published", icon: null, publishedAt: null, contentBlocks: [] });
    await store.recordInboxReceipt(recipient.id, `notice:${notice.id}`, true);
    const restartedNotices = createPostgresSystemNoticeStore(database as unknown as Queryable);
    assert.equal((await listUserNotices(restarted as unknown as AuthStore, restartedNotices, recipient.id)).notices.length, 0);
    assert.equal((await listUserNotices(restarted as unknown as AuthStore, restartedNotices, stranger.id)).notices.length, 1);
    assert.equal((await restartedNotices.listPublished()).length, 1);
  } finally { await database.close(); }
});
