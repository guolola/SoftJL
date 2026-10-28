// Central public contract surface for shared schemas and DTOs consumed by apps and prompt builders.
export {
  adminCapabilitySchema,
  adminDataScopeSchema,
  adminPermissionSchema,
  adminRoleCapabilities,
  adminRoleDataScopes,
  adminRolePermissions,
  adminRoleSchema,
} from "./access/admin-rbac.js";
export * from "./access/admin-platform.js";
export type {
  AdminCapability,
  AdminDataScope,
  AdminPermission,
  AdminRole,
} from "./access/admin-rbac.js";
export * from "./access/auth-account.js";
export * from "./access/avatars.js";
export * from "./api-errors.js";
export * from "./dashboard.js";
export * from "./documents.js";
export * from "./fingerprints.js";
export * from "./requirements/active-requirement-models.js";
export * from "./modeling/design-generation-merge.js";
export * from "./feasibility.js";
export * from "./modeling/models.js";
export * from "./modeling/model-records.js";
export * from "./modeling/model-semantics.js";
export * from "./provider-configs.js";
export * from "./workspace/projects.js";
export * from "./workspace/standard-project.js";
export * from "./modeling/modeling-attachments.js";
export * from "./requirements/requirements.js";
export * from "./requirements/requirement-rule-types.js";
export * from "./requirements/requirement-baseline-identity.js";
export * from "./requirements/requirement-baseline-snapshot.js";
export * from "./requirements/requirement-semantics.js";
export * from "./runs/runs.js";
export * from "./runs/run-outputs.js";
export * from "./modeling/render.js";
export * from "./modeling/visual-review.js";
export * from "./modeling/usecase-participation.js";
export * from "./modeling/model-review-profiles.js";
export * from "./system-notices.js";

export * from "./modeling/model-json-schema.js";
export * from "./mcp/index.js";
export * from "./mcp/implementation.js";
export * from "./modeling/model-catalog.js";
export * from "./modeling/design-freshness.js";
export * from "./runs/workspace-run-guard.js";
export * from "./runs/generation-policy.js";
export * from "./workspace/current-workspace.js";

export * from "./inbox.js";
export * from "./prompt-runtime.js";

export { collectModelRefs } from "./modeling/model-element-refs.js";
