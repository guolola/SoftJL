// Centralizes project membership checks for project-scoped document routes.
import { createHttpErrorResponse } from "../../server/http-error-response.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  ProjectPermission,
} from "@uml-platform/contracts";
import {
  type DocumentProjectContext,
  type DocumentProjectMembershipGuard,
  type DocumentUserResolver,
} from "./document-workspace-auth.js";

async function projectContextFromPath(
  request: FastifyRequest,
  projectId: string,
  permission: ProjectPermission,
  resolveUserId: DocumentUserResolver,
) {
  const userId = await resolveUserId(request);
  if (!userId) return "missing-project-context" as const;
  return { projectId, userId, permission };
}

export async function requireProjectMembership(
  request: FastifyRequest,
  reply: FastifyReply,
  projectMembershipGuard: DocumentProjectMembershipGuard,
  context: DocumentProjectContext,
) {
  if (!(await projectMembershipGuard(context, request))) {
    reply.code(403);
    return createHttpErrorResponse(reply);
  }
  return context;
}

export function isProjectAccessError(
  value: unknown,
): value is ReturnType<typeof createHttpErrorResponse> {
  return Boolean(value && typeof value === "object" && "error" in value);
}

export async function requireProjectAccessFromPath({
  request,
  reply,
  projectId,
  projectMembershipGuard,
  permission,
  resolveUserId,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  projectId: string;
  projectMembershipGuard: DocumentProjectMembershipGuard;
  permission: ProjectPermission;
  resolveUserId: DocumentUserResolver;
}) {
  const context = await projectContextFromPath(
    request,
    projectId,
    permission,
    resolveUserId,
  );
  if (context === "missing-project-context") {
    reply.code(401);
    return createHttpErrorResponse(reply);
  }
  return requireProjectMembership(
    request,
    reply,
    projectMembershipGuard,
    context,
  );
}
