// Covers username invitation validation, private inbox decisions, receipts and admin scope.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { registerProjectRoutes } from "../projects/register-project-routes.js";
import { registerInboxRoutes } from "./register-inbox-routes.js";

async function setup() {
  const app = Fastify(), authStore = createInMemoryAuthStore();
  const owner = authStore.createUser({ username: "owner", displayName: "Owner", passwordHash: "hash", systemRoles: ["super_admin"] })!;
  authStore.updateUser(owner.id, { mfaEnabled: true });
  const invitee = authStore.createUser({ username: "invitee", displayName: "Invitee", passwordHash: "hash" })!;
  const stranger = authStore.createUser({ username: "stranger", displayName: "Stranger", passwordHash: "hash" })!;
  const { project } = authStore.createProject({ ownerUserId: owner.id, name: "私有项目", description: null });
  const cookie = (userId: string) => `uml_session=${authStore.createSession({ userId, ipAddress: null, userAgent: null }).id}`;
  const ownerCookie = cookie(owner.id), inviteeCookie = cookie(invitee.id), strangerCookie = cookie(stranger.id);
  registerProjectRoutes({ app, authStore }); registerInboxRoutes({ app, authStore });
  return { app, authStore, owner, invitee, stranger, project, ownerCookie, inviteeCookie, strangerCookie };
}

test("username invitations reject invalid, self and unregistered accounts before writing", async () => {
  const ctx = await setup();
  try {
    for (const [body, code] of [
      [{ username: "bad@name", role: "viewer" }, "VALIDATION_FAILED"],
      [{ email: "old@example.com", role: "viewer" }, "VALIDATION_FAILED"],
      [{ username: " Owner ", role: "viewer" }, "PROJECT_INVITATION_SELF"],
      [{ username: "missing", role: "viewer" }, "PROJECT_INVITATION_USER_NOT_REGISTERED"],
    ] as const) {
      const response = await ctx.app.inject({ method: "POST", url: `/api/projects/${ctx.project.id}/invitations`, headers: { cookie: ctx.ownerCookie }, payload: body });
      assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, code);
      assert.equal(ctx.authStore.listProjectMembers(ctx.project.id).length, 1);
    }
  } finally { await ctx.app.close(); }
});

test("only the recipient can read and accept a project invitation once", async () => {
  const ctx = await setup();
  try {
    const created = await ctx.app.inject({ method: "POST", url: `/api/projects/${ctx.project.id}/invitations`, headers: { cookie: ctx.ownerCookie }, payload: { username: " Invitee ", role: "editor" } });
    assert.equal(created.statusCode, 201); const id = created.json().invitation.id;
    assert.equal(created.json().invitation.username, "invitee"); assert.equal("devToken" in created.json(), false);
    assert.equal(ctx.authStore.findProjectMember(ctx.project.id, ctx.invitee.id), null);
    const duplicate = await ctx.app.inject({ method: "POST", url: `/api/projects/${ctx.project.id}/invitations`, headers: { cookie: ctx.ownerCookie }, payload: { username: "invitee" } });
    assert.equal(duplicate.statusCode, 409);
    const inbox = await ctx.app.inject({ method: "GET", url: "/api/inbox", headers: { cookie: ctx.inviteeCookie } });
    assert.equal(inbox.json().messages.length, 1); assert.equal(inbox.json().unreadCount, 1);
    const stranger = await ctx.app.inject({ method: "GET", url: "/api/inbox", headers: { cookie: ctx.strangerCookie } });
    assert.deepEqual(stranger.json().messages, []);
    const denied = await ctx.app.inject({ method: "POST", url: `/api/inbox/project/${id}/respond`, headers: { cookie: ctx.strangerCookie }, payload: { decision: "accept" } });
    assert.equal(denied.statusCode, 404);
    const accepted = await ctx.app.inject({ method: "POST", url: `/api/inbox/project/${id}/respond`, headers: { cookie: ctx.inviteeCookie }, payload: { decision: "accept" } });
    assert.equal(accepted.statusCode, 200); assert.equal(accepted.json().unreadCount, 0);
    assert.equal(ctx.authStore.findProjectMember(ctx.project.id, ctx.invitee.id)?.role, "editor");
    const reused = await ctx.app.inject({ method: "POST", url: `/api/inbox/project/${id}/respond`, headers: { cookie: ctx.inviteeCookie }, payload: { decision: "decline" } });
    assert.equal(reused.statusCode, 409);
    await ctx.app.inject({ method: "POST", url: `/api/inbox/project/${id}/dismiss`, headers: { cookie: ctx.inviteeCookie } });
    const dismissed = await ctx.app.inject({ method: "GET", url: "/api/inbox", headers: { cookie: ctx.inviteeCookie } });
    assert.deepEqual(dismissed.json().messages, []);
  } finally { await ctx.app.close(); }
});

