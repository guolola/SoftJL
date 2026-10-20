// Verifies recipient-bound administrator invitation decisions and one-time role grants.
import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryAuthStore } from "./in-memory-auth-store.js";

test("administrator invitations reject duplicates and grant roles only once", async () => {
  const store = createInMemoryAuthStore();
  const inviter = store.createUser({
    username: "owner",
    displayName: "Owner",
    passwordHash: "hash",
    systemRoles: ["super_admin"],
  });
  const invited = store.createUser({
    username: "invitee",
    displayName: "Invitee",
    passwordHash: "hash",
    systemRoles: ["auditor"],
  });
  assert.ok(inviter && invited);
  const created = await store.createAdminInvitation({
    username: "INVITEE",
    role: "model_admin",
    invitedByUserId: inviter.id,
  });
  assert.ok(created);
  assert.equal("tokenHash" in created.invitation, false);
  assert.equal(await store.createAdminInvitation({
    username: "invitee",
    role: "model_admin",
    invitedByUserId: inviter.id,
  }), null);
  const accepted = await store.acceptAdminInvitation(created.invitation.id, invited.id);
  assert.ok(accepted && !("error" in accepted));
  assert.deepEqual(new Set(accepted.user.systemRoles), new Set(["auditor", "model_admin"]));
  assert.equal(await store.acceptAdminInvitation(created.invitation.id, invited.id), null);
});

test("administrator invitation cannot be accepted by a different username", async () => {
  const store = createInMemoryAuthStore();
  const inviter = store.createUser({ username: "owner", displayName: "Owner", passwordHash: "hash" });
  const wrongUser = store.createUser({ username: "wrong", displayName: "Wrong", passwordHash: "hash" });
  assert.ok(inviter && wrongUser);
  const created = await store.createAdminInvitation({
    username: "right",
    role: "system_operator",
    invitedByUserId: inviter.id,
  });
  assert.ok(created);
  const result = await store.acceptAdminInvitation(created.invitation.id, wrongUser.id);
  assert.ok(result && "error" in result);
  assert.equal(result.error, "username_mismatch");
});
