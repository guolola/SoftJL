// Central public contract surface for shared schemas and DTOs consumed by apps and prompt builders.
export {
  adminCapabilitySchema,
  adminDataScopeSchema,
  adminPermissionSchema,
  adminRoleCapabilities,
  adminRoleDataScopes,
  adminRolePermissions,
  adminRoleSchema,
} from "./admin-rbac.js";
export * from "./admin-platform.js";
export type {
  AdminCapability,
  AdminDataScope,
  AdminPermission,
  AdminRole,
} from "./admin-rbac.js";
export * from "./auth-account.js";
export * from "./api-errors.js";
export * from "./dashboard.js";
export * from "./documents.js";
export * from "./fingerprints.js";
export * from "./active-requirement-models.js";
export * from "./design-generation-merge.js";
export * from "./design-source-repair.js";
export * from "./feasibility.js";
export * from "./models.js";
export * from "./model-records.js";
export * from "./model-semantics.js";
export * from "./provider-configs.js";
export * from "./projects.js";
export * from "./requirements.js";
export * from "./requirement-semantics.js";
export * from "./runs.js";
export * from "./render.js";
export * from "./visual-review.js";
export * from "./usecase-participation.js";
export * from "./model-review-profiles.js";
export * from "./system-notices.js";

export * from "./model-json-schema.js";
export * from "./legacy-code-retirement.js";
