// Owns run route access context, project permission checks, and run metadata assembly.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ProjectPermission } from "@uml-platform/contracts";
import type {
  RunRecord,
  RunRecordMetadata,
} from "../../runs/records/run-record-store.js";

export interface RunAccessContext {
  userId?: string;
  projectId?: string;
  email?: string | null;
}

export interface RunAccessGuard {
  resolveRunAccess(request: FastifyRequest): Promise<RunAccessContext>;
  canAccessProject(input: {
    request: FastifyRequest;
    userId: string;
    projectId: string;
    permission: ProjectPermission;
    access: RunAccessContext;
  }): Promise<boolean>;
}

function stringHeader(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const defaultRunAccessGuard: RunAccessGuard = {
  async resolveRunAccess(request) {
    return {
      userId: stringHeader(request, "x-uml-user-id"),
      projectId: stringHeader(request, "x-uml-project-id"),
    };
  },
  async canAccessProject({ projectId, access }) {
    // Placeholder project guard until the real auth/project membership layer lands.
    return access.projectId === projectId;
  },
};

function projectIdFromRequestBody(body: unknown) {
  if (!body || typeof body !== "object" || !("projectId" in body)) {
    return undefined;
  }
  const projectId = (body as { projectId?: unknown }).projectId;
  return typeof projectId === "string" && projectId.trim()
    ? projectId.trim()
    : undefined;
}

export function runAccessDeniedMessage(reply: FastifyReply) {
  return {
    message:
      reply.statusCode === 401
        ? "Authentication required"
        : "Project access denied",
  };
}

export async function canReadProjectRuns(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  runAccessGuard: RunAccessGuard,
) {
  const access = await runAccessGuard.resolveRunAccess(request);
  if (!access.userId) {
    reply.code(401);
    return false;
  }
  const allowed = await runAccessGuard.canAccessProject({
    request,
    userId: access.userId,
    projectId,
    permission: "view_runs",
    access,
  });
  if (!allowed) {
    reply.code(403);
    return false;
  }
  return true;
}

export async function resolveProjectRunPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  permission: ProjectPermission,
  runAccessGuard: RunAccessGuard,
) {
  const access = await runAccessGuard.resolveRunAccess(request);
  if (!access.userId) {
    reply.code(401);
    return null;
  }
  const allowed = await runAccessGuard.canAccessProject({
    request,
    userId: access.userId,
    projectId,
    permission,
    access,
  });
  if (!allowed) {
    reply.code(403);
    return null;
  }
  return access;
}

export async function metadataForStartedRun(
  request: FastifyRequest,
  reply: FastifyReply,
  runAccessGuard: RunAccessGuard,
  permission: ProjectPermission,
): Promise<RunRecordMetadata | null | undefined> {
  const access = await runAccessGuard.resolveRunAccess(request);
  const projectId = projectIdFromRequestBody(request.body) ?? access.projectId;
  const userId = access.userId;

  if (projectId) {
    if (!userId) {
      reply.code(401);
      return null;
    }
    if (
      !(await runAccessGuard.canAccessProject({
        request,
        userId,
        projectId,
        permission,
        access,
      }))
    ) {
      reply.code(403);
      return null;
    }
  }

  if (!userId && !projectId) {
    reply.code(401);
    return null;
  }
  return {
    userId,
    projectId,
    createdAt: new Date().toISOString(),
  };
}

export async function canReadRunRecord(
  request: FastifyRequest,
  reply: FastifyReply,
  record: RunRecord,
  runAccessGuard: RunAccessGuard,
  permission: ProjectPermission,
) {
  const metadata = record.metadata;
  if (!metadata?.userId && !metadata?.projectId) {
    reply.code(401).send({ message: "Authentication required" });
    return false;
  }

  const access = await runAccessGuard.resolveRunAccess(request);
  if (!access.userId) {
    reply.code(401).send({ message: "Authentication required" });
    return false;
  }

  if (metadata.projectId) {
    const allowed = await runAccessGuard.canAccessProject({
      request,
      userId: access.userId,
      projectId: metadata.projectId,
      permission,
      access,
    });
    if (!allowed) {
      reply.code(403).send({ message: "Project access denied" });
      return false;
    }
    return true;
  }

  if (metadata.userId !== access.userId) {
    reply.code(403).send({ message: "Run access denied" });
    return false;
  }
  return true;
}