test("decline and revoke preserve administrator-visible history without granting project access", async () => {
  const ctx = await setup();
  try {
    const created = await ctx.app.inject({ method: "POST", url: `/api/projects/${ctx.project.id}/invitations`, headers: { cookie: ctx.ownerCookie }, payload: { username: "invitee" } });
    const id = created.json().invitation.id;
    const declined = await ctx.app.inject({ method: "POST", url: `/api/inbox/project/${id}/respond`, headers: { cookie: ctx.inviteeCookie }, payload: { decision: "decline" } });
    assert.equal(declined.statusCode, 200); assert.equal(ctx.authStore.getMember(id)?.status, "declined");
    assert.equal(ctx.authStore.findProjectMember(ctx.project.id, ctx.invitee.id), null);
    assert.equal(ctx.authStore.getMember(id)?.username, "invitee");
    assert.equal(ctx.authStore.findProjectMember(ctx.project.id, ctx.invitee.id), null);
  } finally { await ctx.app.close(); }
});

test("admin invitations are private username-bound messages and grant roles only on acceptance", async () => {
  const ctx = await setup();
  try {
    const created = ctx.authStore.createAdminInvitation({ username: "invitee", role: "auditor", invitedByUserId: ctx.owner.id })!;
    assert.equal("token" in created, false); assert.deepEqual(ctx.invitee.systemRoles, []);
    const denied = await ctx.app.inject({ method: "POST", url: `/api/inbox/admin/${created.invitation.id}/respond`, headers: { cookie: ctx.strangerCookie }, payload: { decision: "accept" } });
    assert.equal(denied.statusCode, 404);
    const accepted = await ctx.app.inject({ method: "POST", url: `/api/inbox/admin/${created.invitation.id}/respond`, headers: { cookie: ctx.inviteeCookie }, payload: { decision: "accept" } });
    assert.equal(accepted.statusCode, 200); assert.deepEqual(ctx.authStore.getUser(ctx.invitee.id)?.systemRoles, ["auditor"]);
    assert.equal(accepted.json().messages[0].status, "accepted");
  } finally { await ctx.app.close(); }
});

test("resending a dismissed project invitation restores the recipient's unread message", async () => {
  const ctx = await setup();
  try {
    const created = await ctx.app.inject({ method: "POST", url: `/api/projects/${ctx.project.id}/invitations`, headers: { cookie: ctx.ownerCookie }, payload: { username: "invitee" } });
    const id = created.json().invitation.id;
    await ctx.app.inject({ method: "POST", url: `/api/inbox/project/${id}/dismiss`, headers: { cookie: ctx.inviteeCookie } });
    assert.deepEqual((await ctx.app.inject({ url: "/api/inbox", headers: { cookie: ctx.inviteeCookie } })).json().messages, []);
    const resent = await ctx.app.inject({ method: "POST", url: `/api/projects/${ctx.project.id}/invitations/${id}/resend`, headers: { cookie: ctx.ownerCookie } });
    assert.equal(resent.statusCode, 200);
    const inbox = (await ctx.app.inject({ url: "/api/inbox", headers: { cookie: ctx.inviteeCookie } })).json();
    assert.equal(inbox.unreadCount, 1);
    assert.equal(inbox.messages[0].invitationId, id);
    assert.equal(inbox.messages[0].status, "pending");
  } finally { await ctx.app.close(); }
});
