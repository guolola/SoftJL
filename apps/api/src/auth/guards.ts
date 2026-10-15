// Shared auth, project permission, and admin guards for route modules and future admin workers.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AdminRole, ProjectPermission } from "@uml-platform/contracts";
import {
  type AuthStore,
  hasProjectPermission,
  type ProjectMemberRecord,
  type ProjectRecord,
  type SessionRecord,
  type UserRecord,
} from "./in-memory-auth-store.js";
import { readAdminSessionCookie, readSessionCookie } from "./session-cookie.js";

export type AuthContext = {
  user: UserRecord;
  session: SessionRecord;
};

export type ProjectPermissionContext = AuthContext & {
  project: ProjectRecord;
  member: ProjectMemberRecord;
};

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
) {
  return requireAuthWithCookie(request, reply, authStore, readSessionCookie);
}

export async function requireAdminSessionAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
) {
  return requireAuthWithCookie(request, reply, authStore, readAdminSessionCookie);
}

async function requireAuthWithCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
  readCookie: (request: FastifyRequest) => string | null,
) {
  const sessionId = readCookie(request);
  const session = sessionId ? await authStore.getActiveSession(sessionId) : null;
  const user = session ? await authStore.getUser(session.userId) : null;

  if (!session || !user) {
    reply.code(401);
    return { message: "Authentication required" } as const;
  }

  if (user.status !== "active") {
    reply.code(403);
    return { message: "User is not active" } as const;
  }

  return { user, session };
}

export function isAuthError(
  value: AuthContext | { message: string },
): value is { message: string } {
  return "message" in value;
}

export async function requireProjectPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
  projectId: string,
  permission: ProjectPermission,
) {
  const auth = await requireAuth(request, reply, authStore);
  if (isAuthError(auth)) return auth;

  const project = await authStore.getProject(projectId);
  if (!project || project.status === "deleted") {
    reply.code(404);
    return { message: "Project not found" } as const;
  }

  const member = await authStore.findProjectMember(projectId, auth.user.id);
  if (!member || !hasProjectPermission(member.role, permission)) {
    reply.code(403);
    return { message: "Project permission required" } as const;
  }

  return { ...auth, project, member };
}

export function isProjectPermissionError(
  value: ProjectPermissionContext | { message: string },
): value is { message: string } {
  return "message" in value;
}

export async function requireAdminRole(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
  roles: AdminRole[] = ["super_admin"],
) {
  const auth = await requireAdminSessionAuth(request, reply, authStore);
  if (isAuthError(auth)) return auth;

  if (!(await authStore.userHasSystemRole(auth.user.id, roles))) {
    reply.code(403);
    return { message: "Admin role required" } as const;
  }

  return auth;
}
