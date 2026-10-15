// Centralizes admin RBAC derivation so admin routes share one permission and capability contract.
import {
  adminRoleCapabilities,
  adminRoleDataScopes,
  adminRolePermissions,
  type AdminCapability,
  type AdminDataScope,
  type AdminPermission,
  type AdminRole,
} from "@uml-platform/contracts";

export const ADMIN_ROLES: readonly AdminRole[] = [
  "super_admin",
  "system_operator",
  "course_admin",
  "project_admin",
  "auditor",
  "security_admin",
  "model_admin",
  "teacher_assistant",
];

export function getAdminRoles(systemRoles: readonly AdminRole[]) {
  return systemRoles.filter((role) => ADMIN_ROLES.includes(role));
}

export function isAdminRole(role: AdminRole) {
  return ADMIN_ROLES.includes(role);
}

export function hasAnyAdminRole(systemRoles: readonly AdminRole[]) {
  return systemRoles.some(isAdminRole);
}

function uniqueFromRoles<T extends string>(
  roles: readonly AdminRole[],
  valuesByRole: Record<AdminRole, readonly T[]>,
) {
  return Array.from(new Set(roles.flatMap((role) => valuesByRole[role])));
}

export function getAdminPermissions(roles: readonly AdminRole[]): AdminPermission[] {
  return uniqueFromRoles(roles, adminRolePermissions);
}

export function getAdminDataScopes(roles: readonly AdminRole[]): AdminDataScope[] {
  return uniqueFromRoles(roles, adminRoleDataScopes);
}

export function getAdminCapabilities(roles: readonly AdminRole[]): AdminCapability[] {
  return uniqueFromRoles(roles, adminRoleCapabilities);
}

export function buildAdminRbacContext(systemRoles: readonly AdminRole[]) {
  const roles = getAdminRoles(systemRoles);
  return {
    roles,
    permissions: getAdminPermissions(roles),
    dataScopes: getAdminDataScopes(roles),
    mfaRequired: roles.length > 0,
    capabilities: getAdminCapabilities(roles),
  };
}
