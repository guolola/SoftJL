// Verifies one-time administrator invitation role grants without exposing stored tokens.
import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryAuthStore } from "./in-memory-auth-store.js";

test("administrator invitations hash tokens, reject duplicates, and merge roles", async () => {
  const store = createInMemoryAuthStore();
  const inviter = store.createUser({
    email: "owner@example.com",
    displayName: "Owner",
    passwordHash: "hash",
    systemRoles: ["super_admin"],
  });
  const invited = store.createUser({
    email: "invitee@example.com",
    displayName: "Invitee",
    passwordHash: "hash",
    systemRoles: ["auditor"],
  });
  assert.ok(inviter && invited);
  const created = await store.createAdminInvitation({
    email: "INVITEE@example.com",
    role: "model_admin",
    invitedByUserId: inviter.id,
  });
  assert.ok(created);
  assert.equal("tokenHash" in created.invitation, false);
  assert.equal(await store.createAdminInvitation({
    email: "invitee@example.com",
    role: "model_admin",
    invitedByUserId: inviter.id,
  }), null);
  const accepted = await store.acceptAdminInvitation(created.token, invited.id);
  assert.ok(accepted && !("error" in accepted));
  assert.deepEqual(new Set(accepted.user.systemRoles), new Set(["auditor", "model_admin"]));
  assert.equal(await store.acceptAdminInvitation(created.token, invited.id), null);
});

test("administrator invitation cannot be accepted by a different email", async () => {
  const store = createInMemoryAuthStore();
  const inviter = store.createUser({ email: "owner@example.com", displayName: "Owner", passwordHash: "hash" });
  const wrongUser = store.createUser({ email: "wrong@example.com", displayName: "Wrong", passwordHash: "hash" });
  assert.ok(inviter && wrongUser);
  const created = await store.createAdminInvitation({
    email: "right@example.com",
    role: "system_operator",
    invitedByUserId: inviter.id,
  });
  assert.ok(created);
  const result = await store.acceptAdminInvitation(created.token, wrongUser.id);
  assert.ok(result && "error" in result);
  assert.equal(result.error, "email_mismatch");
});
