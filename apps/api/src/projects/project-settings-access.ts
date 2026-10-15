// Resolves project settings authorization for project route handlers.
import type { FastifyReply, FastifyRequest } from "fastify";
import { isAuthError, requireAuth } from "../auth/guards.js";
import {
  hasProjectPermission,
  type AuthStore,
} from "../auth/in-memory-auth-store.js";

export async function requireProjectSettingsContext(
  request: FastifyRequest,
  reply: FastifyReply,
  authStore: AuthStore,
  projectId: string,
  options: { allowDeleted?: boolean } = {},
) {
  const auth = await requireAuth(request, reply, authStore);
  if (isAuthError(auth)) return auth;
  const project = await authStore.getProject(projectId);
  if (!project || (!options.allowDeleted && project.status === "deleted")) {
    reply.code(404);
    return { message: "Project not found" } as const;
  }
  const member = await authStore.findProjectMember(projectId, auth.user.id);
  if (!member || !hasProjectPermission(member.role, "manage_project_settings")) {
    reply.code(403);
    return { message: "Project permission required" } as const;
  }
  return { ...auth, project, member };
}
