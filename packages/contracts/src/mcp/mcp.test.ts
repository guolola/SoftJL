// Verifies bounded tool inputs and secret-free local association records.
import assert from "node:assert/strict";
import test from "node:test";
import {
  mcpAssociationSchema,
  mcpArtifactInputSchema,
  mcpTokenCreateSchema,
  mcpContextInputSchema,
  mcpConsentSchema,
} from "./index.js";
test("whole-project defaults and account-wide or explicitly scoped personal tokens", () => {
  assert.deepEqual(mcpContextInputSchema.parse({ projectId: "p" }).scope, {
    requirementIds: [],
    artifactIds: [],
  });
  assert.equal(
    mcpTokenCreateSchema.safeParse({ name: "token", projectIds: [] }).success,
    false,
  );
  assert.deepEqual(mcpTokenCreateSchema.parse({ name: "account-token", projectScope: "account" }), {
    name: "account-token",
    projectScope: "account", projectIds: [],
    expiresInDays: 30,
  });
  assert.equal(
    mcpTokenCreateSchema.parse({ name: "token", projectIds: ["p"] })
      .expiresInDays,
    30,
  );
  assert.equal(
    mcpArtifactInputSchema.safeParse({ projectId: "p", artifactId: "a" })
      .success,
    false,
  );
});
test("OAuth account consent requires CSRF but no project selection", () => {
  assert.deepEqual(mcpConsentSchema.parse({ csrf: "csrf", projectScope: "account" }), { csrf: "csrf", projectScope: "account", projectIds: [] });
  assert.equal(mcpConsentSchema.safeParse({}).success, false);
  assert.equal(mcpConsentSchema.safeParse({ csrf: "" }).success, false);
  assert.equal(mcpConsentSchema.safeParse({ csrf: "csrf", projectIds: ["p"] }).success, true);
});
test("association rejects credentials and private extra fields", () => {
  const association = {
    version: 1,
    serverUrl: "https://example.com/api/mcp",
    projectId: "p",
    scope: {},
    appliedManifest: [],
  };
  assert.ok(mcpAssociationSchema.safeParse(association).success);
  assert.equal(
    mcpAssociationSchema.safeParse({ ...association, token: "private" })
      .success,
    false,
  );
  for (const url of [
    "https://secret@example.com/api/mcp",
    "https://example.com/api/mcp?token=secret",
  ])
    assert.equal(
      mcpAssociationSchema.safeParse({ ...association, serverUrl: url })
        .success,
      false,
    );
});
