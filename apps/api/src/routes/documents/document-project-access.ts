// Centralizes project membership checks for document routes and OnlyOffice access tokens.
import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  DocumentLibraryItem,
  ProjectPermission,
} from "@uml-platform/contracts";
import {
  documentProjectContextFromRequest,
  type DocumentProjectContext,
  type DocumentProjectMembershipGuard,
  type DocumentUserResolver,
} from "./document-workspace-auth.js";

function headerString(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function projectContextFromPath(
  request: FastifyRequest,
  projectId: string,
  permission: ProjectPermission,
  resolveUserId?: DocumentUserResolver,
) {
  const userId = resolveUserId
    ? await resolveUserId(request)
    : headerString(request, "x-uml-user-id");
  if (!userId) return "missing-project-context" as const;
  return { projectId, userId, permission };
}

export async function requireProjectMembership(
  request: FastifyRequest,
  reply: FastifyReply,
  projectMembershipGuard: DocumentProjectMembershipGuard | undefined,
  context: DocumentProjectContext,
) {
  if (!projectMembershipGuard) {
    reply.code(403);
    return { error: { message: "缺少项目权限校验能力" } } as const;
  }
  if (!(await projectMembershipGuard(context, request))) {
    reply.code(403);
    return { error: { message: "无权访问该项目说明书" } } as const;
  }
  return context;
}

export async function requireProjectAccessForDocument({
  request,
  reply,
  document,
  projectMembershipGuard,
  permission,
  resolveUserId,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  document: DocumentLibraryItem;
  projectMembershipGuard?: DocumentProjectMembershipGuard;
  permission: ProjectPermission;
  resolveUserId?: DocumentUserResolver;
}) {
  const requestContext = await documentProjectContextFromRequest(
    request,
    permission,
    resolveUserId,
  );
  if (requestContext === "missing-project-context") {
    reply.code(401);
    return { error: { message: "缺少项目访问凭据" } } as const;
  }

  const documentProjectId = document.projectId ?? null;
  if (!requestContext) {
    reply.code(401);
    return { error: { message: "缺少项目访问凭据" } } as const;
  }
  if (documentProjectId && requestContext.projectId !== documentProjectId) {
    reply.code(403);
    return { error: { message: "说明书不属于当前项目" } } as const;
  }

  return requireProjectMembership(
    request,
    reply,
    projectMembershipGuard,
    requestContext,
  );
}

export function isProjectAccessError(
  value: unknown,
): value is { error: { message: string } } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

export async function requireProjectAccessFromToken({
  request,
  reply,
  document,
  access,
  projectMembershipGuard,
  permission,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  document: DocumentLibraryItem;
  access: { projectId: string | null; userId: string | null };
  projectMembershipGuard?: DocumentProjectMembershipGuard;
  permission: ProjectPermission;
}) {
  const documentProjectId = document.projectId ?? null;
  if (!documentProjectId) return null;
  if (access.projectId !== documentProjectId || !access.userId) {
    reply.code(403);
    return { error: { message: "Document access token project context invalid" } } as const;
  }
  return requireProjectMembership(
    request,
    reply,
    projectMembershipGuard,
    { projectId: access.projectId, userId: access.userId, permission },
  );
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
  projectMembershipGuard?: DocumentProjectMembershipGuard;
  permission: ProjectPermission;
  resolveUserId?: DocumentUserResolver;
}) {
  const context = await projectContextFromPath(
    request,
    projectId,
    permission,
    resolveUserId,
  );
  if (context === "missing-project-context") {
    reply.code(401);
    return { error: { message: "缺少项目访问凭据" } } as const;
  }
  return requireProjectMembership(
    request,
    reply,
    projectMembershipGuard,
    context,
  );
}
