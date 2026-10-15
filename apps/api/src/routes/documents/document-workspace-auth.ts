// Resolves deprecated legacy document workspace credentials from API request headers.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ProjectPermission } from "@uml-platform/contracts";
import type { DocumentLibrary } from "../../documents/library/document-library.js";

const WORKSPACE_ID_HEADER = "x-uml-workspace-id";
const WORKSPACE_SECRET_HEADER = "x-uml-workspace-secret";
const PROJECT_ID_HEADER = "x-uml-project-id";
const USER_ID_HEADER = "x-uml-user-id";

export interface DocumentProjectContext {
  projectId: string;
  userId: string;
  permission: ProjectPermission;
}

export type DocumentUserResolver = (
  request: FastifyRequest,
) => Promise<string | null> | string | null;

export type DocumentProjectMembershipGuard = (
  context: DocumentProjectContext,
  request: FastifyRequest,
) => Promise<boolean> | boolean;

function stringHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function requireDocumentWorkspace(
  request: FastifyRequest,
  reply: FastifyReply,
  documentLibrary: DocumentLibrary,
) {
  const workspaceId = stringHeader(request.headers[WORKSPACE_ID_HEADER]);
  const workspaceSecret = stringHeader(request.headers[WORKSPACE_SECRET_HEADER]);

  if (!workspaceId || !workspaceSecret) {
    reply.code(401);
    return { error: { message: "缺少说明书工作区凭据" } } as const;
  }

  try {
    return await documentLibrary.authenticateWorkspace({
      workspaceId,
      workspaceSecret,
    });
  } catch {
    reply.code(403);
    return { error: { message: "说明书工作区凭据无效" } } as const;
  }
}

export function isWorkspaceAuthError(
  value: unknown,
): value is { error: { message: string } } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

export async function documentProjectContextFromRequest(
  request: FastifyRequest,
  permission: ProjectPermission,
  resolveUserId?: DocumentUserResolver,
) {
  const projectId = stringHeader(request.headers[PROJECT_ID_HEADER]);
  const userId = resolveUserId
    ? (await resolveUserId(request)) ?? undefined
    : stringHeader(request.headers[USER_ID_HEADER]);
  if (!projectId && !userId) return null;
  if (!projectId || !userId) return "missing-project-context" as const;
  return { projectId, userId, permission };
}
