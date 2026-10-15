// Provides the admin boundary for /api/admin endpoints.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AdminDataScope, AdminPermission, AdminRole } from "@uml-platform/contracts";
import type { AuthStore } from "../auth/in-memory-auth-store.js";
import { isAuthError, requireAdminRole } from "../auth/guards.js";
import {
  ADMIN_ROLES,
  getAdminDataScopes,
  getAdminPermissions,
  getAdminRoles,
} from "./admin-rbac.js";

const LEGACY_ADMIN_ROLES = new Set([
  "admin",
  "super-admin",
  "super_admin",
  "system-admin",
  "security-admin",
  "model-admin",
  "auditor",
]);

export type AdminActor = {
  id: string;
  name: string;
  role: string;
  roles: AdminRole[];
  permissions: AdminPermission[];
  dataScopes: AdminDataScope[];
};

export function getAdminHeaderActor(request: FastifyRequest): AdminActor | null {
  if (process.env.UML_ALLOW_ADMIN_HEADER !== "true") {
    return null;
  }

  const role = String(request.headers["x-uml-admin-role"] ?? "").trim();
  if (!LEGACY_ADMIN_ROLES.has(role)) return null;
  return {
    id: String(request.headers["x-uml-admin-id"] ?? "admin-bootstrap"),
    name: String(request.headers["x-uml-admin-name"] ?? role),
    role,
    roles: ["super_admin"],
    permissions: getAdminPermissions(["super_admin"]),
    dataScopes: getAdminDataScopes(["super_admin"]),
  };
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
): Promise<AdminActor | { message: string }> {
  const headerActor = getAdminHeaderActor(request);
  if (headerActor) return headerActor;

  const auth = await requireAdminRole(request, reply, authStore, [
    ...ADMIN_ROLES,
  ]);
  if (!isAuthError(auth)) {
    const roles = getAdminRoles(auth.user.systemRoles);
    if (!auth.user.mfaEnabled) {
      reply.code(403);
      return {
        message: "Admin MFA is required before accessing the admin console",
      };
    }
    return {
      id: auth.user.id,
      name: auth.user.displayName,
      role: roles[0] ?? "admin",
      roles,
      permissions: getAdminPermissions(roles),
      dataScopes: getAdminDataScopes(roles),
    };
  }

  reply.code(403);
  return {
    message: "Admin access required",
  };
}

export async function requireAdminPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
  permission: AdminPermission,
): Promise<AdminActor | { message: string }> {
  const actor = await requireAdmin(request, reply, authStore);
  if ("message" in actor) return actor;

  if (!actor.permissions.includes(permission)) {
    reply.code(403);
    return {
      message: `Admin permission required: ${permission}`,
    };
  }

  return actor;
}
